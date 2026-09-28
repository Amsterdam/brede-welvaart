import mongoose from 'mongoose';
import { Project, ProjectDocument } from '../models/Project';
import { AuthenticationError, NotFoundError, ValidationError, handleMongoError } from '../lib/errors';
import { defaultAiServiceClient, mapProjectToAiServiceInput } from '../lib/aiServiceClient';
import { logger } from '../lib/logger';
import config from '../config';
import type {
  AiServiceAnalysisResponse,
  AiServiceAuthorResult,
  AiServiceSourceResult,
  AiServiceTalkingPoint,
} from '../lib/aiServiceClient';
import type { AppContext } from '@shared/types';

const METHOD_EXPLANATION =
  'Deze AI-ondersteunde verkenning zoekt in beschikbare bronnen naar relevante perspectieven, experts en bespreekpunten. De uitkomst is een startpunt voor beoordeling door de gebruiker en vervangt geen inhoudelijke afweging.';

const AI_ANALYSIS_ERROR_MESSAGE = 'De AI-verkenning is niet gelukt. Probeer het later opnieuw.';
const AI_ANALYSIS_STALE_ERROR_MESSAGE =
  'De AI-verkenning is onverwacht gestopt. Start de verkenning opnieuw.';

// A RUNNING analysis is driven by an in-process task; if the backend restarts
// or crashes mid-run, nothing ever writes its final status and the entry stays
// RUNNING forever (the client polls indefinitely). The task itself can never
// outlive the AI-service request timeout, so any RUNNING entry older than that
// timeout plus a buffer is definitively orphaned and surfaced as a retryable
// failure rather than a perpetual spinner.
const AI_ANALYSIS_STALE_AFTER_MS = config.aiService.timeoutMs + 60_000;

const withStaleRunningAsFailed = <T extends { status?: string; startedAt?: unknown }>(
  analysis: T
): T => {
  if (analysis.status !== 'RUNNING') return analysis;

  const startedAt = analysis.startedAt ? new Date(analysis.startedAt as string).getTime() : NaN;
  if (Number.isNaN(startedAt) || Date.now() - startedAt < AI_ANALYSIS_STALE_AFTER_MS) {
    return analysis;
  }

  return { ...analysis, status: 'FAILED', errorMessage: AI_ANALYSIS_STALE_ERROR_MESSAGE };
};

// Canonical analysis phases, in order, matching the ai-service `_analysis_phases`
// (with all features requested). The frontend maps these keys to Dutch labels.
const AI_ANALYSIS_PHASES = ['prepare', 'sources', 'authors', 'talking_points', 'finalize'] as const;
type AiAnalysisPhaseStatus = 'PENDING' | 'RUNNING' | 'DONE';

const buildProgress = (statusByKey: Record<string, AiAnalysisPhaseStatus>) => ({
  phases: AI_ANALYSIS_PHASES.map((key) => ({ key, status: statusByKey[key] ?? 'PENDING' })),
});

const initialProgress = () =>
  buildProgress(Object.fromEntries(AI_ANALYSIS_PHASES.map((key) => [key, 'PENDING'])));

const completedProgress = () =>
  buildProgress(Object.fromEntries(AI_ANALYSIS_PHASES.map((key) => [key, 'DONE'])));

// The AI verkenning is project-level (one per project), not per-theme. We keep
// the existing `aiAnalyses` array storage but address a single entry under this
// constant key, so no data migration is needed. themeSlug is no longer exposed
// through GraphQL.
const PROJECT_ANALYSIS_KEY = '__project__';

const makeEmptyAnalysis = (themeSlug: string) => ({
  themeSlug,
  searchQuestion: undefined,
  status: 'NOT_STARTED',
  methodExplanation: METHOD_EXPLANATION,
  experts: [],
  sources: [],
  talkingPoints: [],
  themes: [],
});

const getUserId = (context: AppContext) => String(context.user?._id || context.user?.id || '');

