import { describe, it, expect, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { createTestServer, executeOperation, TestUser } from '../utils/testServer';
import { Project } from '../../models/Project';
import { Comment } from '../../models/Comment';
import { User } from '../../models/User';

describe('Comment Queries', () => {
  let mockUser: TestUser;
  let project: any;

  beforeEach(async () => {
    await Comment.deleteMany({});
    await Project.deleteMany({});
    await User.deleteMany({});

    mockUser = {
      id: new mongoose.Types.ObjectId().toString(),
      entraId: 'test-entra-id',
      email: 'test@example.com',
      displayName: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    project = await Project.create({
      name: 'Test Project',
      description: 'A test project',
      status: 'PUBLISHED',
      createdBy: mockUser.id,
      users: [{ user: mockUser.id, role: 'OWNER' }]
    });

    await User.create({
      _id: mockUser.id,
      entraId: mockUser.entraId,
      email: mockUser.email,
      displayName: mockUser.displayName
    });
  });

  it('returns comments for a given project', async () => {
    const comment = await Comment.create({
      projectId: project.id,
      author: mockUser.id,
      body: 'Test comment',
      resolved: false,
      replies: []
    });

    const server = createTestServer();
    const query = `
      query Comments($projectSlug: ID!) {
        comments(projectSlug: $projectSlug) {
          id
          body
          resolved
          author { id email }
          replies { id body resolved author { id } }
        }
      }
    `;

    const response = await executeOperation(
      server,
      query,
      { projectSlug: project.slug },
      { user: mockUser, isAuthenticated: true }
    );

    expect(response.body.kind).toBe('single');
    const data = (response.body as any).singleResult.data;
    expect(data.comments).toHaveLength(1);
    expect(data.comments[0].body).toBe('Test comment');
  });

  it('returns an empty array if no comments exist for the project', async () => {
    const server = createTestServer();
    const query = `
      query Comments($projectSlug: ID!) {
        comments(projectSlug: $projectSlug) {
          id
        }
      }
    `;

    const response = await executeOperation(
      server,
      query,
      { projectSlug: project.slug },
      { user: mockUser, isAuthenticated: true }
    );

    expect(response.body.kind).toBe('single');
    const data = (response.body as any).singleResult.data;
    expect(data.comments).toEqual([]);
  });

  it('returns an error if projectId is invalid', async () => {
    const server = createTestServer();
    const query = `
      query Comments($projectSlug: ID!) {
        comments(projectSlug: $projectSlug) {
          id
        }
      }
    `;

    const response = await executeOperation(
      server,
      query,
      { projectSlug: 'missing-project' },
      { user: mockUser, isAuthenticated: true }
    );

    expect(response.body.kind).toBe('single');
    const singleResult = (response.body as any).singleResult;
    expect(singleResult.errors).toBeDefined();
    expect(singleResult.data).toBeNull();
  });

  it('returns an authentication error if user is not authenticated', async () => {
    const server = createTestServer();
    const query = `
      query Comments($projectSlug: ID!) {
        comments(projectSlug: $projectSlug) {
          id
        }
      }
    `;

    const response = await executeOperation(
      server,
      query,
      { projectSlug: project.slug },
      { user: null, isAuthenticated: false }
    );

    expect(response.body.kind).toBe('single');
    const singleResult = (response.body as any).singleResult;
    expect(singleResult.errors).toBeDefined();
    expect(singleResult.data).toBeNull();
  });
});
