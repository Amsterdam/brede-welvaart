import { describe, it, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { createTestServer, executeOperation, TestUser } from '../utils/testServer';
import { Project } from '../../models/Project';

describe('Argument Mutations', () => {
  const mockUser: TestUser = {
    id: new mongoose.Types.ObjectId().toString(),
    entraId: 'test-entra-id',
    email: 'test@example.com',
    displayName: 'Test User',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const anotherUser: TestUser = {
    id: new mongoose.Types.ObjectId().toString(),
    entraId: 'another-entra-id',
    email: 'another@example.com',
    displayName: 'Another User',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  describe('createArgument authorization', () => {
    const mutation = `
      mutation CreateArgument($projectId: ID!, $themeSlug: String!, $input: CreateArgumentInput!) {
        createArgument(projectId: $projectId, themeSlug: $themeSlug, input: $input) {
          id
          title
          sentiment
          generatedByAi
          aiProposal
          sourceEffect {
            key
            sourceKind
            sourceId
            effectId
            themeSlug
            page
            text
          }
        }
      }
    `;

    it('allows an OWNER to add an argument', async () => {
      const project = await Project.create({
        name: 'Owner Project',
        slug: 'owner-project',
        description: 'Project owned by user',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }],
        themes: [
          {
            name: 'Theme 1',
            description: 'Theme 1 description',
            slug: 'theme-1',
            order: 1,
            arguments: []
          }
        ]
      });

      const input = {
        title: 'New argument',
        explanation: 'Why this matters',
        importance: 'MEDIUM',
        timeFrame: ['NOW'],
        location: ['CITY'],
        source: { type: 'EXPERT', link: null },
        sourceEffect: {
          sourceKind: 'OPEN_RESEARCH',
          sourceId: 'openresearch:123',
          effectId: 'effect-1',
          themeSlug: 'theme-1',
          page: 3,
          text: 'AI voorstel voor test'
        },
        generatedByAi: true,
        aiProposal: 'AI voorstel voor test',
        sentiment: 'POSITIVE',
        discussionPoint: false,
        order: 1
      };

      const server = createTestServer();
      const response = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), themeSlug: 'theme-1', input },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      const data = (response.body as any).singleResult.data?.createArgument;
      expect(data).toBeTruthy();
      expect(data.title).toBe('New argument');
      expect(data.sentiment).toBe('POSITIVE');
      expect(data.generatedByAi).toBe(true);
      expect(data.aiProposal).toBe('AI voorstel voor test');
      expect(data.sourceEffect.key).toBe('OPEN_RESEARCH:openresearch:123:effect-1');
      expect(data.sourceEffect.sourceKind).toBe('OPEN_RESEARCH');
    });

    it('rejects duplicate source effects', async () => {
      const project = await Project.create({
        name: 'Duplicate Source Effect Project',
        slug: 'duplicate-source-effect-project',
        description: 'Project owned by user',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }],
        themes: [
          {
            name: 'Theme 1',
            description: 'Theme 1 description',
            slug: 'theme-1',
            order: 1,
            arguments: []
          }
        ]
      });

      const input = {
        title: 'Source effect argument',
        explanation: 'Why this matters',
        importance: 'LOW',
        timeFrame: [],
        location: [],
        source: { type: 'POLICY', link: null },
        sourceEffect: {
          sourceKind: 'UPLOADED_DOCUMENT',
          sourceId: 'document-1',
          effectId: 'effect-1',
          themeSlug: 'theme-1',
          page: 1,
          text: 'AI voorstel'
        },
        generatedByAi: true,
        aiProposal: 'AI voorstel',
        sentiment: 'NEUTRAL',
        discussionPoint: false,
        order: 1
      };

      const server = createTestServer();
      const firstResponse = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), themeSlug: 'theme-1', input },
        { user: mockUser, isAuthenticated: true }
      );
      const secondResponse = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), themeSlug: 'theme-1', input: { ...input, order: 2 } },
        { user: mockUser, isAuthenticated: true }
      );

      expect(firstResponse.body.kind).toBe('single');
      expect((firstResponse.body as any).singleResult.errors).toBeUndefined();
      expect(secondResponse.body.kind).toBe('single');
      expect((secondResponse.body as any).singleResult.errors?.[0]?.message).toBe(
        'Dit AI-resultaat is al toegevoegd aan de scan.'
      );

      const persisted = await Project.findById(project._id);
      expect((persisted as any).themes[0].arguments).toHaveLength(1);
    });

    it('marks the source AI draft converted when fromDraftEffectId is given', async () => {
      const project = await Project.create({
        name: 'Draft Conversion Project',
        slug: 'draft-conversion-project',
        description: 'Project owned by user',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }],
        themes: [
          { name: 'Theme 1', description: 'Theme 1 description', slug: 'theme-1', order: 1, arguments: [] }
        ],
        aiDraftEffects: [
          {
            title: 'Draft effect',
            explanation: 'AI draft explanation',
            sentiment: 'POSITIVE',
            discussionPoint: false,
            generatedByAi: true,
            source: { type: 'EXPERT' },
            sourceEffect: {
              key: 'OPEN_RESEARCH:openresearch:123:effect-1',
              sourceKind: 'OPEN_RESEARCH',
              sourceId: 'openresearch:123',
              effectId: 'effect-1'
            }
          }
        ]
      });

      const draftId = (project as any).aiDraftEffects[0]._id.toString();
      const input = {
        title: 'Converted argument',
        explanation: 'Facilitator wrote this',
        importance: 'HIGH',
        timeFrame: [],
        location: [],
        source: { type: 'EXPERT', link: null },
        sourceEffect: {
          sourceKind: 'OPEN_RESEARCH',
          sourceId: 'openresearch:123',
          effectId: 'effect-1',
          themeSlug: 'theme-1'
        },
        generatedByAi: true,
        sentiment: 'POSITIVE',
        discussionPoint: false,
        order: 1,
        fromDraftEffectId: draftId
      };

      const server = createTestServer();
      const response = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), themeSlug: 'theme-1', input },
        { user: mockUser, isAuthenticated: true }
      );

      expect((response.body as any).singleResult.errors).toBeUndefined();
      const newArgId = (response.body as any).singleResult.data?.createArgument?.id;
      expect(newArgId).toBeTruthy();

      const persisted = await Project.findById(project._id);
      const draft = (persisted as any).aiDraftEffects[0];
      // Draft is kept (for AI-dashboard tracking) but marked converted so the to-do list hides it.
      expect((persisted as any).aiDraftEffects).toHaveLength(1);
      expect(draft.convertedArgumentId?.toString()).toBe(newArgId);
    });

    it('allows an OWNER to add multiple arguments concurrently', async () => {
      const project = await Project.create({
        name: 'Concurrent Owner Project',
        slug: 'concurrent-owner-project',
        description: 'Project owned by user',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }],
        themes: [
          {
            name: 'Theme 1',
            description: 'Theme 1 description',
            slug: 'theme-1',
            order: 1,
            arguments: []
          }
        ]
      });

      const server = createTestServer();
      const responses = await Promise.all(
        [1, 2, 3].map((order) =>
          executeOperation(
            server,
            mutation,
            {
              projectId: project._id.toString(),
              themeSlug: 'theme-1',
              input: {
                title: `Concurrent argument ${order}`,
                explanation: `Why concurrent argument ${order} matters`,
                importance: 'LOW',
                timeFrame: [],
                location: [],
                source: { type: 'POLICY', link: null },
                generatedByAi: true,
                aiProposal: `AI voorstel ${order}`,
                sentiment: 'NEUTRAL',
                discussionPoint: false,
                order
              }
            },
            { user: mockUser, isAuthenticated: true }
          )
        )
      );

      for (const response of responses) {
        expect(response.body.kind).toBe('single');
        const result = (response.body as any).singleResult;
        expect(result.errors).toBeUndefined();
        expect(result.data?.createArgument?.id).toBeTruthy();
      }

      const persisted = await Project.findById(project._id);
      expect((persisted as any).themes[0].arguments).toHaveLength(3);
    });

    it('rejects a REVIEWER adding an argument', async () => {
      const project = await Project.create({
        name: 'Reviewer Project',
        slug: 'reviewer-project',
        description: 'Project with reviewer',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [
          { user: mockUser.id, role: 'OWNER' },
          { user: anotherUser.id, role: 'REVIEWER' }
        ],
        themes: [
          {
            name: 'Theme 1',
            description: 'Theme 1 description',
            slug: 'theme-1',
            order: 1,
            arguments: []
          }
        ]
      });

      const input = {
        title: 'Reviewer argument attempt',
        explanation: 'This should fail',
        importance: 'LOW',
        timeFrame: ['NOW'],
        location: ['CITY'],
        source: { type: 'DATA', link: null },
        sentiment: 'NEGATIVE',
        discussionPoint: true,
        order: 1
      };

      const server = createTestServer();
      const response = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), themeSlug: 'theme-1', input },
        { user: anotherUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      const errors = (response.body as any).singleResult.errors;
      expect(errors).toBeDefined();
      expect(errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('deleteArguments', () => {
    it('successfully deletes multiple arguments when user is project owner', async () => {
      // Create a project with themes and arguments
      const argumentId1 = new mongoose.Types.ObjectId();
      const argumentId2 = new mongoose.Types.ObjectId();
      const argumentId3 = new mongoose.Types.ObjectId();

      const project = await Project.create({
        name: 'Test Project',
        slug: 'test-project',
        description: 'Test project for argument deletion',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [
          {
            user: mockUser.id,
            role: 'OWNER'
          }
        ],
        themes: [
          {
            name: 'Theme 1',
            description: 'Theme 1 description',
            slug: 'theme-1',
            order: 1,
            arguments: [
              {
                _id: argumentId1,
                title: 'Argument 1',
                explanation: 'First argument',
                importance: 'HIGH',
                sentiment: 'POSITIVE',
                timeFrame: ['NOW'],
                location: ['CITY'],
                source: { type: 'EXPERT', link: null },
                discussionPoint: false,
                order: 1
              },
              {
                _id: argumentId2,
                title: 'Argument 2',
                explanation: 'Second argument',
                importance: 'MEDIUM',
                sentiment: 'NEUTRAL',
                timeFrame: ['ONE_TO_FIVE_Y'],
                location: ['NEIGHBORHOOD'],
                source: { type: 'DATA', link: 'http://example.com' },
                discussionPoint: true,
                order: 2
              }
            ]
          },
          {
            name: 'Theme 2',
            description: 'Theme 2 description',
            slug: 'theme-2',
            order: 2,
            arguments: [
              {
                _id: argumentId3,
                title: 'Argument 3',
                explanation: 'Third argument',
                importance: 'LOW',
                sentiment: 'NEGATIVE',
                timeFrame: ['FIVE_TO_TEN_Y'],
                location: ['PROVINCE'],
                source: { type: 'POLICY', link: null },
                discussionPoint: false,
                order: 1
              }
            ]
          }
        ]
      });

      const server = createTestServer();
      const mutation = `
        mutation DeleteArguments($projectId: ID!, $argumentIds: [ID!]!) {
          deleteArguments(projectId: $projectId, argumentIds: $argumentIds)
        }
      `;

      const response = await executeOperation(
        server,
        mutation,
        {
          projectId: project._id.toString(),
          argumentIds: [argumentId1.toString(), argumentId3.toString()]
        },
        {
          user: mockUser,
          isAuthenticated: true
        }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.data?.deleteArguments).toBe(true);

      // Verify arguments were actually deleted
      const updatedProject = await Project.findById(project._id);
      const allArguments = updatedProject?.themes.flatMap((theme: any) => theme.arguments) || [];

      expect(allArguments).toHaveLength(1);
      expect(allArguments[0]._id.toString()).toBe(argumentId2.toString());
    });

    it('fails when user is not authenticated', async () => {
      const project = await Project.create({
        name: 'Test Project',
        slug: 'test-project',
        description: 'Test project',
        status: 'DRAFT',
        createdBy: mockUser.id
      });

      const server = createTestServer();
      const mutation = `
        mutation DeleteArguments($projectId: ID!, $argumentIds: [ID!]!) {
          deleteArguments(projectId: $projectId, argumentIds: $argumentIds)
        }
      `;

      const response = await executeOperation(
        server,
        mutation,
        {
          projectId: project._id.toString(),
          argumentIds: [new mongoose.Types.ObjectId().toString()]
        },
        {
          user: null,
          isAuthenticated: false
        }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors).toBeDefined();
      expect((response.body as any).singleResult.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });

    it('fails when user is not project owner', async () => {
      const argumentId = new mongoose.Types.ObjectId();

      const project = await Project.create({
        name: 'Test Project',
        slug: 'test-project',
        description: 'Test project',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [
          {
            user: mockUser.id,
            role: 'OWNER'
          },
          {
            user: anotherUser.id,
            role: 'REVIEWER'
          }
        ],
        themes: [
          {
            name: 'Theme 1',
            description: 'Theme 1 description',
            slug: 'theme-1',
            order: 1,
            arguments: [
              {
                _id: argumentId,
                title: 'Argument 1',
                explanation: 'Test argument',
                importance: 'HIGH',
                sentiment: 'POSITIVE',
                timeFrame: ['NOW'],
                location: ['CITY'],
                source: { type: 'EXPERT', link: null },
                discussionPoint: false,
                order: 1
              }
            ]
          }
        ]
      });

      const server = createTestServer();
      const mutation = `
        mutation DeleteArguments($projectId: ID!, $argumentIds: [ID!]!) {
          deleteArguments(projectId: $projectId, argumentIds: $argumentIds)
        }
      `;

      const response = await executeOperation(
        server,
        mutation,
        {
          projectId: project._id.toString(),
          argumentIds: [argumentId.toString()]
        },
        {
          user: anotherUser,
          isAuthenticated: true
        }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors).toBeDefined();
      expect((response.body as any).singleResult.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    });

    it('fails when project does not exist', async () => {
      const server = createTestServer();
      const mutation = `
        mutation DeleteArguments($projectId: ID!, $argumentIds: [ID!]!) {
          deleteArguments(projectId: $projectId, argumentIds: $argumentIds)
        }
      `;

      const response = await executeOperation(
        server,
        mutation,
        {
          projectId: new mongoose.Types.ObjectId().toString(),
          argumentIds: [new mongoose.Types.ObjectId().toString()]
        },
        {
          user: mockUser,
          isAuthenticated: true
        }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors).toBeDefined();
      expect((response.body as any).singleResult.errors[0].extensions.code).toBe('NOT_FOUND');
    });

    it('fails when projectId is invalid', async () => {
      const server = createTestServer();
      const mutation = `
        mutation DeleteArguments($projectId: ID!, $argumentIds: [ID!]!) {
          deleteArguments(projectId: $projectId, argumentIds: $argumentIds)
        }
      `;

      const response = await executeOperation(
        server,
        mutation,
        {
          projectId: 'invalid-id',
          argumentIds: [new mongoose.Types.ObjectId().toString()]
        },
        {
          user: mockUser,
          isAuthenticated: true
        }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors).toBeDefined();
      expect((response.body as any).singleResult.errors[0].extensions.code).toBe('NOT_FOUND');
    });

    it('fails when argumentIds contain invalid IDs', async () => {
      const project = await Project.create({
        name: 'Test Project',
        slug: 'test-project',
        description: 'Test project',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [
          {
            user: mockUser.id,
            role: 'OWNER'
          }
        ]
      });

      const server = createTestServer();
      const mutation = `
        mutation DeleteArguments($projectId: ID!, $argumentIds: [ID!]!) {
          deleteArguments(projectId: $projectId, argumentIds: $argumentIds)
        }
      `;

      const response = await executeOperation(
        server,
        mutation,
        {
          projectId: project._id.toString(),
          argumentIds: ['invalid-argument-id']
        },
        {
          user: mockUser,
          isAuthenticated: true
        }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors).toBeDefined();
      expect((response.body as any).singleResult.errors[0].extensions.code).toBe('NOT_FOUND');
    });

    it('returns true even when some argument IDs do not exist', async () => {
      const argumentId1 = new mongoose.Types.ObjectId();
      const nonExistentId = new mongoose.Types.ObjectId();

      const project = await Project.create({
        name: 'Test Project',
        slug: 'test-project',
        description: 'Test project',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [
          {
            user: mockUser.id,
            role: 'OWNER'
          }
        ],
        themes: [
          {
            name: 'Theme 1',
            description: 'Theme 1 description',
            slug: 'theme-1',
            order: 1,
            arguments: [
              {
                _id: argumentId1,
                title: 'Argument 1',
                explanation: 'Test argument',
                importance: 'HIGH',
                sentiment: 'POSITIVE',
                timeFrame: ['NOW'],
                location: ['CITY'],
                source: { type: 'EXPERT', link: null },
                discussionPoint: false,
                order: 1
              }
            ]
          }
        ]
      });

      const server = createTestServer();
      const mutation = `
        mutation DeleteArguments($projectId: ID!, $argumentIds: [ID!]!) {
          deleteArguments(projectId: $projectId, argumentIds: $argumentIds)
        }
      `;

      const response = await executeOperation(
        server,
        mutation,
        {
          projectId: project._id.toString(),
          argumentIds: [argumentId1.toString(), nonExistentId.toString()]
        },
        {
          user: mockUser,
          isAuthenticated: true
        }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.data?.deleteArguments).toBe(true);

      // Verify the existing argument was deleted
      const updatedProject = await Project.findById(project._id);
      const allArguments = updatedProject?.themes.flatMap((theme: any) => theme.arguments) || [];
      expect(allArguments).toHaveLength(0);
    });
  });

  describe('moveArgumentToTheme', () => {
    const mutation = `
      mutation MoveArgumentToTheme($projectId: ID!, $argumentId: ID!, $themeSlug: String!) {
        moveArgumentToTheme(projectId: $projectId, argumentId: $argumentId, themeSlug: $themeSlug) {
          id
        }
      }
    `;

    const makeArgument = (sentiment: string, order: number) => ({
      _id: new mongoose.Types.ObjectId(),
      title: `Effect ${order}`,
      explanation: 'Toelichting',
      importance: 'LOW',
      sentiment,
      timeFrame: [],
      location: [],
      source: { type: 'EXPERT', link: null },
      discussionPoint: false,
      order,
    });

    const projectWithThemes = (theme1Args: any[], theme2Args: any[], extra: Record<string, unknown> = {}) =>
      Project.create({
        name: 'Move Project',
        slug: 'move-project',
        description: 'Project for moving effects',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }],
        themes: [
          { name: 'Theme 1', description: 'd', slug: 'theme-1', order: 1, arguments: theme1Args },
          { name: 'Theme 2', description: 'd', slug: 'theme-2', order: 2, arguments: theme2Args },
        ],
        ...extra,
      });

    it('moves an effect to another theme for an owner', async () => {
      const arg = makeArgument('POSITIVE', 1);
      const project = await projectWithThemes([arg], []);
      const server = createTestServer();

      const response = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), argumentId: arg._id.toString(), themeSlug: 'theme-2' },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.data?.moveArgumentToTheme?.id).toBe(arg._id.toString());

      const persisted = await Project.findById(project._id);
      const theme1 = persisted?.themes.find((t: any) => t.slug === 'theme-1');
      const theme2 = persisted?.themes.find((t: any) => t.slug === 'theme-2');
      expect(theme1?.arguments).toHaveLength(0);
      expect(theme2?.arguments.map((a: any) => a._id.toString())).toContain(arg._id.toString());
    });

    it('blocks a move when the target theme is at the sentiment cap', async () => {
      const arg = makeArgument('POSITIVE', 1);
      const fivePositive = Array.from({ length: 5 }, (_, i) => makeArgument('POSITIVE', i + 1));
      const project = await projectWithThemes([arg], fivePositive);
      const server = createTestServer();

      const response = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), argumentId: arg._id.toString(), themeSlug: 'theme-2' },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors?.[0].message).toMatch(/5 positieve/);

      const persisted = await Project.findById(project._id);
      expect(persisted?.themes.find((t: any) => t.slug === 'theme-1')?.arguments).toHaveLength(1);
      expect(persisted?.themes.find((t: any) => t.slug === 'theme-2')?.arguments).toHaveLength(5);
    });

    it('rejects a move from a reviewer', async () => {
      const reviewer: TestUser = {
        ...mockUser,
        id: new mongoose.Types.ObjectId().toString(),
        email: 'reviewer-move@example.com',
      };
      const arg = makeArgument('POSITIVE', 1);
      const project = await projectWithThemes([arg], [], {
        slug: 'reviewer-move-project',
        users: [
          { user: mockUser.id, role: 'OWNER' },
          { user: reviewer.id, role: 'REVIEWER' },
        ],
      });
      const server = createTestServer();

      const response = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), argumentId: arg._id.toString(), themeSlug: 'theme-2' },
        { user: reviewer, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
    });
  });
});