const hasProjectRole = (project: ProjectDocument, userId: string, role?: string) =>
  ((project as any).users || []).some((entry: any) => {
    const entryUserId = typeof entry.user === 'string'
      ? entry.user
      : entry.user?._id?.toString() || entry.user?.toString();

    return entryUserId === userId && (!role || entry.role === role);
  });

const assertAuthenticated = (context: AppContext) => {
  if (!context.isAuthenticated) {
    throw new AuthenticationError();
  }
};

export const findProjectForUser = async (projectId: string, context: AppContext, role?: 'OWNER') => {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new NotFoundError('Project');
  }

  const project = await Project.findById(projectId);
  if (!project) {
    throw new NotFoundError('Project');
  }

  const userId = getUserId(context);
  if (!hasProjectRole(project, userId, role)) {
    throw new AuthenticationError(
      role === 'OWNER'
        ? 'You are not authorized to start AI analysis for this project.'
        : 'You are not authorized to view AI analysis for this project.'
    );
  }

  return project;
};

const requireCompleteIntake = (project: ProjectDocument) => {
  if (
    !Array.isArray((project as any).reason) ||
    !(project as any).reason.length ||
    !(project as any).scanGoal?.trim() ||
    !(project as any).impactMotivation?.trim() ||
    !(project as any).scope?.trim()
  ) {
    throw new ValidationError('Vul de projectintake volledig in voordat u de AI-verkenning start.');
  }

  if ((project as any).reason.includes('OTHER') && !(project as any).reasonOther?.trim()) {
    throw new ValidationError('Vul een toelichting in bij "Anders, namelijk" voordat u de AI-verkenning start.');
  }
};

export const findTheme = (project: ProjectDocument, themeSlug: string) => {
  const theme = ((project as any).themes || []).find((t: any) => t.slug === themeSlug);
  if (!theme) {
    throw new NotFoundError('Theme');
  }
  return theme;
};

// The "Hier vind je inspiratie voor" line on the AI dashboard shows the scan's
// subject (the step-2 intake answer), not a per-theme templated question — the
// inspiration is keyed off this subject, which is also what drives the search
// (see mapProjectToAiServiceInput's `goal`).
const buildGeneratedQuestion = (project: ProjectDocument) => (project as any).scanGoal?.trim() ?? '';

// The question that actually drove the verkenning's source search — the user's
// edited search question when set, otherwise the generated one (= the scan
// subject). Effect extraction must reuse this so a source's "Mogelijke effecten"
// are judged against the same query that surfaced the source, not the bare
// scanGoal (which on its own often matches nothing in the found documents).
export const getActiveSearchQuestion = (project: ProjectDocument): string | undefined => {
  const analysis = ((project as any).aiAnalyses || []).find(
    (a: any) => a.themeSlug === PROJECT_ANALYSIS_KEY
  );
  return analysis?.searchQuestion ?? analysis?.generatedQuestion ?? undefined;
};

const buildInputSummary = (project: ProjectDocument) =>
  [
    (project as any).description,
    (project as any).scanGoal,
    (project as any).impactSituation,
    (project as any).impactMotivation,
    (project as any).scope,
    (project as any).additionalContext,
  ].filter(Boolean).join('\n\n');

