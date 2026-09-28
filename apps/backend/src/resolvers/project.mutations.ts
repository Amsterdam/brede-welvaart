import { Project } from '../models/Project';
import { AuthenticationError, NotFoundError, ValidationError, handleMongoError } from '../lib/errors';
import mongoose from 'mongoose';
import { AppContext, Project as ProjectType, CreateProjectInput, UpdateProjectInput, ProjectStatus, ProjectTemplate } from '@shared/types';
import { mapMongoToGraphQL } from '../lib/mongoMapper';
import { createDemoProject } from '../lib/demoData';
import { requireProjectOwner } from '../lib/permissions';
import { runUploadedDocumentAnalysis } from '../lib/projectDocumentAnalysis';
import { defaultAiServiceClient } from '../lib/aiServiceClient';
import { logger } from '../lib/logger';
import {
  buildProjectDocumentBlobPath,
  deleteProjectDocumentBlob,
  uploadProjectDocumentBlob,
} from '../lib/projectDocumentStorage';

import { themeTemplates, ThemeTemplateEnum } from '../templates/themeTemplates';

const COPY_SUFFIX_REGEX = /\s\((\d+)\)$/;
const MAX_DOCUMENT_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const BASE64_REGEX = /^[A-Za-z0-9+/=]+$/;
const INTAKE_FIELDS = new Set([
  'reason',
  'reasonOther',
  'scanGoal',
  'impactSituation',
  'impactMotivation',
  'scope',
  'additionalContext',
  'completeIntake',
  'coverText',
]);

const stripMutationOnlyFields = <T extends Record<string, any>>(input: T) => {
  const { completeIntake: _completeIntake, ...projectInput } = input;
  return projectInput;
};

