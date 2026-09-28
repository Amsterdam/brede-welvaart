import config from '../config';
import { logger } from './logger';
import type { ProjectDocument } from '../models/Project';

type Fetch = typeof fetch;

export interface AiServiceClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: Fetch;
}

export interface AiServiceProjectInput {
  goal: string;
  motivation: string;
  scope: string;
  language: 'nl';
  top_n: number;
  theme?: string;
}

export interface AiServiceAnalyzeRequest {
  project_id: string;
  input: AiServiceProjectInput;
  features: Array<'sources' | 'authors' | 'statements' | 'talking_points'>;
}

export interface AiServiceSourceResult {
  doc_id: string;
  title?: string | null;
  content?: string | null;
  url?: string | null;
  score?: number | null;
  chunk_type?: string | null;
  published_at?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AiServiceAuthorResult {
  id?: number | null;
  name?: string | null;
  affiliation?: string | null;
  doc_ids?: string[];
  score?: number | null;
  metadata?: Record<string, unknown>;
}

export interface AiServiceTalkingPoint {
  topic?: string | null;
  description?: string | null;
  themes?: string[];
  supporting_doc_ids?: string[];
}

export interface AiServiceAnalysisResponse {
  project_id: string;
  sources?: AiServiceSourceResult[] | null;
  authors?: AiServiceAuthorResult[] | null;
  talking_points?: AiServiceTalkingPoint[] | null;
  computed_at?: string;
}

export type AiServicePhaseStatus = 'running' | 'done';

export interface AiServicePhaseEvent {
  phase: string;
  status: AiServicePhaseStatus;
  index: number;
  total: number;
}

export interface AiServiceDocumentStatement {
  text: string;
  doc_id?: string | null;
  title?: string | null;
  url?: string | null;
  author?: string | null;
  page?: number | null;
  score?: number | null;
  source?: string | null;
}

export interface AiServiceDocumentSummary {
  title?: string | null;
  summary: string;
}

export interface AiServiceAnalyzeDocumentRequest {
  input: AiServiceProjectInput;
  blob_path?: string;
  doc_id?: string;
  filename?: string;
}

export interface AiServiceAnalyzeDocumentResponse {
  summary?: AiServiceDocumentSummary | null;
  statements?: AiServiceDocumentStatement[] | null;
}

export interface AiServiceGenerateKeyMessageRequest {
  name: string;
  description: string;
  goal: string;
  motivation: string;
  scope: string;
  themes: Array<{
    name: string;
    slug: string;
    arguments: Array<{ title: string; explanation: string; sentiment: string }>;
  }>;
}

export interface AiServiceOpenResearchSource extends AiServiceSourceResult {
  category?: string | null;
}

export class AiServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly url?: string
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}

const sanitizeResponseBody = (body: string) => {
  const textOnly = body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return textOnly.length > 500 ? `${textOnly.slice(0, 500)}...` : textOnly;
};

