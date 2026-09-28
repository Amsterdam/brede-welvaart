import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { createTestServer, executeOperation, TestUser } from '../utils/testServer';
import { Project } from '../../models/Project';
import { projectResolver } from '../../resolvers/project.resolver';
import { IProject } from '@shared/types'

describe('Project Queries', () => {
  describe('projects', () => {
    it('returns empty array when no projects exist', async () => {
      const mockUser: TestUser = {
        id: new mongoose.Types.ObjectId().toString(),
        entraId: 'test-entra-id',
        email: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const server = createTestServer();
      const query = `
        query Projects {
          projects {
            id
            name
            description
          }
        }
      `;

      const response = await executeOperation(server, query, undefined, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.data?.projects).toEqual([]);
    });

    it('returns projects when they exist', async () => {
      const mockUser: TestUser = {
        id: new mongoose.Types.ObjectId().toString(),
        entraId: 'test-entra-id',
        email: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Create a test project in the memory database with the user as OWNER
      const project = await Project.create({
        name: 'Test Project',
        description: 'A test project',
        status: 'PUBLISHED',
        createdBy: mockUser.id,
        users: [
          {
            user: mockUser.id,
            role: 'OWNER'
          }
        ]
      });

      const server = createTestServer();
      const query = `
        query Projects {
          projects {
            id
            name
            description
          }
        }
      `;

      const response = await executeOperation(server, query, undefined, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.data?.projects).toEqual([
        {
          id: project._id?.toString(),
          name: project.name,
          description: project.description
        }
      ]);
    });
  });
describe('project', () => {
    it('returns a project by slug', async () => {
      const mockUser: TestUser = {
        id: new mongoose.Types.ObjectId().toString(),
        entraId: 'test-entra-id',
        email: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Create a test project
      const project = await Project.create({
        name: 'Unique Project',
        slug: 'unique-project',
        description: 'A unique project',
        status: 'PUBLISHED',
        createdBy: mockUser.id,
        users: [
          {
            user: mockUser.id,
            role: 'OWNER'
          }
        ]
      });

      const server = createTestServer();
      const query = `
        query Project($slug: String!) {
          project(slug: $slug) {
            id
            slug
            name
            description
          }
        }
      `;

      const response = await executeOperation(server, query, { slug: 'unique-project' }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.data?.project).toMatchObject({
        id: project._id?.toString(),
        slug: project.slug,
        name: project.name,
        description: project.description
      });
    });

    it('ignores malformed legacy AI draft effects', async () => {
      const mockUser: TestUser = {
        id: new mongoose.Types.ObjectId().toString(),
        entraId: 'test-entra-id',
        email: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const project = await Project.create({
        name: 'Legacy AI Draft Project',
        slug: 'legacy-ai-draft-project',
        description: 'A project with an incomplete legacy AI draft',
        status: 'PUBLISHED',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }]
      });

      await Project.collection.updateOne(
        { _id: project._id },
        {
          $push: {
            aiDraftEffects: {
              $each: [
                {
                  _id: new mongoose.Types.ObjectId(),
                  title: 'Incomplete draft',
                  explanation: 'This legacy record has no theme slug',
                  sentiment: 'NEUTRAL',
                  discussionPoint: false,
                  timeFrame: [],
                  location: [],
                  source: { type: 'DATA' },
                  generatedByAi: true,
                  importance: 'LOW',
                  createdAt: new Date(),
                  updatedAt: new Date()
                },
                {
                  _id: new mongoose.Types.ObjectId(),
                  themeSlug: 'gezondheid',
                  title: 'Complete draft',
                  explanation: 'This draft must remain available',
                  sentiment: 'POSITIVE',
                  discussionPoint: true,
                  timeFrame: ['NOW'],
                  location: ['CITY'],
                  source: { type: 'DATA', link: 'https://example.com/source' },
                  sourceTitle: 'Example source',
                  sourceEffect: {
                    key: 'OPEN_RESEARCH:source-1:gezondheid:effect-1',
                    sourceKind: 'OPEN_RESEARCH',
                    sourceId: 'source-1',
                    effectId: 'effect-1',
                    themeSlug: 'gezondheid',
                    page: 2,
                    text: 'Supporting text'
                  },
                  generatedByAi: true,
                  aiProposal: 'Keep this proposal',
                  importance: 'HIGH',
                  createdAt: new Date(),
                  updatedAt: new Date()
                }
              ]
            }
          } as any
        }
      );

      const server = createTestServer();
      const query = `
        query Project($slug: String!) {
          project(slug: $slug) {
            slug
            aiDraftEffects {
              id
              title
              explanation
              sentiment
              discussionPoint
              timeFrame
              location
              generatedByAi
              aiProposal
              importance
              source {
                link
                type
              }
              sourceTitle
              sourceEffect {
                key
                sourceKind
                sourceId
                effectId
                themeSlug
                page
                text
              }
              createdAt
              updatedAt
            }
          }
        }
      `;

      const response = await executeOperation(server, query, { slug: project.slug }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors).toBeUndefined();
      const result = (response.body as any).singleResult.data?.project;
      expect(result.slug).toBe(project.slug);
      expect(result.aiDraftEffects).toHaveLength(1);
      expect(result.aiDraftEffects[0]).toMatchObject({
        title: 'Complete draft',
        sourceEffect: {
          key: 'OPEN_RESEARCH:source-1:gezondheid:effect-1'
        }
      });
    });

    it('returns themeless AI draft effects', async () => {
      const mockUser: TestUser = {
        id: new mongoose.Types.ObjectId().toString(),
        entraId: 'test-entra-id',
        email: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const project = await Project.create({
        name: 'Themeless AI Draft Project',
        slug: 'themeless-ai-draft-project',
        description: 'A project with a project-level AI draft',
        status: 'PUBLISHED',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }],
        aiDraftEffects: [
          {
            title: 'Themeless draft',
            explanation: 'Drafts get their theme when they are converted',
            sentiment: 'NEUTRAL',
            discussionPoint: false,
            timeFrame: [],
            location: [],
            source: { type: 'LINK' },
            sourceTitle: 'Example source',
            sourceEffect: {
              key: 'OPEN_RESEARCH:source-9:effect-1',
              sourceKind: 'OPEN_RESEARCH',
              sourceId: 'source-9',
              effectId: 'effect-1',
              text: 'Supporting text'
            },
            generatedByAi: true,
            aiProposal: 'Keep this proposal',
            importance: 'LOW'
          }
        ]
      });

      const server = createTestServer();
      const query = `
        query Project($slug: String!) {
          project(slug: $slug) {
            aiDraftEffects {
              id
              title
              sourceEffect {
                key
                themeSlug
              }
            }
          }
        }
      `;

      const response = await executeOperation(server, query, { slug: project.slug }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors).toBeUndefined();
      const drafts = (response.body as any).singleResult.data?.project?.aiDraftEffects;
      expect(drafts).toHaveLength(1);
      expect(drafts[0]).toMatchObject({
        title: 'Themeless draft',
        sourceEffect: { key: 'OPEN_RESEARCH:source-9:effect-1', themeSlug: null }
      });
    });

    it('returns null if project with slug does not exist', async () => {
      const mockUser: TestUser = {
        id: new mongoose.Types.ObjectId().toString(),
        entraId: 'test-entra-id',
        email: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const server = createTestServer();
      const query = `
        query Project($slug: String!) {
          project(slug: $slug) {
            id
            slug
            name
            description
          }
        }
      `;

      const response = await executeOperation(server, query, { slug: 'non-existent-slug' }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.data?.project).toBeNull();
    });
  });

  describe('Project.template resolver', () => {
    it('falls back to DEFAULT for scans created before the template field existed', () => {
      // Simulates a lean/legacy read where the stored document has no template.
      const resolved = (projectResolver.template as any)({}, {}, {}, {});
      expect(resolved).toBe('DEFAULT');
    });

    it('returns the stored template when present', () => {
      const resolved = (projectResolver.template as any)({ template: 'V1_1' }, {}, {}, {});
      expect(resolved).toBe('V1_1');
    });
  });
});
