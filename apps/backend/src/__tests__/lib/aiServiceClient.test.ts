import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  AiServiceClientOptions,
  createAiServiceClient,
  mapProjectToAiServiceInput,
} from '../../lib/aiServiceClient';

type TestFetch = NonNullable<AiServiceClientOptions['fetchImpl']>;

describe('aiServiceClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts key message generation to the dedicated endpoint', async () => {
    const fetchImpl = jest.fn<TestFetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ key_message: '• Een evenwichtige kernboodschap' }),
    } as Response);
    const client = createAiServiceClient({ baseUrl: 'http://ai-service.test/', fetchImpl });
    const request = {
      name: 'Scan', description: 'Beschrijving', goal: 'Doel', motivation: 'Motivatie', scope: 'Amsterdam',
      themes: [{
        name: 'Wonen',
        slug: 'wonen',
        arguments: [{ title: 'Effect', explanation: 'Uitleg', sentiment: 'POSITIVE' }],
      }],
    };

    await expect(client.generateKeyMessage(request)).resolves.toBe('• Een evenwichtige kernboodschap');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://ai-service.test/bw/generate-key-message',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(request) })
    );
  });

  it('posts analysis requests to /bw/analyze', async () => {
    const fetchImpl = jest.fn<TestFetch>()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ project_id: 'project-1', sources: [] }),
      } as Response);
    const client = createAiServiceClient({
      baseUrl: 'http://ai-service.test/',
      timeoutMs: 1000,
      fetchImpl,
    });

    const result = await client.analyzeProject({
      project_id: 'project-1',
      input: {
        goal: 'Doel',
        motivation: 'Motivatie',
        scope: 'Scope',
        language: 'nl',
        top_n: 20,
      },
      features: ['sources', 'authors'],
    });

    expect(result).toEqual({ project_id: 'project-1', sources: [] });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://ai-service.test/bw/analyze',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project_id: 'project-1',
          input: {
            goal: 'Doel',
            motivation: 'Motivatie',
            scope: 'Scope',
            language: 'nl',
            top_n: 20,
          },
          features: ['sources', 'authors'],
        }),
      })
    );
  });

  it('posts uploaded document analysis requests to /bw/analyze-document', async () => {
    const fetchImpl = jest.fn<TestFetch>()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          summary: { title: 'Titel', summary: 'Samenvatting' },
          statements: [{ text: 'Fragment', page: 2, source: 'upload' }],
        }),
      } as Response);
    const client = createAiServiceClient({
      baseUrl: 'http://ai-service.test/',
      timeoutMs: 1000,
      fetchImpl,
    });

    const result = await client.analyzeDocument({
      input: {
        goal: 'Doel',
        motivation: 'Motivatie',
        scope: 'Scope',
        language: 'nl',
        top_n: 20,
        theme: 'Subjectief welzijn',
      },
      blob_path: 'uploads/project/documents/document/original.pdf',
      filename: 'onderzoek.pdf',
    });

    expect(result).toEqual({
      summary: { title: 'Titel', summary: 'Samenvatting' },
      statements: [{ text: 'Fragment', page: 2, source: 'upload' }],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://ai-service.test/bw/analyze-document',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          input: {
            goal: 'Doel',
            motivation: 'Motivatie',
            scope: 'Scope',
            language: 'nl',
            top_n: 20,
            theme: 'Subjectief welzijn',
          },
          blob_path: 'uploads/project/documents/document/original.pdf',
          filename: 'onderzoek.pdf',
        }),
      })
    );
  });

  it('raises a typed error for non-successful AI service responses', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchImpl = jest.fn<TestFetch>()
      .mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => '<html><body>bad gateway</body></html>',
      } as Response);
    const client = createAiServiceClient({
      baseUrl: 'http://ai-service.test',
      timeoutMs: 1000,
      fetchImpl,
    });

    await expect(client.analyzeProject({
      project_id: 'project-1',
      input: {
        goal: 'Doel',
        motivation: 'Motivatie',
        scope: '',
        language: 'nl',
        top_n: 20,
      },
      features: ['sources'],
    })).rejects.toMatchObject({
      name: 'AiServiceError',
      status: 502,
      url: 'http://ai-service.test/bw/analyze',
      message: 'AI service returned 502 for http://ai-service.test/bw/analyze',
    });
    expect(consoleError).toHaveBeenCalledWith(
      '[ERROR] AI service returned a non-success response',
      {
        url: 'http://ai-service.test/bw/analyze',
        status: 502,
        body: 'bad gateway',
      }
    );
  });

  it('includes the target URL when AI service fetch fails', async () => {
    const fetchImpl = jest.fn<TestFetch>()
      .mockRejectedValue(new TypeError('fetch failed'));
    const client = createAiServiceClient({
      baseUrl: 'http://127.0.0.1:8000',
      timeoutMs: 1000,
      fetchImpl,
    });

    await expect(client.analyzeProject({
      project_id: 'project-1',
      input: {
        goal: 'Doel',
        motivation: 'Motivatie',
        scope: '',
        language: 'nl',
        top_n: 20,
      },
      features: ['sources'],
    })).rejects.toMatchObject({
      name: 'AiServiceError',
      status: undefined,
      url: 'http://127.0.0.1:8000/bw/analyze',
      message: 'AI service request to http://127.0.0.1:8000/bw/analyze failed: fetch failed',
    });
  });

  it('maps persisted project intake to the AI service input shape', () => {
    const input = mapProjectToAiServiceInput({
      scanGoal: 'Bied een breder perspectief.',
      impactSituation: 'Nieuw beleid voor de binnenstad.',
      impactMotivation: 'We willen impact op brede welvaart begrijpen.',
      reason: ['OTHER'],
      reasonOther: 'Bestuurlijke vraag',
      scope: 'Amsterdam Centrum',
      additionalContext: 'Let op bezoekersdrukte.',
    } as any);

    expect(input).toEqual({
      goal: 'Bied een breder perspectief.\n\nNieuw beleid voor de binnenstad.',
      motivation: 'We willen impact op brede welvaart begrijpen.',
      scope: [
        'Aanleiding: OTHER',
        'Anders, namelijk: Bestuurlijke vraag',
        'Scope: Amsterdam Centrum',
        'Aanvullende context: Let op bezoekersdrukte.',
      ].join('\n\n'),
      language: 'nl',
      top_n: 20,
    });
  });
});