const normalizeThemeKey = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' en ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const CANONICAL_THEME_ALIASES = new Map([
  ['subjectief welzijn', 'subjectief-welzijn'],
  ['subjective wellbeing', 'subjectief-welzijn'],
  ['subjective well being', 'subjectief-welzijn'],
  ['gezondheid', 'gezondheid'],
  ['health', 'gezondheid'],
  ['mentale gezondheid', 'gezondheid'],
  ['mental health', 'gezondheid'],
  ['fysieke gezondheid', 'gezondheid'],
  ['physical health', 'gezondheid'],
  ['consumptie en inkomen', 'consumptie-en-inkomen'],
  ['inkomen en arbeid', 'consumptie-en-inkomen'],
  ['inkomen', 'consumptie-en-inkomen'],
  ['income and work', 'consumptie-en-inkomen'],
  ['consumption and income', 'consumptie-en-inkomen'],
  ['onderwijs en opleiding', 'onderwijs-en-opleiding'],
  ['onderwijs', 'onderwijs-en-opleiding'],
  ['education', 'onderwijs-en-opleiding'],
  ['education and training', 'onderwijs-en-opleiding'],
  ['ruimtelijke samenhang en kwaliteit', 'ruimtelijke-samenhang-en-kwaliteit'],
  ['ruimtelijke kwaliteit', 'ruimtelijke-samenhang-en-kwaliteit'],
  ['ruimte', 'ruimtelijke-samenhang-en-kwaliteit'],
  ['spatial quality', 'ruimtelijke-samenhang-en-kwaliteit'],
  ['spatial coherence and quality', 'ruimtelijke-samenhang-en-kwaliteit'],
  ['economisch kapitaal', 'economisch-kapitaal'],
  ['economic capital', 'economisch-kapitaal'],
  ['natuurlijk kapitaal', 'natuurlijk-kapitaal'],
  ['natural capital', 'natuurlijk-kapitaal'],
  ['sociaal kapitaal', 'sociaal-kapitaal'],
  ['social capital', 'sociaal-kapitaal'],
  ['sociale cohesie', 'sociaal-kapitaal'],
  ['social cohesion', 'sociaal-kapitaal'],
  ['veiligheid', 'veiligheid'],
  ['safety', 'veiligheid'],
  ['sociale veiligheid', 'veiligheid'],
  ['social safety', 'veiligheid'],
  ['wonen', 'wonen'],
  ['housing', 'wonen'],
  ['betaalbaar wonen', 'wonen'],
  ['affordable housing', 'wonen'],
].map(([alias, slug]) => [normalizeThemeKey(alias), slug]));

const buildProjectThemeLookup = (project: ProjectDocument) => {
  const projectThemes = ((project as any).themes || []).filter((theme: any) => theme?.slug);
  const themeSlugs = new Set(projectThemes.map((theme: any) => theme.slug));
  const lookup = new Map<string, string>();

  projectThemes.forEach((theme: any) => {
    lookup.set(normalizeThemeKey(theme.slug), theme.slug);
    lookup.set(normalizeThemeKey(theme.name), theme.slug);
  });

  CANONICAL_THEME_ALIASES.forEach((slug, alias) => {
    if (themeSlugs.has(slug)) {
      lookup.set(alias, slug);
    }
  });

  return lookup;
};

const normalizeTalkingPointThemes = (themes: unknown[] = [], projectThemeLookup: Map<string, string>) => {
  const seen = new Set<string>();
  const normalizedThemes: string[] = [];

  themes.forEach(theme => {
    const slug = projectThemeLookup.get(normalizeThemeKey(theme));
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      normalizedThemes.push(slug);
    }
  });

  return normalizedThemes;
};

const normalizeAnalysisThemes = <T extends { talkingPoints?: any[] }>(
  project: ProjectDocument,
  analysis: T
) => {
  const projectThemeLookup = buildProjectThemeLookup(project);

  return {
    ...analysis,
    talkingPoints: (analysis.talkingPoints || []).map(talkingPoint => ({
      ...talkingPoint,
      themes: normalizeTalkingPointThemes(talkingPoint.themes || [], projectThemeLookup),
    })),
  };
};

const mapSources = (sources: AiServiceSourceResult[] = []) =>
  sources.map(source => ({
    externalId: source.doc_id,
    title: source.title ?? undefined,
    content: source.content ?? undefined,
    url: source.url ?? undefined,
    score: source.score ?? undefined,
    sourceType: source.chunk_type ?? undefined,
    publishedAt: source.published_at ? new Date(source.published_at) : undefined,
    ...(source.metadata ? { metadata: source.metadata } : {}),
  }));

