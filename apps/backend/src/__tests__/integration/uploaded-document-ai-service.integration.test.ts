import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import mongoose from 'mongoose';
import { deleteProjectDocumentBlob, uploadProjectDocumentBlob } from '../../lib/projectDocumentStorage';
import type { TestUser } from '../utils/testServer';

jest.mock('../../lib/projectDocumentStorage', () => ({
  buildProjectDocumentBlobPath: jest.fn((projectId: string, documentId: string) =>
    `uploads/${projectId}/documents/${documentId}/original.pdf`
  ),
  uploadProjectDocumentBlob: jest.fn(),
  deleteProjectDocumentBlob: jest.fn(),
}));

type TestServerModule = typeof import('../utils/testServer');
type ProjectModel = typeof import('../../models/Project')['Project'];

type AiServiceRequest = {
  method?: string;
  url?: string;
  body: any;
};

type AiServiceResponse = {
  status: number;
  body: Record<string, unknown>;
};

const mockUser: TestUser = {
  id: new mongoose.Types.ObjectId().toString(),
  entraId: 'integration-user',
  email: 'integration@example.com',
  displayName: 'Integration User',
  createdAt: new Date(),
  updatedAt: new Date(),
};

let Project: ProjectModel;
let createTestServer: TestServerModule['createTestServer'];
let executeOperation: TestServerModule['executeOperation'];

let aiService: Server;
let aiServiceBaseUrl: string;
let aiServiceRequests: AiServiceRequest[] = [];
let nextAiServiceResponse: AiServiceResponse = {
  status: 200,
  body: {
    summary: {
      title: 'Gegenereerde documenttitel',
      summary: 'Gegenereerde samenvatting uit de AI-service.',
    },
    statements: [
      {
        text: 'Een relevante passage uit het geuploade document.',
        doc_id: 'upload:onderzoek:1',
        title: 'Onderzoek',
        url: 'https://example.test/onderzoek.pdf',
        author: 'Onderzoeker',
        page: 4,
        score: 0.87,
        source: 'upload',
      },
    ],
  },
};

const readJsonBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : null;
};

const sendJson = (response: ServerResponse, status: number, body: Record<string, unknown>) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

const waitFor = async (assertion: () => void | Promise<void>, timeoutMs = 1500) => {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }

  throw lastError;
};

const createProjectWithUploadTheme = async () => Project.create({
  name: 'Document AI Integration',
  slug: 'document-ai-integration',
  description: 'Project used for uploaded document integration tests',
  status: 'DRAFT',
  createdBy: mockUser.id,
  reason: ['NEW_POLICY'],
  scanGoal: 'Maak effecten op brede welvaart zichtbaar.',
  impactSituation: 'Nieuw beleid raakt bewoners en ondernemers.',
  impactMotivation: 'We willen de documentanalyse meenemen in de scan.',
  scope: 'Amsterdam Centrum',
  additionalContext: 'Gebruik alleen relevante passages.',
  themes: [{ slug: 'subjectief-welzijn', name: 'Subjectief welzijn', description: 'Welzijn' }],
  users: [{ user: mockUser.id, role: 'OWNER' }],
});

const uploadDocumentMutation = `
  mutation UploadProjectDocument($projectId: ID!, $input: UploadProjectDocumentInput!) {
    uploadProjectDocument(projectId: $projectId, input: $input) {
      id
      themeSlug
      fileName
      mimeType
      size
      name
      description
      keyword
      blobPath
      analysisStatus
      analysisError
      aiStatements {
        text
      }
      uploadedBy
    }
  }
`;

const projectDocumentsQuery = `
  query ProjectDocuments($slug: String!) {
    project(slug: $slug) {
      id
      uploadedDocuments {
        id
        themeSlug
        fileName
        mimeType
        size
        name
        description
        keyword
        blobPath
        analysisStatus
        analysisError
        aiTitle
        aiDescription
        aiStatements {
          text
          docId
          title
          url
          author
          page
          score
          source
        }
        uploadedBy
      }
    }
  }
`;