const escapeRegExp = (value: string) => {
  const specialChars = new Set(['\\', '/', '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '-']);
  let escaped = '';
  for (const char of value) {
    escaped += specialChars.has(char) ? `\\${char}` : char;
  }
  return escaped;
};

const stripCopySuffix = (name: string) => name.replace(COPY_SUFFIX_REGEX, '');

const hasIntakeFields = (input: Record<string, unknown>) =>
  Object.entries(input).some(([key, value]) =>
    INTAKE_FIELDS.has(key) && (key !== 'completeIntake' || value === true)
  );

const trimOptional = (value: unknown) =>
  typeof value === 'string' ? value.trim() : value;

const trimOrUndefined = (value: unknown) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

type UploadProjectDocumentInput = {
  themeSlug: string;
  fileName: string;
  mimeType?: string | null;
  size: number;
  contentBase64: string;
  name: string;
  description?: string | null;
  keyword?: string | null;
};

type CreateProjectAiDraftEffectInput = {
  title: string;
  explanation: string;
  sentiment: string;
  discussionPoint: boolean;
  timeFrame?: string[] | null;
  location?: string[] | null;
  source: {
    type: string;
    link?: string | null;
  };
  sourceTitle?: string | null;
  sourceEffect: {
    sourceKind: string;
    sourceId: string;
    effectId: string;
    page?: number | null;
    text?: string | null;
  };
  generatedByAi?: boolean | null;
  aiProposal?: string | null;
  importance: string;
};

type ProjectIntakeInput = {
  reason?: string[] | null;
  reasonOther?: string | null;
  scanGoal?: string | null;
  impactSituation?: string | null;
  impactMotivation?: string | null;
  scope?: string | null;
  additionalContext?: string | null;
};

const validateProjectIntake = (input: {
  reason?: string[] | null;
  reasonOther?: string | null;
  scanGoal?: string | null;
  impactSituation?: string | null;
  impactMotivation?: string | null;
  scope?: string | null;
}) => {
  if (!Array.isArray(input.reason) || input.reason.length === 0) {
    throw new ValidationError('Selecteer minimaal één aanleiding voor de scan.', 'reason');
  }

  if (input.reason.includes('OTHER') && !input.reasonOther?.trim()) {
    throw new ValidationError('Vul een toelichting in bij "Anders, namelijk".', 'reasonOther');
  }

  if (!input.scanGoal?.trim()) {
    throw new ValidationError('Vul het onderwerp van de brede welvaartscan in.', 'scanGoal');
  }

  if (!input.impactMotivation?.trim()) {
    throw new ValidationError('Vul het doel van de scan in.', 'impactMotivation');
  }

  if (!input.scope?.trim()) {
    throw new ValidationError('Vul de afbakening van de scan in.', 'scope');
  }
};

const normalizeProjectIntake = <T extends ProjectIntakeInput>(input: T): T => {
  const normalized: T & ProjectIntakeInput = { ...input };

  for (const key of ['reasonOther', 'scanGoal', 'impactSituation', 'impactMotivation', 'scope', 'additionalContext'] as const) {
    if (typeof normalized[key] === 'string') {
      normalized[key] = normalized[key].trim();
    }
  }

  if (Array.isArray(normalized.reason) && !normalized.reason.includes('OTHER')) {
    normalized.reasonOther = undefined;
  }

  return normalized as T;
};

const generateDuplicateName = async (name: string) => {
  const baseName = stripCopySuffix(name);
  const escapedBase = escapeRegExp(baseName);
  const regex = new RegExp(`^${escapedBase}( \\((\\d+)\\))?$`);
  const similarProjects = await Project.find({ name: regex });

  let maxSuffix = 0;
  for (const project of similarProjects) {
    const match = (project.name || '').match(COPY_SUFFIX_REGEX);
    if (match) {
      maxSuffix = Math.max(maxSuffix, parseInt(match[1], 10));
    }
  }

  return `${baseName} (${maxSuffix + 1})`;
};

const cloneUserEntries = (users: any[] = []) =>
  users.map(user => ({
    user: typeof user.user === 'object' && user.user !== null ? user.user._id ?? user.user : user.user,
    role: user.role,
  }));

const cloneThemes = (themes: any[] = []) =>
  themes.map(theme => {
    const { _id, createdAt, updatedAt, arguments: themeArguments = [], ...rest } = theme;

    const clonedArguments = (themeArguments as any[]).map(argument => {
      const { _id: argumentId, createdAt: argumentCreatedAt, updatedAt: argumentUpdatedAt, ...argumentRest } = argument;
      return argumentRest;
    });

    return {
      ...rest,
      arguments: clonedArguments,
    };
  });

// AI draft effects are project-level (themeless); the theme is chosen only when a
// draft is converted into an argument. The source-effect identity is therefore
// theme-independent: (sourceKind, sourceId, effectId).
// Reconstruct the OpenResearch source URL server-side instead of trusting the
// client to send it. Keeping the off-domain URL out of the request body avoids
// the S-ADS WAF RFI rule (931130) that blocks `https://...` in the payload.
const resolveOpenResearchLink = async (sourceKind: string, sourceId: string) => {
  if (sourceKind !== 'OPEN_RESEARCH' || !sourceId) return undefined;
  try {
    const raw = await defaultAiServiceClient.getSource(sourceId);
    return raw?.url ?? undefined;
  } catch (err) {
    logger.warn('Could not reconstruct OpenResearch link for draft effect', { sourceId, err });
    return undefined; // never block the save on a link lookup
  }
};
const buildSourceEffect = (sourceEffect: CreateProjectAiDraftEffectInput['sourceEffect']) => {
  const sourceKind = String(sourceEffect.sourceKind);
  const sourceId = String(sourceEffect.sourceId);
  const effectId = String(sourceEffect.effectId);

  return {
    key: [sourceKind, sourceId, effectId].join(':'),
    sourceKind,
    sourceId,
    effectId,
    page: sourceEffect.page ?? undefined,
    text: trimOrUndefined(sourceEffect.text),
  };
};

export const projectMutations = {
  generateProjectKeyMessage: async (_: any, { projectId }: { projectId: string }, context: AppContext) => {
    if (!context.isAuthenticated) throw new AuthenticationError();
    if (!mongoose.Types.ObjectId.isValid(projectId)) throw new NotFoundError('Project');

    const project = await Project.findById(projectId);
    if (!project) throw new NotFoundError('Project');
    requireProjectOwner(project, context, 'generate a key message for');
    if (project.status !== ProjectStatus.Draft) {
      throw new ValidationError('U kunt alleen voor een conceptscan een kernboodschap maken.');
    }

    const projectObject = project.toObject();
    return defaultAiServiceClient.generateKeyMessage({
      name: projectObject.name,
      description: projectObject.description,
      goal: projectObject.scanGoal || '',
      motivation: projectObject.impactMotivation || '',
      scope: projectObject.scope || '',
      themes: (projectObject.themes || []).map((theme: any) => ({
        name: theme.name,
        slug: theme.slug,
        arguments: (theme.arguments || []).map((argument: any) => ({
          title: argument.title,
          explanation: argument.explanation,
          sentiment: argument.sentiment,
        })),
      })),
    });
  },

  createProject: async (_: any, { input }: { input: CreateProjectInput }, context: AppContext) => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      // Apply default values if not provided
      const status = input.status ?? ProjectStatus.Draft;
      const template = input.template ?? ProjectTemplate.V1_1;

      // Use the template field from input (or default) to select the theme template
      const templateKey = template as string;
      const themes = themeTemplates[templateKey as keyof typeof themeTemplates] || [];
      const shouldCompleteIntake = Boolean((input as any).completeIntake);
      const normalizedInput = normalizeProjectIntake(stripMutationOnlyFields(input as Record<string, any>));
      if (shouldCompleteIntake) {
        validateProjectIntake(normalizedInput);
      }

      const project = new Project({
        ...normalizedInput,
        status,
        template,
        createdBy: context.user?._id,
        themes,
        users: [
          {
            user: context.user?._id,
            role: 'OWNER',
          }
        ]
      });
      await project.save();
      return mapMongoToGraphQL<ProjectType>(project);
    } catch (error) {
      handleMongoError(error);
    }
  },

  updateProject: async (_: any, { id, input }: { id: string; input: UpdateProjectInput }, context: AppContext) => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new NotFoundError('Project');
      }

      // Fetch the project to check user role
      const project = await Project.findById(id);
      if (!project) {
        throw new NotFoundError('Project');
      }

      // Authorization: Only OWNER can update
      requireProjectOwner(project, context, 'update');

      if (project.status !== ProjectStatus.Draft && hasIntakeFields(input as Record<string, unknown>)) {
        throw new ValidationError('De inhoud van een gepubliceerde of gearchiveerde scan kan niet worden aangepast.');
      }

      const shouldCompleteIntake = Boolean((input as any).completeIntake);
      const normalizedInput = normalizeProjectIntake(stripMutationOnlyFields(input as Record<string, any>));
      const intakeValue = <K extends keyof typeof normalizedInput>(key: K, currentValue: unknown) =>
        key in normalizedInput ? normalizedInput[key] : currentValue;
      const mergedIntake = {
        reason: intakeValue('reason', (project as any).reason),
        reasonOther: intakeValue('reasonOther', (project as any).reasonOther),
        scanGoal: intakeValue('scanGoal', (project as any).scanGoal),
        impactSituation: intakeValue('impactSituation', (project as any).impactSituation),
        impactMotivation: intakeValue('impactMotivation', (project as any).impactMotivation),
        scope: intakeValue('scope', (project as any).scope),
      };

      if (shouldCompleteIntake) {
        validateProjectIntake(mergedIntake);
      }

      project.set(normalizedInput);
      if (Array.isArray((project as any).reason) && !(project as any).reason.includes('OTHER')) {
        (project as any).reasonOther = undefined;
      }

      await project.save();

      return mapMongoToGraphQL<ProjectType>(project);
    } catch (error) {
      handleMongoError(error);
    }
  },

  deleteProject: async (_: any, { id }: { id: string }, context: AppContext) => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new NotFoundError('Project');
      }

      // Find the project first
      const project = await Project.findById(id);

      if (!project) {
        throw new NotFoundError('Project');
      }

      // Authorization: Only OWNER can delete
      requireProjectOwner(project, context, 'delete');

      await Project.findByIdAndDelete(id);

      return true;
    } catch (error) {
      handleMongoError(error);
    }
  },

  duplicateProject: async (_: any, { id }: { id: string }, context: AppContext) => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new NotFoundError('Project');
      }

      const project = await Project.findById(id);
      if (!project) {
        throw new NotFoundError('Project');
      }

      requireProjectOwner(project, context, 'duplicate');

      const projectObject = project.toObject({ depopulate: true });
      const reason = projectObject.reason;
      const reasonOther = Array.isArray(reason) && reason.includes('OTHER')
        ? projectObject.reasonOther
        : undefined;

      const clonedProject = new Project({
        name: await generateDuplicateName(projectObject.name),
        description: projectObject.description,
        reason,
        reasonOther,
        scanGoal: projectObject.scanGoal,
        impactSituation: projectObject.impactSituation,
        impactMotivation: projectObject.impactMotivation,
        scope: projectObject.scope,
        additionalContext: projectObject.additionalContext,
        status: projectObject.status,
        template: projectObject.template,
        createdBy: projectObject.createdBy,
        keyMessage: projectObject.keyMessage,
        coverText: projectObject.coverText,
        themes: cloneThemes(projectObject.themes),
        users: cloneUserEntries(projectObject.users),
      });

      await clonedProject.save();

      return mapMongoToGraphQL<ProjectType>(clonedProject);
    } catch (error) {
      handleMongoError(error);
    }
  },

  uploadProjectDocument: async (_: any, { projectId, input }: { projectId: string; input: UploadProjectDocumentInput }, context: AppContext) => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new NotFoundError('Project');
      }

      const project = await Project.findById(projectId);
      if (!project) {
        throw new NotFoundError('Project');
      }

      requireProjectOwner(project, context, 'upload documents to');

      const themeSlug = input.themeSlug.trim();
      const theme = (project as any).themes?.find((item: any) => item.slug === themeSlug);
      if (!theme) {
        throw new ValidationError('Dit thema bestaat niet in deze scan.', 'themeSlug');
      }

      const fileName = input.fileName.trim();
      const name = input.name.trim();
      const contentBase64 = input.contentBase64.trim();
      const mimeType = trimOrUndefined(input.mimeType);
      const description = trimOrUndefined(input.description);
      const keyword = trimOrUndefined(input.keyword);

      if (!fileName) {
        throw new ValidationError('Kies een bestand.', 'fileName');
      }
      if (!name) {
        throw new ValidationError('Vul een naam in.', 'name');
      }
      if (!Number.isInteger(input.size) || input.size <= 0) {
        throw new ValidationError('Het bestand is leeg of ongeldig.', 'size');
      }
      if (input.size > MAX_DOCUMENT_UPLOAD_SIZE_BYTES) {
        throw new ValidationError('Het bestand mag maximaal 5 MB zijn.', 'size');
      }
      if (!contentBase64 || !BASE64_REGEX.test(contentBase64)) {
        throw new ValidationError('Het bestand kon niet worden gelezen.', 'contentBase64');
      }

      const documentContent = Buffer.from(contentBase64, 'base64');
      if (documentContent.length <= 0) {
        throw new ValidationError('Het bestand is leeg of ongeldig.', 'contentBase64');
      }
      if (documentContent.length > MAX_DOCUMENT_UPLOAD_SIZE_BYTES) {
        throw new ValidationError('Het bestand mag maximaal 5 MB zijn.', 'size');
      }

      const documentId = new mongoose.Types.ObjectId();
      const blobPath = buildProjectDocumentBlobPath(project._id.toString(), documentId.toString(), fileName, mimeType);

      await uploadProjectDocumentBlob({
        blobPath,
        content: documentContent,
        mimeType,
      });

      try {
        (project as any).uploadedDocuments.push({
          _id: documentId,
          themeSlug,
          fileName,
          mimeType,
          size: documentContent.length,
          name,
          description,
          keyword,
          blobPath,
          analysisStatus: 'RUNNING',
          aiStatements: [],
          uploadedAt: new Date(),
          uploadedBy: context.user?._id,
        });
        await project.save();
      } catch (saveError) {
        try {
          await deleteProjectDocumentBlob(blobPath);
        } catch (deleteError) {
          console.error('[BlobCleanupError]', deleteError);
        }
        throw saveError;
      }

      const savedDocument = (project as any).uploadedDocuments[(project as any).uploadedDocuments.length - 1];
      void runUploadedDocumentAnalysis({
        projectId: project._id.toString(),
        documentId: documentId.toString(),
        themeName: theme.name,
        blobPath,
        fileName,
      });

      return mapMongoToGraphQL(savedDocument);
    } catch (error) {
      handleMongoError(error);
    }
  },

  createProjectAiDraftEffects: async (
    _: any,
    { projectId, input }: { projectId: string; input: CreateProjectAiDraftEffectInput[] },
    context: AppContext
  ) => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      if (!mongoose.Types.ObjectId.isValid(projectId)) {
        throw new NotFoundError('Project');
      }

      const project = await Project.findById(projectId);
      if (!project) {
        throw new NotFoundError('Project');
      }

      requireProjectOwner(project, context, 'add AI draft effects to');

      const existingDraftKeys = new Set(
        ((project as any).aiDraftEffects ?? [])
          .map((draft: any) => draft.sourceEffect?.key)
          .filter(Boolean)
      );
      const existingArgumentKeys = new Set(
        ((project as any).themes ?? [])
          .flatMap((theme: any) => theme.arguments ?? [])
          .map((argument: any) => argument.sourceEffect?.key)
          .filter(Boolean)
      );
      const newDrafts: any[] = [];

      // Selected effects often share one source — resolve each source's URL once.
      const linkCache = new Map<string, Promise<string | undefined>>();
      const resolveLink = (sourceKind: string, sourceId: string) => {
        if (sourceKind !== 'OPEN_RESEARCH' || !sourceId) return Promise.resolve(undefined);
        let pending = linkCache.get(sourceId);
        if (!pending) {
          pending = resolveOpenResearchLink(sourceKind, sourceId);
          linkCache.set(sourceId, pending);
        }
        return pending;
      };

      for (const draftInput of input) {
        const sourceEffect = buildSourceEffect(draftInput.sourceEffect);

        if (existingDraftKeys.has(sourceEffect.key) || existingArgumentKeys.has(sourceEffect.key)) {
          continue;
        }

        existingDraftKeys.add(sourceEffect.key);
        newDrafts.push({
          title: draftInput.title.trim(),
          explanation: draftInput.explanation.trim(),
          sentiment: draftInput.sentiment,
          discussionPoint: draftInput.discussionPoint,
          timeFrame: draftInput.timeFrame ?? [],
          location: draftInput.location ?? [],
          source: {
            type: draftInput.source.type,
            link: await resolveLink(sourceEffect.sourceKind, sourceEffect.sourceId),
          },
          sourceTitle: trimOrUndefined(draftInput.sourceTitle),
          sourceEffect,
          generatedByAi: draftInput.generatedByAi ?? true,
          aiProposal: trimOrUndefined(draftInput.aiProposal),
          importance: draftInput.importance,
        });
      }

      if (newDrafts.length > 0) {
        (project as any).aiDraftEffects.push(...newDrafts);
        await project.save();
      }

      return ((project as any).aiDraftEffects ?? []).map((draft: any) => mapMongoToGraphQL(draft));
    } catch (error) {
      handleMongoError(error);
    }
  },

  deleteProjectUploadedDocument: async (
    _: any,
    { projectId, documentId }: { projectId: string; documentId: string },
    context: AppContext
  ) => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      if (!mongoose.Types.ObjectId.isValid(projectId) || !mongoose.Types.ObjectId.isValid(documentId)) {
        throw new NotFoundError('Project uploaded document');
      }

      const project = await Project.findById(projectId);
      if (!project) {
        throw new NotFoundError('Project');
      }

      requireProjectOwner(project, context, 'delete uploaded documents from');

      const document = (project as any).uploadedDocuments.id(documentId);
      if (!document) {
        throw new NotFoundError('Project uploaded document');
      }

      const { blobPath } = document;
      document.deleteOne();
      await project.save();

      // Best-effort blob cleanup — the document is already gone from the scan, so a
      // missing/failed blob delete (e.g. it was never stored) must not fail the call.
      if (blobPath) {
        try {
          await deleteProjectDocumentBlob(blobPath);
        } catch (blobError) {
          console.error('[BlobCleanupError]', blobError);
        }
      }

      return true;
    } catch (error) {
      handleMongoError(error);
    }
  },

  deleteProjectAiDraftEffect: async (
    _: any,
    { projectId, draftEffectId }: { projectId: string; draftEffectId: string },
    context: AppContext
  ) => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      if (!mongoose.Types.ObjectId.isValid(projectId) || !mongoose.Types.ObjectId.isValid(draftEffectId)) {
        throw new NotFoundError('Project AI draft effect');
      }

      const project = await Project.findById(projectId);
      if (!project) {
        throw new NotFoundError('Project');
      }

      requireProjectOwner(project, context, 'delete AI draft effects from');

      const draft = (project as any).aiDraftEffects.id(draftEffectId);
      if (!draft) {
        throw new NotFoundError('Project AI draft effect');
      }

      draft.deleteOne();
      await project.save();

      return true;
    } catch (error) {
      handleMongoError(error);
    }
  },

  useShareLink: async (_: any, { shareLink }: { shareLink: string }, context: AppContext) => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      const project = await Project.findOne({ shareLink });
      if (!project) {
        throw new NotFoundError('Project');
      }

      const userId = String(context.user?._id);
      const alreadyInProject = (project as any).users.some(
        (u: any) =>
          u &&
          ((typeof u.user === 'string' ? u.user : u.user?._id?.toString()) === userId)
      );

      if (!alreadyInProject) {
        (project as any).users.push({
          user: userId,
          role: 'REVIEWER',
          createdAt: new Date(),
        });
        await project.save();
      }

      return mapMongoToGraphQL<ProjectType>(project);
    } catch (error) {
      handleMongoError(error);
    }
  },

  setupDemo: async (_: any, {}: {}, context: AppContext) => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      return await createDemoProject(String(context.user?._id));
    } catch (error) {
      handleMongoError(error);
    }
  }
};
