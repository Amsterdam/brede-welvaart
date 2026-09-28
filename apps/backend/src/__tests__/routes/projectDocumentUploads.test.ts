import express from 'express';
import request from 'supertest';
import { rateLimit } from 'express-rate-limit';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Project } from '../../models/Project';
import { User } from '../../models/User';
import {
  createProjectDocumentUploadHandler,
  projectDocumentUploadRateLimitOptions,
} from '../../routes/projectDocumentUploads';
import { deleteProjectDocumentBlob, uploadProjectDocumentBlobStream } from '../../lib/projectDocumentStorage';
import { defaultAiServiceClient } from '../../lib/aiServiceClient';
import { getUserForApi } from '../../lib/auth';

jest.mock('../../lib/projectDocumentStorage', () => ({
  buildProjectDocumentBlobPath: jest.fn((projectId: string, documentId: string, fileName: string) =>
    `uploads/${projectId}/documents/${documentId}/${fileName}`
  ),
  uploadProjectDocumentBlobStream: jest.fn(({ content }: { content: NodeJS.ReadableStream }) =>
    new Promise<void>((resolve, reject) => {
      content.on('data', () => undefined);
      content.on('end', resolve);
      content.on('error', reject);
    })
  ),
  deleteProjectDocumentBlob: jest.fn(),
}));

jest.mock('../../lib/aiServiceClient', () => ({
  defaultAiServiceClient: {
    analyzeDocument: jest.fn(),
  },
  mapProjectToAiServiceInput: jest.fn((_project: unknown, theme?: string) => ({
    goal: 'Doel',
    motivation: 'Motivatie',
    scope: 'Scope',
    language: 'nl',
    top_n: 20,
    ...(theme ? { theme } : {}),
  })),
}));

jest.mock('../../lib/auth', () => ({
  verifyToken: jest.fn(),
  getUserForApi: jest.fn(),
}));

jest.mock('../../lib/serviceToken', () => ({
  isServiceToken: jest.fn(() => false),
  verifyServiceToken: jest.fn(),
}));

const waitFor = async (assertion: () => void | Promise<void>, timeoutMs = 1000) => {
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

const createUploadApp = (maxFileSizeBytes?: number) => {
  const app = express();
  app.post(
    '/projects/:projectId/upload-document',
    rateLimit(projectDocumentUploadRateLimitOptions),
    createProjectDocumentUploadHandler({ maxFileSizeBytes })
  );
  return app;
};

const createOwnerAndProject = async () => {
  const owner = await User.create({
    entraId: 'owner@example.com',
    email: 'owner@example.com',
    displayName: 'Owner User',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const project = await Project.create({
    name: 'Upload Project',
    description: 'Upload project description',
    slug: 'upload-project',
    status: 'DRAFT',
    createdBy: owner._id,
    scanGoal: 'Doel',
    impactMotivation: 'Motivatie',
    scope: 'Scope',
    users: [{ user: owner._id, role: 'OWNER' }],
    themes: [
      {
        slug: 'wonen',
        name: 'Wonen',
        description: 'Wonen description',
        arguments: [],
      },
    ],
    uploadedDocuments: [],
  });

  jest.mocked(getUserForApi).mockResolvedValue(owner as any);

  return { owner, project };
};

describe('project document upload route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(defaultAiServiceClient.analyzeDocument).mockResolvedValue({
      summary: null,
      statements: [],
    });
  });

  it('streams a multipart document to blob storage and persists it', async () => {
    const { project } = await createOwnerAndProject();
    const app = createUploadApp();

    const response = await request(app)
      .post(`/projects/${project._id.toString()}/upload-document`)
      .set('Authorization', 'Bearer test-token')
      .field('themeSlug', 'wonen')
      .field('name', 'Eigen document')
      .attach('file', Buffer.from('test document content'), {
        filename: 'document.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      themeSlug: 'wonen',
      fileName: 'document.pdf',
      mimeType: 'application/pdf',
      size: Buffer.byteLength('test document content'),
      name: 'Eigen document',
      analysisStatus: 'RUNNING',
    });
    expect(response.body.data.blobPath).toMatch(
      new RegExp(`^uploads/${project._id.toString()}/documents/[a-f0-9]{24}/document\\.pdf$`)
    );

    expect(uploadProjectDocumentBlobStream).toHaveBeenCalledWith(expect.objectContaining({
      blobPath: response.body.data.blobPath,
      mimeType: 'application/pdf',
    }));

    const persisted = await Project.findById(project._id).lean();
    expect((persisted as any).uploadedDocuments).toHaveLength(1);
    expect((persisted as any).uploadedDocuments[0]).toMatchObject({
      fileName: 'document.pdf',
      size: Buffer.byteLength('test document content'),
      blobPath: response.body.data.blobPath,
    });

    await waitFor(() => {
      expect(defaultAiServiceClient.analyzeDocument).toHaveBeenCalledWith(expect.objectContaining({
        blob_path: response.body.data.blobPath,
        filename: 'document.pdf',
      }));
    });
  });

  it('rejects oversized multipart documents and removes the partial blob', async () => {
    const { project } = await createOwnerAndProject();
    const app = createUploadApp(4);

    const response = await request(app)
      .post(`/projects/${project._id.toString()}/upload-document`)
      .set('Authorization', 'Bearer test-token')
      .field('themeSlug', 'wonen')
      .attach('file', Buffer.from('too large'), {
        filename: 'large.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(413);
    expect(response.body.errors[0].message).toBe('Het bestand mag maximaal 100 MB zijn.');
    expect(deleteProjectDocumentBlob).toHaveBeenCalledWith(expect.stringMatching(
      new RegExp(`^uploads/${project._id.toString()}/documents/[a-f0-9]{24}/large\\.pdf$`)
    ));

    const persisted = await Project.findById(project._id).lean();
    expect((persisted as any).uploadedDocuments).toHaveLength(0);
    expect(defaultAiServiceClient.analyzeDocument).not.toHaveBeenCalled();
  });

  it('rejects reviewers', async () => {
    const owner = await User.create({
      entraId: 'owner@example.com',
      email: 'owner@example.com',
      displayName: 'Owner User',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const reviewer = await User.create({
      entraId: 'reviewer@example.com',
      email: 'reviewer@example.com',
      displayName: 'Reviewer User',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const project = await Project.create({
      name: 'Reviewer Project',
      description: 'Reviewer project description',
      slug: 'reviewer-project',
      status: 'DRAFT',
      createdBy: owner._id,
      users: [
        { user: owner._id, role: 'OWNER' },
        { user: reviewer._id, role: 'REVIEWER' },
      ],
      themes: [{ slug: 'wonen', name: 'Wonen', description: 'Wonen description', arguments: [] }],
      uploadedDocuments: [],
    });
    jest.mocked(getUserForApi).mockResolvedValue(reviewer as any);

    const response = await request(createUploadApp())
      .post(`/projects/${project._id.toString()}/upload-document`)
      .set('Authorization', 'Bearer test-token')
      .field('themeSlug', 'wonen')
      .attach('file', Buffer.from('content'), {
        filename: 'document.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(401);
    expect(uploadProjectDocumentBlobStream).not.toHaveBeenCalled();
  });
});