const uploadDocument = async (projectId: string) => {
  const server = createTestServer();
  const content = Buffer.from('uploaded integration document content');

  return executeOperation(server, uploadDocumentMutation, {
    projectId,
    input: {
      themeSlug: 'subjectief-welzijn',
      fileName: 'onderzoek.pdf',
      mimeType: 'application/pdf',
      size: content.length,
      contentBase64: content.toString('base64'),
      name: 'Observatieonderzoek',
      description: 'Onderzoek naar leefbaarheid.',
      keyword: 'Subjectief welzijn',
    },
  }, {
    user: mockUser,
    isAuthenticated: true,
  });
};

beforeAll(async () => {
  aiService = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/bw/analyze-document') {
      sendJson(response, 404, { detail: 'Not found' });
      return;
    }

    const body = await readJsonBody(request);
    aiServiceRequests.push({ method: request.method, url: request.url, body });
    sendJson(response, nextAiServiceResponse.status, nextAiServiceResponse.body);
  });

  await new Promise<void>((resolve) => {
    aiService.listen(0, '127.0.0.1', resolve);
  });
  const address = aiService.address() as AddressInfo;
  aiServiceBaseUrl = `http://127.0.0.1:${address.port}`;

  const { default: config } = await import('../../config');
  config.aiService.baseUrl = aiServiceBaseUrl;
  config.aiService.timeoutMs = 2000;
  ({ Project } = await import('../../models/Project'));
  ({ createTestServer, executeOperation } = await import('../utils/testServer'));
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    aiService.close((error) => error ? reject(error) : resolve());
  });
});

beforeEach(() => {
  aiServiceRequests = [];
  nextAiServiceResponse = {
    status: 200,
    body: {
      summary: {
        title: 'Gegenereerde documenttitel',
        summary: 'Gegenereerde samenvatting uit de AI-service.',
      },
      statements: [
        {
          text: 'Een relevante passage uit het geuploade document.',
          doc_id: 'upload:onderzoek:1',
          title: 'Onderzoek',
          url: 'https://example.test/onderzoek.pdf',
          author: 'Onderzoeker',
          page: 4,
          score: 0.87,
          source: 'upload',
        },
      ],
    },
  };
  jest.clearAllMocks();
});

