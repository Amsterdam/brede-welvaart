import { createHash } from 'crypto';
import { AuthenticationError, handleMongoError } from '../lib/errors';
import { defaultAiServiceClient, mapProjectToAiServiceInput } from '../lib/aiServiceClient';
import type { AiServiceProjectInput } from '../lib/aiServiceClient';
import { SourceEffectCache } from '../models/SourceEffectCache';
import type { ISourceEffectStatement } from '../models/SourceEffectCache';
import { findProjectForUser, findTheme, getActiveSearchQuestion } from './projectAiAnalysis';
import type { AppContext } from '@shared/types';

const assertAuthenticated = (context: AppContext) => {
  if (!context.isAuthenticated) {
    throw new AuthenticationError();
  }
};

// Bump when extraction or parsing changes so cached silent failures are recomputed.
const STATEMENT_EXTRACTION_VERSION = 2;

// Fingerprint of everything the extraction depends on. mapProjectToAiServiceInput
// folds in the search question, scan goal, motivation, scope, reason and theme, so a
// change to any of those changes this hash and invalidates the cached statements.
const specFingerprint = (input: AiServiceProjectInput, docId: string): string =>
  createHash('sha256')
    .update(JSON.stringify({ input, docId, extractionVersion: STATEMENT_EXTRACTION_VERSION }))
    .digest('hex');

// Open research doc_ids are "openresearch:<id>"; the frontend routes on the bare
// numeric id, so accept either form and normalise to the corpus doc_id.
const toCorpusDocId = (sourceId: string): string =>
  sourceId.includes(':') ? sourceId : `openresearch:${sourceId}`;

// Extract the numeric tail from "openresearch:51001" / "/page/51001" so the
// GraphQL response always exposes a stable, URL-friendly id.
const extractNumericId = (value: unknown): string | undefined => {
  if (!value) return undefined;
  return String(value).match(/(\d+)/)?.[1];
};

export const openResearchSourceQueries = {
  openResearchSource: async (_: unknown, { id }: { id: string }, context: AppContext) => {
    assertAuthenticated(context);

    const raw = await defaultAiServiceClient.getSource(id);
    if (!raw) return null;

    const metadata = (raw.metadata ?? {}) as Record<string, unknown>;
    const resolvedId =
      String(metadata.openresearch_id ?? '') ||
      extractNumericId(raw.doc_id) ||
      extractNumericId(raw.url) ||
      id;

    return {
      id: resolvedId,
      docId: raw.doc_id,
      title: raw.title ?? undefined,
      content: raw.content ?? undefined,
      url: raw.url ?? undefined,
      score: raw.score ?? undefined,
      sourceType: raw.chunk_type ?? undefined,
      publishedAt: raw.published_at ? new Date(raw.published_at) : undefined,
      category: (raw as any).category ?? undefined,
      metadata,
    };
  },

  // Real "Mogelijke effecten" for a single source: verbatim statements the
  // ai-service extracts from that document, filtered for project relevance.
  openResearchSourceEffects: async (
    _: unknown,
    { projectId, sourceId, themeSlug }: { projectId: string; sourceId: string; themeSlug?: string },
    context: AppContext
  ) => {
    assertAuthenticated(context);

    try {
      const project = await findProjectForUser(projectId, context);
      const themeName = themeSlug ? findTheme(project, themeSlug).name : undefined;

      const searchQuestion = getActiveSearchQuestion(project);
      const input = mapProjectToAiServiceInput(project, themeName, searchQuestion);
      const docId = toCorpusDocId(sourceId);
      const normalizedThemeSlug = themeSlug ?? null;
      const specHash = specFingerprint(input, docId);

      // Reuse cached statements while the specs are unchanged — avoids re-running the
      // expensive extraction on every source-page / dashboard view.
      const cached = await SourceEffectCache.findOne({
        projectId: project._id,
        docId,
        themeSlug: normalizedThemeSlug,
      });
      if (cached && cached.specHash === specHash) {
        return cached.statements.map((statement: ISourceEffectStatement) => ({
          text: statement.text,
          page: statement.page ?? null,
        }));
      }

      // First run, or the specs changed: recompute and overwrite the cached row.
      const statements = await defaultAiServiceClient.findStatements(input, docId);
      const effects = statements
        .filter((statement) => statement.text?.trim())
        .map((statement) => ({
          text: statement.text,
          page: typeof statement.page === 'number' ? statement.page : null,
        }));

      try {
        await SourceEffectCache.findOneAndUpdate(
          { projectId: project._id, docId, themeSlug: normalizedThemeSlug },
          { $set: { specHash, statements: effects } },
          { upsert: true }
        );
      } catch (writeError: any) {
        // A parallel request may have written the same row first; the effects we just
        // computed are still valid to return, so a duplicate-key race is non-fatal.
        if (writeError?.code !== 11000) throw writeError;
      }

      return effects;
    } catch (error) {
      handleMongoError(error);
    }
  },
};