const mapExperts = (authors: AiServiceAuthorResult[] = []) =>
  authors.map(author => ({
    externalId: author.id !== null && author.id !== undefined ? String(author.id) : undefined,
    name: author.name ?? undefined,
    organisation: author.affiliation ?? undefined,
    score: author.score ?? undefined,
    sourceIds: author.doc_ids || [],
    ...(author.metadata ? { metadata: author.metadata } : {}),
  }));

const mapTalkingPoints = (project: ProjectDocument, talkingPoints: AiServiceTalkingPoint[] = []) => {
  const projectThemeLookup = buildProjectThemeLookup(project);

  return talkingPoints.map(talkingPoint => ({
    topic: talkingPoint.topic ?? undefined,
    description: talkingPoint.description ?? undefined,
    themes: normalizeTalkingPointThemes(talkingPoint.themes || [], projectThemeLookup),
    supportingSourceIds: talkingPoint.supporting_doc_ids || [],
  }));
};

const mapAnalysisResponse = (
  project: ProjectDocument,
  themeSlug: string,
  searchQuestion: string | undefined,
  response: AiServiceAnalysisResponse,
  startedAt: Date
) => ({
  themeSlug,
  searchQuestion: searchQuestion ?? undefined,
  status: 'COMPLETED',
  generatedQuestion: searchQuestion ?? buildGeneratedQuestion(project),
  inputSummary: buildInputSummary(project),
  methodExplanation: METHOD_EXPLANATION,
  progress: completedProgress(),
  startedAt,
  completedAt: response.computed_at ? new Date(response.computed_at) : new Date(),
  experts: mapExperts(response.authors || []),
  sources: mapSources(response.sources || []),
  talkingPoints: mapTalkingPoints(project, response.talking_points || []),
  themes: [],
});

const upsertAiAnalysisEntry = async (projectId: string, themeSlug: string, entry: Record<string, unknown>) => {
  const updateResult = await Project.updateOne(
    { _id: projectId, 'aiAnalyses.themeSlug': themeSlug },
    { $set: { 'aiAnalyses.$': entry } }
  );

  if (updateResult.matchedCount === 0) {
    await Project.updateOne(
      { _id: projectId },
      { $push: { aiAnalyses: entry } }
    );
  }
};

// Targeted write of just the progress field so a phase update never clobbers
// startedAt or other fields on the in-flight RUNNING entry.
const updateAiAnalysisProgress = async (
  projectId: string,
  themeSlug: string,
  statusByKey: Record<string, AiAnalysisPhaseStatus>
) => {
  await Project.updateOne(
    { _id: projectId, 'aiAnalyses.themeSlug': themeSlug },
    { $set: { 'aiAnalyses.$.progress': buildProgress(statusByKey) } }
  );
};