describe('uploaded document AI-service integration', () => {
  it('uploads a document, sends it to the AI service, and retrieves completed analysis from the project query', async () => {
    const project = await createProjectWithUploadTheme();
    const uploadResponse = await uploadDocument(project._id.toString());

    expect(uploadResponse.body.kind).toBe('single');
    expect((uploadResponse.body as any).singleResult.errors).toBeUndefined();
    const uploadedDocument = (uploadResponse.body as any).singleResult.data.uploadProjectDocument;
    expect(uploadedDocument).toMatchObject({
      themeSlug: 'subjectief-welzijn',
      fileName: 'onderzoek.pdf',
      mimeType: 'application/pdf',
      name: 'Observatieonderzoek',
      description: 'Onderzoek naar leefbaarheid.',
      keyword: 'Subjectief welzijn',
      blobPath: expect.stringMatching(new RegExp(`^uploads/${project._id.toString()}/documents/[a-f0-9]{24}/original\\.pdf$`)),
      analysisStatus: 'RUNNING',
      analysisError: null,
      uploadedBy: mockUser.id,
    });

    expect(uploadProjectDocumentBlob).toHaveBeenCalledWith(expect.objectContaining({
      blobPath: uploadedDocument.blobPath,
      content: Buffer.from('uploaded integration document content'),
      mimeType: 'application/pdf',
    }));
    expect(deleteProjectDocumentBlob).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(aiServiceRequests).toHaveLength(1);
    });
    expect(aiServiceRequests[0]).toMatchObject({
      method: 'POST',
      url: '/bw/analyze-document',
      body: {
        input: {
          goal: 'Maak effecten op brede welvaart zichtbaar.\n\nNieuw beleid raakt bewoners en ondernemers.',
          motivation: 'We willen de documentanalyse meenemen in de scan.',
          scope: [
            'Aanleiding: NEW_POLICY',
            'Scope: Amsterdam Centrum',
            'Aanvullende context: Gebruik alleen relevante passages.',
          ].join('\n\n'),
          language: 'nl',
          top_n: 20,
          theme: 'Subjectief welzijn',
        },
        blob_path: uploadedDocument.blobPath,
        filename: 'onderzoek.pdf',
      },
    });
    expect(JSON.stringify(aiServiceRequests[0].body)).not.toContain('contentBase64');

    await waitFor(async () => {
      const completed = await Project.findById(project._id);
      expect((completed as any).uploadedDocuments[0].analysisStatus).toBe('COMPLETED');
    });

    const queryResponse = await executeOperation(createTestServer(), projectDocumentsQuery, {
      slug: 'document-ai-integration',
    }, {
      user: mockUser,
      isAuthenticated: true,
    });

    expect(queryResponse.body.kind).toBe('single');
    expect((queryResponse.body as any).singleResult.errors).toBeUndefined();
    expect((queryResponse.body as any).singleResult.data.project.uploadedDocuments).toEqual([
      expect.objectContaining({
        id: uploadedDocument.id,
        name: 'Gegenereerde documenttitel',
        description: 'Gegenereerde samenvatting uit de AI-service.',
        aiTitle: 'Gegenereerde documenttitel',
        aiDescription: 'Gegenereerde samenvatting uit de AI-service.',
        analysisStatus: 'COMPLETED',
        analysisError: null,
        blobPath: uploadedDocument.blobPath,
        aiStatements: [
          {
            text: 'Een relevante passage uit het geuploade document.',
            docId: 'upload:onderzoek:1',
            title: 'Onderzoek',
            url: 'https://example.test/onderzoek.pdf',
            author: 'Onderzoeker',
            page: 4,
            score: 0.87,
            source: 'upload',
          },
        ],
      }),
    ]);
  });

  it('keeps the upload retrievable and marks analysis failed when the AI service rejects the document', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    nextAiServiceResponse = {
      status: 422,
      body: { detail: 'Document analysis failed.' },
    };
    const project = await createProjectWithUploadTheme();
    const uploadResponse = await uploadDocument(project._id.toString());

    expect(uploadResponse.body.kind).toBe('single');
    expect((uploadResponse.body as any).singleResult.errors).toBeUndefined();
    const uploadedDocument = (uploadResponse.body as any).singleResult.data.uploadProjectDocument;
    expect(uploadedDocument.analysisStatus).toBe('RUNNING');

    await waitFor(async () => {
      const failed = await Project.findById(project._id);
      expect((failed as any).uploadedDocuments[0].analysisStatus).toBe('FAILED');
    });

    expect(aiServiceRequests).toHaveLength(1);
    const queryResponse = await executeOperation(createTestServer(), projectDocumentsQuery, {
      slug: 'document-ai-integration',
    }, {
      user: mockUser,
      isAuthenticated: true,
    });

    expect(queryResponse.body.kind).toBe('single');
    expect((queryResponse.body as any).singleResult.errors).toBeUndefined();
    expect((queryResponse.body as any).singleResult.data.project.uploadedDocuments).toEqual([
      expect.objectContaining({
        id: uploadedDocument.id,
        name: 'Observatieonderzoek',
        description: 'Onderzoek naar leefbaarheid.',
        analysisStatus: 'FAILED',
        analysisError: 'De AI-analyse van dit document is niet gelukt. Probeer het later opnieuw.',
        blobPath: uploadedDocument.blobPath,
        aiStatements: [],
      }),
    ]);
    expect(consoleError).toHaveBeenCalledWith(
      '[ERROR] AI service returned a non-success response for document analysis',
      expect.objectContaining({
        url: `${aiServiceBaseUrl}/bw/analyze-document`,
        status: 422,
      })
    );
  });
});
