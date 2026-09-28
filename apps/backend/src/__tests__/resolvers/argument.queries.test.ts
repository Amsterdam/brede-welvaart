import { describe, it, expect, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { createTestServer, executeOperation, TestUser } from '../utils/testServer';
import { Argument } from '../../models/Argument';
import { Project } from '../../models/Project';
import { Theme } from '../../models/Theme';

describe('Argument Queries', () => {
  let mockUser: TestUser;
  let project: any;
  let theme: any;

  beforeEach(async () => {
    mockUser = {
      id: new mongoose.Types.ObjectId().toString(),
      entraId: 'test-entra-id',
      email: 'test@example.com',
      displayName: 'Test User',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Create a project and theme for argument association
    project = await Project.create({
      name: 'Test Project',
      description: 'A test project',
      status: 'PUBLISHED',
      createdBy: mockUser.id
    });

    theme = await Theme.create({
      name: 'Test Theme',
      slug: 'test-theme',
      projectId: project.id,
      color: '#000000'
    });
  });

  describe('theme(id: ID!) { arguments { ... } }', () => {
    it('returns all arguments for the theme', async () => {
      const arg1 = await Argument.create({
        title: 'Test Argument 1',
        explanation: 'Test explanation 1',
        importance: 'HIGH',
        timeFrame: ['NOW'],
        location: ['CITY'],
        source: { type: 'EXPERT', link: null },
        sentiment: 'POSITIVE',
        theme: theme.id,
        discussionPoint: false
      });

      const arg2 = await Argument.create({
        title: 'Test Argument 2',
        explanation: 'Test explanation 2',
        importance: 'LOW',
        timeFrame: ['FUTURE'],
        location: ['REGION'],
        source: { type: 'RESIDENT', link: null },
        sentiment: 'NEGATIVE',
        theme: theme.id,
        discussionPoint: true
      });

      const server = createTestServer();
      const query = `
        query ThemeArguments($id: ID!) {
          theme(id: $id) {
            id
            arguments {
              id
              title
              explanation
              importance
              timeFrame
              location
              source { type link }
              sentiment
              discussionPoint
            }
          }
        }
      `;
      const response = await executeOperation(server, query, { id: theme.id }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      const args = (response.body as any).singleResult.data.theme.arguments;
      expect(Array.isArray(args)).toBe(true);
      expect(args.length).toBe(2);
      const titles = args.map((a: any) => a.title);
      expect(titles).toContain(arg1.title);
      expect(titles).toContain(arg2.title);
    });

    it('returns an empty array if the theme has no arguments', async () => {
      await Argument.deleteMany({ theme: theme.id });
      const server = createTestServer();
      const query = `
        query ThemeArguments($id: ID!) {
          theme(id: $id) {
            id
            arguments {
              id
              title
            }
          }
        }
      `;
      const response = await executeOperation(server, query, { id: theme.id }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      const args = (response.body as any).singleResult.data.theme.arguments;
      expect(args).toEqual([]);
    });

    it('returns null for non-existent theme', async () => {
      const server = createTestServer();
      const query = `
        query ThemeArguments($id: ID!) {
          theme(id: $id) {
            id
            arguments {
              id
              title
            }
          }
        }
      `;
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const response = await executeOperation(server, query, { id: nonExistentId }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      const themeData = (response.body as any).singleResult.data.theme;
      expect(themeData).toBeNull();
    });

    it('returns an error for invalid theme ID format', async () => {
      const server = createTestServer();
      const query = `
        query ThemeArguments($id: ID!) {
          theme(id: $id) {
            id
            arguments {
              id
              title
            }
          }
        }
      `;
      const response = await executeOperation(server, query, { id: 'not-a-valid-id' }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      const errors = (response.body as any).singleResult.errors;
      expect(errors).toBeDefined();
      const data = (response.body as any).singleResult.data;
      expect(data?.theme).toBeNull();
    });
  });

  describe('createArgument(projectId, themeSlug, input): Argument!', () => {
    it('creates an argument with valid input', async () => {
      const server = createTestServer();
      const mutation = `
        mutation CreateArgument($projectId: ID!, $themeSlug: String!, $input: CreateArgumentInput!) {
          createArgument(projectId: $projectId, themeSlug: $themeSlug, input: $input) {
            id
            title
            importance
            source { type }
            sentiment
            discussionPoint
          }
        }
      `;
      const input = {
        title: 'Created Argument',
        explanation: 'Created explanation',
        importance: 'MEDIUM',
        timeFrame: ['NOW'],
        location: ['CITY'],
        source: { type: 'EXPERT', link: null },
        sentiment: 'NEUTRAL',
        discussionPoint: true
      };
      const response = await executeOperation(
        server,
        mutation,
        { projectId: project.id, themeSlug: theme.slug, input },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      const data = (response.body as any).singleResult.data.createArgument;
      expect(data).toBeTruthy();
      expect(data.title).toBe('Created Argument');
      expect(data.importance).toBe('MEDIUM');
    });

    it('returns error for missing required input', async () => {
      const server = createTestServer();
      const mutation = `
        mutation CreateArgument($projectId: ID!, $themeSlug: String!, $input: CreateArgumentInput!) {
          createArgument(projectId: $projectId, themeSlug: $themeSlug, input: $input) {
            id
          }
        }
      `;
      // Missing required 'title'
      const input = {
        explanation: 'No title',
        importance: 'LOW',
        timeFrame: ['NOW'],
        location: ['CITY'],
        source: { type: 'EXPERT', link: null },
        sentiment: 'NEGATIVE',
        discussionPoint: false
      };
      const response = await executeOperation(
        server,
        mutation,
        { projectId: project.id, themeSlug: theme.slug, input },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      const errors = (response.body as any).singleResult.errors;
      expect(errors && errors.length).toBeGreaterThan(0);
    });
  });

  describe('updateArgument(id, input): Argument!', () => {
    it('updates an argument with valid input', async () => {
      const arg = await Argument.create({
        title: 'To Update',
        explanation: 'Old explanation',
        importance: 'LOW',
        timeFrame: ['NOW'],
        location: ['CITY'],
        source: { type: 'EXPERT', link: null },
        sentiment: 'NEGATIVE',
        theme: theme.id,
        discussionPoint: false
      });

      const server = createTestServer();
      const mutation = `
        mutation UpdateArgument($id: ID!, $input: UpdateArgumentInput!) {
          updateArgument(id: $id, input: $input) {
            id
            title
            explanation
            importance
          }
        }
      `;
      const input = {
        title: 'Updated Title',
        explanation: 'Updated explanation',
        importance: 'HIGH'
      };
      const response = await executeOperation(
        server,
        mutation,
        { id: arg.id, input },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      const data = (response.body as any).singleResult.data.updateArgument;
      expect(data).toBeTruthy();
      expect(data.title).toBe('Updated Title');
      expect(data.importance).toBe('HIGH');
    });

    it('returns error when updating non-existent argument', async () => {
      const server = createTestServer();
      const mutation = `
        mutation UpdateArgument($id: ID!, $input: UpdateArgumentInput!) {
          updateArgument(id: $id, input: $input) {
            id
          }
        }
      `;
      const input = { title: 'Should Not Exist' };
      const response = await executeOperation(
        server,
        mutation,
        { id: new mongoose.Types.ObjectId().toString(), input },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      const errors = (response.body as any).singleResult.errors;
      expect(errors && errors.length).toBeGreaterThan(0);
    });
  });
});