const runProjectAiAnalysis = async ({
  projectId,
  searchQuestion,
  generatedQuestion,
  startedAt,
}: {
  projectId: string;
  searchQuestion?: string;
  generatedQuestion: string;
  startedAt: Date;
}) => {
  try {
    const project = await Project.findById(projectId);
    if (!project) {
      logger.error('Project AI analysis skipped because project was not found', { projectId });
      return;
    }

    logger.info('Project AI analysis started', { projectId });

    const phaseStatus: Record<string, AiAnalysisPhaseStatus> = Object.fromEntries(
      AI_ANALYSIS_PHASES.map((key) => [key, 'PENDING'])
    );

    const response = await defaultAiServiceClient.analyzeProjectStream(
      {
        project_id: String(project._id),
        input: mapProjectToAiServiceInput(project, undefined, searchQuestion),
        features: ['sources', 'authors', 'talking_points'],
      },
      async (event) => {
        if (!(event.phase in phaseStatus)) return;
        phaseStatus[event.phase] = event.status === 'done' ? 'DONE' : 'RUNNING';
        try {
          await updateAiAnalysisProgress(projectId, PROJECT_ANALYSIS_KEY, phaseStatus);
        } catch (progressError) {
          // A dropped progress write must not abort the analysis itself.
          logger.warn('Project AI analysis progress update failed', {
            projectId,
            phase: event.phase,
            error: progressError,
          });
        }
      }
    );

    const freshProject = await Project.findById(projectId);
    if (!freshProject) {
      logger.error('Project AI analysis completion skipped because project was not found', { projectId });
      return;
    }

    const completedEntry = mapAnalysisResponse(
      freshProject,
      PROJECT_ANALYSIS_KEY,
      searchQuestion,
      response,
      startedAt
    );
    await upsertAiAnalysisEntry(projectId, PROJECT_ANALYSIS_KEY, completedEntry);

    logger.info('Project AI analysis completed', { projectId });
  } catch (error) {
    logger.error('Project AI analysis failed', { projectId, error });

    try {
      const project = await Project.findById(projectId);
      if (!project) {
        return;
      }

      const failedEntry = {
        ...makeEmptyAnalysis(PROJECT_ANALYSIS_KEY),
        searchQuestion: searchQuestion ?? undefined,
        status: 'FAILED',
        generatedQuestion,
        inputSummary: buildInputSummary(project),
        errorMessage: AI_ANALYSIS_ERROR_MESSAGE,
        startedAt,
        completedAt: new Date(),
      };
      await upsertAiAnalysisEntry(projectId, PROJECT_ANALYSIS_KEY, failedEntry);
    } catch (statusError) {
      logger.error('Project AI analysis failure status could not be saved', {
        projectId,
        error: statusError,
      });
    }
  }
};

export const projectAiAnalysisQueries = {
  projectAiAnalysis: async (_: any, { projectId }: { projectId: string }, context: AppContext) => {
    assertAuthenticated(context);

    try {
      const project = await findProjectForUser(projectId, context);

      const existing = ((project as any).aiAnalyses || []).find((a: any) => a.themeSlug === PROJECT_ANALYSIS_KEY);
      const analysis = existing ?? makeEmptyAnalysis(PROJECT_ANALYSIS_KEY);
      const plain = typeof analysis.toObject === 'function' ? analysis.toObject() : analysis;
      return normalizeAnalysisThemes(project, withStaleRunningAsFailed(plain));
    } catch (error) {
      handleMongoError(error);
    }
  },
};

export const projectAiAnalysisMutations = {
  startProjectAiAnalysis: async (
    _: any,
    { projectId, searchQuestion }: { projectId: string; searchQuestion?: string },
    context: AppContext
  ) => {
    assertAuthenticated(context);

    try {
      const project = await findProjectForUser(projectId, context, 'OWNER');
      requireCompleteIntake(project);

      const generatedQuestion = searchQuestion ?? buildGeneratedQuestion(project);
      const startedAt = new Date();

      const analyses: any[] = (project as any).aiAnalyses || [];
      const existingIdx = analyses.findIndex((a: any) => a.themeSlug === PROJECT_ANALYSIS_KEY);
      const runningEntry = {
        ...makeEmptyAnalysis(PROJECT_ANALYSIS_KEY),
        searchQuestion: searchQuestion ?? undefined,
        status: 'RUNNING',
        generatedQuestion,
        inputSummary: buildInputSummary(project),
        progress: initialProgress(),
        startedAt,
      };

      if (existingIdx >= 0) {
        analyses[existingIdx] = runningEntry;
      } else {
        analyses.push(runningEntry);
      }
      (project as any).aiAnalyses = analyses;
      await project.save();

      void runProjectAiAnalysis({
        projectId: String(project._id),
        searchQuestion,
        generatedQuestion,
        startedAt,
      });

      return runningEntry;
    } catch (error) {
      handleMongoError(error);
    }
  },
};