export const createAiServiceClient = (options: AiServiceClientOptions = {}) => {
  const baseUrl = (options.baseUrl ?? config.aiService.baseUrl).replace(/\/$/, '');
  const timeoutMs = options.timeoutMs ?? config.aiService.timeoutMs;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    generateKeyMessage: async (request: AiServiceGenerateKeyMessageRequest): Promise<string> => {
      const url = `${baseUrl}/bw/generate-key-message`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          logger.error('AI service returned a non-success response for key message generation', {
            url,
            status: response.status,
            body: body ? sanitizeResponseBody(body) : undefined,
          });
          throw new AiServiceError(`AI service returned ${response.status} for ${url}`, response.status, url);
        }
        const result = await response.json() as { key_message: string };
        return result.key_message;
      } catch (error) {
        if (error instanceof AiServiceError) throw error;
        const message = error instanceof Error && error.name === 'AbortError'
          ? `AI service request to ${url} timed out after ${timeoutMs}ms`
          : `AI service request to ${url} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        throw new AiServiceError(message, undefined, url);
      } finally {
        clearTimeout(timeout);
      }
    },

    analyzeProject: async (request: AiServiceAnalyzeRequest): Promise<AiServiceAnalysisResponse> => {
      const url = `${baseUrl}/bw/analyze`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          logger.error('AI service returned a non-success response', {
            url,
            status: response.status,
            body: body ? sanitizeResponseBody(body) : undefined,
          });
          throw new AiServiceError(
            `AI service returned ${response.status} for ${url}`,
            response.status,
            url
          );
        }

        return await response.json() as AiServiceAnalysisResponse;
      } catch (error) {
        if (error instanceof AiServiceError) {
          throw error;
        }

        const message = error instanceof Error && error.name === 'AbortError'
          ? `AI service request to ${url} timed out after ${timeoutMs}ms`
          : `AI service request to ${url} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        throw new AiServiceError(message, undefined, url);
      } finally {
        clearTimeout(timeout);
      }
    },

    // Streams the analysis phase by phase. `onPhase` fires as each phase starts
    // and finishes, letting the caller persist live progress; the resolved value
    // is the final analysis. Falls back to throwing on an `error` event or a
    // stream that ends without a `result`.
    analyzeProjectStream: async (
      request: AiServiceAnalyzeRequest,
      onPhase: (event: AiServicePhaseEvent) => void | Promise<void>
    ): Promise<AiServiceAnalysisResponse> => {
      const url = `${baseUrl}/bw/analyze/stream`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const body = await response.text().catch(() => '');
          logger.error('AI service returned a non-success response for streaming analysis', {
            url,
            status: response.status,
            body: body ? sanitizeResponseBody(body) : undefined,
          });
          throw new AiServiceError(
            `AI service returned ${response.status} for ${url}`,
            response.status,
            url
          );
        }

        const reader = (response.body as ReadableStream<Uint8Array>).getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let result: AiServiceAnalysisResponse | null = null;

        const handleLine = async (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(trimmed);
          } catch {
            logger.warn('Skipping unparseable AI service stream line', { url });
            return;
          }

          if (event.event === 'phase') {
            await onPhase({
              phase: String(event.phase),
              status: event.status as AiServicePhaseStatus,
              index: Number(event.index),
              total: Number(event.total),
            });
          } else if (event.event === 'result') {
            result = event.data as AiServiceAnalysisResponse;
          } else if (event.event === 'error') {
            throw new AiServiceError(
              `AI service streaming analysis failed: ${String(event.message ?? 'unknown error')}`,
              undefined,
              url
            );
          }
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIndex = buffer.indexOf('\n');
          while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            await handleLine(line);
            newlineIndex = buffer.indexOf('\n');
          }
        }
        await handleLine(buffer);

        if (!result) {
          throw new AiServiceError(`AI service stream from ${url} ended without a result`, undefined, url);
        }

        return result;
      } catch (error) {
        if (error instanceof AiServiceError) {
          throw error;
        }

        const message = error instanceof Error && error.name === 'AbortError'
          ? `AI service request to ${url} timed out after ${timeoutMs}ms`
          : `AI service request to ${url} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        throw new AiServiceError(message, undefined, url);
      } finally {
        clearTimeout(timeout);
      }
    },

    analyzeDocument: async (request: AiServiceAnalyzeDocumentRequest): Promise<AiServiceAnalyzeDocumentResponse> => {
      const url = `${baseUrl}/bw/analyze-document`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          logger.error('AI service returned a non-success response for document analysis', {
            url,
            status: response.status,
            body: body ? sanitizeResponseBody(body) : undefined,
          });
          throw new AiServiceError(
            `AI service returned ${response.status} for ${url}`,
            response.status,
            url
          );
        }

        return await response.json() as AiServiceAnalyzeDocumentResponse;
      } catch (error) {
        if (error instanceof AiServiceError) {
          throw error;
        }

        const message = error instanceof Error && error.name === 'AbortError'
          ? `AI service request to ${url} timed out after ${timeoutMs}ms`
          : `AI service request to ${url} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        throw new AiServiceError(message, undefined, url);
      } finally {
        clearTimeout(timeout);
      }
    },

    findStatements: async (
      input: AiServiceProjectInput,
      docId: string
    ): Promise<AiServiceDocumentStatement[]> => {
      const url = `${baseUrl}/bw/find-statements`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ input, doc_id: docId }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          logger.error('AI service find-statements non-success', {
            url,
            status: response.status,
            body: body ? sanitizeResponseBody(body) : undefined,
          });
          throw new AiServiceError(`AI service returned ${response.status} for ${url}`, response.status, url);
        }

        return await response.json() as AiServiceDocumentStatement[];
      } catch (error) {
        if (error instanceof AiServiceError) throw error;
        const message = error instanceof Error && error.name === 'AbortError'
          ? `AI service request to ${url} timed out after ${timeoutMs}ms`
          : `AI service request to ${url} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        throw new AiServiceError(message, undefined, url);
      } finally {
        clearTimeout(timeout);
      }
    },

    getSource: async (id: string): Promise<AiServiceOpenResearchSource | null> => {
      const url = `${baseUrl}/bw/source/${encodeURIComponent(id)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(url, {
          method: 'GET',
          signal: controller.signal,
        });

        if (response.status === 404) {
          return null;
        }
        if (!response.ok) {
          const body = await response.text().catch(() => '');
          logger.error('AI service getSource non-success', {
            url,
            status: response.status,
            body: body ? sanitizeResponseBody(body) : undefined,
          });
          throw new AiServiceError(`AI service returned ${response.status} for ${url}`, response.status, url);
        }

        return await response.json() as AiServiceOpenResearchSource;
      } catch (error) {
        if (error instanceof AiServiceError) throw error;
        const message = error instanceof Error && error.name === 'AbortError'
          ? `AI service request to ${url} timed out after ${timeoutMs}ms`
          : `AI service request to ${url} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        throw new AiServiceError(message, undefined, url);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
};

export const mapProjectToAiServiceInput = (
  project: ProjectDocument,
  theme?: string,
  // The dashboard's editable search question (the "Hier vind je inspiratie voor"
  // subject) drives the search: when set it replaces the scan subject as the
  // primary goal, otherwise we fall back to the step-2 intake answer.
  searchQuestion?: string,
): AiServiceProjectInput => {
  const reason = Array.isArray((project as any).reason) ? (project as any).reason : [];
  const scopeParts = [
    reason.length ? `Aanleiding: ${reason.join(', ')}` : '',
    (project as any).reasonOther ? `Anders, namelijk: ${(project as any).reasonOther}` : '',
    (project as any).scope ? `Scope: ${(project as any).scope}` : '',
    (project as any).additionalContext ? `Aanvullende context: ${(project as any).additionalContext}` : '',
  ].filter(Boolean);

  const subject = searchQuestion?.trim() || (project as any).scanGoal;

  return {
    goal: [subject, (project as any).impactSituation].filter(Boolean).join('\n\n'),
    motivation: (project as any).impactMotivation || '',
    scope: scopeParts.join('\n\n'),
    language: 'nl',
    top_n: 20,
    ...(theme ? { theme } : {}),
  };
};

export const defaultAiServiceClient = createAiServiceClient();
