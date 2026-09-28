import { beforeEach, describe, it, expect, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { createTestServer, executeOperation, TestUser } from '../utils/testServer';
import { Project } from '../../models/Project';
import { deleteProjectDocumentBlob, uploadProjectDocumentBlob } from '../../lib/projectDocumentStorage';
import { defaultAiServiceClient, mapProjectToAiServiceInput } from '../../lib/aiServiceClient';

jest.mock('../../lib/projectDocumentStorage', () => ({
  buildProjectDocumentBlobPath: jest.fn((projectId: string, documentId: string) =>
    `uploads/${projectId}/documents/${documentId}/original.pdf`
  ),
  uploadProjectDocumentBlob: jest.fn(),
  deleteProjectDocumentBlob: jest.fn(),
}));

jest.mock('../../lib/aiServiceClient', () => ({
  defaultAiServiceClient: {
    analyzeDocument: jest.fn(),
    generateKeyMessage: jest.fn(),
    getSource: jest.fn(),
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

describe('Project Mutations', () => {
  const mockUser: TestUser = {
    id: new mongoose.Types.ObjectId().toString(),
    entraId: 'test-entra-id',
    email: 'test@example.com',
    displayName: 'Test User',
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const completeIntakeInput = {
    reason: ['NEW_POLICY'],
    scanGoal: 'Een breder perspectief krijgen op nieuw beleid',
    impactMotivation: 'We willen de effecten op brede welvaart beter begrijpen',
    scope: 'Richt u op Amsterdam',
    additionalContext: 'Neem recente beleidscontext mee'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(defaultAiServiceClient.analyzeDocument).mockResolvedValue({
      summary: null,
      statements: [],
    });
    jest.mocked(defaultAiServiceClient.generateKeyMessage).mockResolvedValue('• Conceptboodschap');
  });

  describe('generateProjectKeyMessage', () => {
    const mutation = `
      mutation GenerateProjectKeyMessage($projectId: ID!) {
        generateProjectKeyMessage(projectId: $projectId)
      }
    `;

    it('passes curated scan content to the AI service without saving the draft', async () => {
      const project = await Project.create({
        name: 'Scan voor woningbouw',
        slug: 'scan-voor-woningbouw',
        description: 'Onderzoek naar woningbouw',
        scanGoal: 'Woningbouw in Amsterdam',
        impactMotivation: 'Effecten afwegen',
        scope: 'Amsterdam',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }],
        themes: [{
          name: 'Wonen',
          description: 'Wonen',
          slug: 'wonen',
          arguments: [{
            title: 'Meer woningen',
            explanation: 'Het aanbod groeit.',
            sentiment: 'POSITIVE',
            importance: 'HIGH',
            timeFrame: [],
            location: [],
            source: { type: 'POLICY' },
            discussionPoint: false,
          }],
        }],
      });

      const response = await executeOperation(
        createTestServer(), mutation, { projectId: project.id },
        { user: mockUser, isAuthenticated: true }
      );

      expect((response.body as any).singleResult.data?.generateProjectKeyMessage)
        .toBe('• Conceptboodschap');
      expect(defaultAiServiceClient.generateKeyMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Scan voor woningbouw',
          themes: [{
            name: 'Wonen',
            slug: 'wonen',
            arguments: [{
              title: 'Meer woningen',
              explanation: 'Het aanbod groeit.',
              sentiment: 'POSITIVE',
            }],
          }],
        })
      );
      expect((await Project.findById(project.id))?.keyMessage).toBeUndefined();
    });

    it('rejects reviewers and finalized scans before calling the AI service', async () => {
      const reviewer = { ...mockUser, id: new mongoose.Types.ObjectId().toString() };
      const project = await Project.create({
        name: 'Gepubliceerde scan',
        slug: 'gepubliceerde-scan',
        description: 'Beschrijving',
        status: 'PUBLISHED',
        createdBy: mockUser.id,
        users: [
          { user: mockUser.id, role: 'OWNER' },
          { user: reviewer.id, role: 'REVIEWER' },
        ],
      });

      const reviewerResponse = await executeOperation(
        createTestServer(), mutation, { projectId: project.id },
        { user: reviewer, isAuthenticated: true }
      );
      const ownerResponse = await executeOperation(
        createTestServer(), mutation, { projectId: project.id },
        { user: mockUser, isAuthenticated: true }
      );

      expect((reviewerResponse.body as any).singleResult.errors).toBeDefined();
      expect((ownerResponse.body as any).singleResult.errors?.[0].extensions.code).toBe('BAD_USER_INPUT');
      expect(defaultAiServiceClient.generateKeyMessage).not.toHaveBeenCalled();
    });
  });

  describe('createProject', () => {
    it('creates a new project', async () => {
      const server = createTestServer();
      const mutation = `
        mutation CreateProject($input: CreateProjectInput!) {
          createProject(input: $input) {
            id
            name
            description
            reason
            reasonOther
            scanGoal
            impactSituation
            impactMotivation
            scope
            additionalContext
            status
            slug
          }
        }
      `;

      const input = {
        name: 'New Project',
        description: 'A new project',
        status: 'DRAFT',
        completeIntake: true,
        ...completeIntakeInput
      };

      const response = await executeOperation(server, mutation, { input }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      const project = (response.body as any).singleResult.data?.createProject;
      expect(project).toMatchObject({
        name: input.name,
        description: input.description,
        reason: input.reason,
        reasonOther: null,
        scanGoal: input.scanGoal,
        impactSituation: null,
        impactMotivation: input.impactMotivation,
        scope: input.scope,
        additionalContext: input.additionalContext,
        status: input.status
      });
      expect(project.id).toBeDefined();
      expect(project.slug).toBeDefined();
    });

    it('fails to create project when not authenticated', async () => {
      const server = createTestServer();
      const mutation = `
        mutation CreateProject($input: CreateProjectInput!) {
          createProject(input: $input) {
            id
          }
        }
      `;

      const input = {
        name: 'Unauthorized Project',
        description: 'Should not be created',
        status: 'DRAFT',
        completeIntake: true,
        ...completeIntakeInput
      };

      const response = await executeOperation(server, mutation, { input }, {
        user: null,
        isAuthenticated: false
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors).toBeDefined();
    });

    it('fails to create project without a reason', async () => {
      const server = createTestServer();
      const mutation = `
        mutation CreateProject($input: CreateProjectInput!) {
          createProject(input: $input) {
            id
          }
        }
      `;

      const response = await executeOperation(server, mutation, {
        input: {
          name: 'No reason',
          description: 'Missing reason',
          completeIntake: true,
          ...completeIntakeInput,
          reason: []
        }
      }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('BAD_USER_INPUT');
    });

    it('fails to create project when other reason has no explanation', async () => {
      const server = createTestServer();
      const mutation = `
        mutation CreateProject($input: CreateProjectInput!) {
          createProject(input: $input) {
            id
          }
        }
      `;

      const response = await executeOperation(server, mutation, {
        input: {
          name: 'Other reason',
          description: 'Missing other explanation',
          completeIntake: true,
          ...completeIntakeInput,
          reason: ['OTHER'],
          reasonOther: ' '
        }
      }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('BAD_USER_INPUT');
    });

    it('creates a partial draft without complete intake fields', async () => {
      const server = createTestServer();
      const mutation = `
        mutation CreateProject($input: CreateProjectInput!) {
          createProject(input: $input) {
            id
            name
            description
            reason
            scanGoal
            impactMotivation
            scope
            status
            slug
          }
        }
      `;

      const input = {
        name: 'Nieuwe bredewelvaartscan',
        description: 'Projectintake nog niet afgerond.',
        status: 'DRAFT',
        reason: ['NEW_POLICY']
      };

      const response = await executeOperation(server, mutation, { input }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors).toBeUndefined();
      expect((response.body as any).singleResult.data?.createProject).toMatchObject({
        name: input.name,
        description: input.description,
        reason: input.reason,
        scanGoal: null,
        impactMotivation: null,
        scope: null,
        status: 'DRAFT'
      });
    });

    it('defaults to the v1.1 theme template with the new theme names', async () => {
      const server = createTestServer();
      const mutation = `
        mutation CreateProject($input: CreateProjectInput!) {
          createProject(input: $input) {
            id
            template
            themes { name slug }
          }
        }
      `;

      const response = await executeOperation(server, mutation, {
        input: {
          name: 'Default template project',
          description: 'Should use v1.1 themes',
          status: 'DRAFT',
          reason: ['NEW_POLICY']
        }
      }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      const project = (response.body as any).singleResult.data?.createProject;
      expect(project.template).toBe('V1_1');
      const themeNames = project.themes.map((theme: { name: string }) => theme.name);
      expect(themeNames).toEqual([
        'Welzijn',
        'Gezondheid',
        'Arbeid',
        'Menselijk kapitaal',
        'Ruimte',
        'Economisch kapitaal',
        'Milieu & Natuurlijk kapitaal',
        'Samenleving en sociaal kapitaal',
        'Veiligheid',
        'Wonen'
      ]);
      // Ampersand slugifies to '-en-' (Dutch locale), matching the shipped icon/color assets.
      expect(project.themes.map((theme: { slug: string }) => theme.slug)).toContain(
        'milieu-en-natuurlijk-kapitaal'
      );
    });

    it('honours an explicit DEFAULT (v1.0) template for the original theme names', async () => {
      const server = createTestServer();
      const mutation = `
        mutation CreateProject($input: CreateProjectInput!) {
          createProject(input: $input) {
            template
            themes { name }
          }
        }
      `;

      const response = await executeOperation(server, mutation, {
        input: {
          name: 'Legacy template project',
          description: 'Should use v1.0 themes',
          status: 'DRAFT',
          reason: ['NEW_POLICY'],
          template: 'DEFAULT'
        }
      }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      const project = (response.body as any).singleResult.data?.createProject;
      expect(project.template).toBe('DEFAULT');
      const themeNames = project.themes.map((theme: { name: string }) => theme.name);
      expect(themeNames).toContain('Subjectief welzijn');
      expect(themeNames).toContain('Consumptie en Inkomen');
    });
  });

  describe('createProjectAiDraftEffects', () => {
    const mutation = `
      mutation CreateProjectAiDraftEffects($projectId: ID!, $input: [CreateProjectAiDraftEffectInput!]!) {
        createProjectAiDraftEffects(projectId: $projectId, input: $input) {
          id
          title
          sourceTitle
          sourceEffect {
            key
            sourceKind
            sourceId
            effectId
          }
        }
      }
    `;

    it('stores AI source effects as drafts and skips duplicates', async () => {
      const project = await Project.create({
        name: 'AI Draft Project',
        slug: 'ai-draft-project',
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
      const input = [
        {
          title: 'AI draft effect',
          explanation: 'Draft explanation',
          sentiment: 'NEUTRAL',
          discussionPoint: false,
          timeFrame: [],
          location: [],
          source: { type: 'POLICY', link: null },
          sourceTitle: 'Observatieonderzoek',
          sourceEffect: {
            sourceKind: 'UPLOADED_DOCUMENT',
            sourceId: 'document-1',
            effectId: 'effect-1',
            page: 1,
            text: 'Draft explanation'
          },
          generatedByAi: true,
          aiProposal: 'AI voorstel',
          importance: 'LOW'
        }
      ];

      const server = createTestServer();
      const firstResponse = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), input },
        { user: mockUser, isAuthenticated: true }
      );
      const secondResponse = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), input },
        { user: mockUser, isAuthenticated: true }
      );

      expect(firstResponse.body.kind).toBe('single');
      const firstDrafts = (firstResponse.body as any).singleResult.data?.createProjectAiDraftEffects;
      expect(firstDrafts).toHaveLength(1);
      expect(firstDrafts[0].sourceEffect.key).toBe('UPLOADED_DOCUMENT:document-1:effect-1');
      expect(firstDrafts[0].sourceTitle).toBe('Observatieonderzoek');

      expect(secondResponse.body.kind).toBe('single');
      const secondDrafts = (secondResponse.body as any).singleResult.data?.createProjectAiDraftEffects;
      expect(secondDrafts).toHaveLength(1);

      const persisted = await Project.findById(project._id);
      expect((persisted as any).aiDraftEffects).toHaveLength(1);
    });

    const openResearchProject = () =>
      Project.create({
        name: 'OpenResearch Draft Project',
        slug: 'openresearch-draft-project',
        description: 'Project owned by user',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }],
        themes: [{ name: 'Theme 1', description: 'd', slug: 'theme-1', order: 1, arguments: [] }],
      });

    const openResearchInput = (effectId: string) => ({
      title: 'AI draft effect',
      explanation: 'Draft explanation',
      sentiment: 'NEUTRAL',
      discussionPoint: false,
      timeFrame: [],
      location: [],
      // A client-supplied link must be ignored — the server reconstructs it.
      source: { type: 'LINK', link: 'https://client-should-be-ignored.example' },
      sourceTitle: 'Amsterdamse AI Agenda',
      sourceEffect: {
        sourceKind: 'OPEN_RESEARCH',
        sourceId: 'openresearch:124398',
        effectId,
        themeSlug: 'theme-1',
        page: 10,
        text: 'Draft explanation',
      },
      generatedByAi: true,
      aiProposal: 'AI voorstel',
      importance: 'LOW',
    });

    it('reconstructs the OpenResearch link server-side, ignoring any client-supplied link', async () => {
      const reconstructedUrl = 'https://openresearch.amsterdam/en/page/124398/amsterdamse-ai-agenda';
      jest.mocked(defaultAiServiceClient.getSource).mockResolvedValue({ url: reconstructedUrl } as any);

      const project = await openResearchProject();
      const server = createTestServer();
      // Two effects share one sourceId — getSource must be called only once.
      const response = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), input: [openResearchInput('effect-1'), openResearchInput('effect-2')] },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.data?.createProjectAiDraftEffects).toHaveLength(2);

      const persisted = await Project.findById(project._id);
      const drafts = (persisted as any).aiDraftEffects;
      expect(drafts).toHaveLength(2);
      for (const draft of drafts) {
        expect(draft.source.link).toBe(reconstructedUrl);
      }

      expect(defaultAiServiceClient.getSource).toHaveBeenCalledTimes(1);
      expect(defaultAiServiceClient.getSource).toHaveBeenCalledWith('openresearch:124398');
    });

    it('saves the draft with no link when the source lookup fails', async () => {
      jest.mocked(defaultAiServiceClient.getSource).mockRejectedValue(new Error('AI service down'));

      const project = await openResearchProject();
      const server = createTestServer();
      const response = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), input: [openResearchInput('effect-1')] },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors).toBeUndefined();
      expect((response.body as any).singleResult.data?.createProjectAiDraftEffects).toHaveLength(1);

      const persisted = await Project.findById(project._id);
      const drafts = (persisted as any).aiDraftEffects;
      expect(drafts).toHaveLength(1);
      expect(drafts[0].source.link ?? null).toBeNull();
    });
  });

  describe('updateProject', () => {
    it('updates an existing project', async () => {
      const project = await Project.create({
        name: 'Update Me',
        slug: 'update-me',
        description: 'To be updated',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }]
      });

      const server = createTestServer();
      const mutation = `
        mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {
          updateProject(id: $id, input: $input) {
            id
            name
            description
            coverText
            status
          }
        }
      `;

      const input = {
        name: 'Updated Project',
        description: 'Updated description',
        coverText: 'Introductie en leeswijzer voor de scan.',
        status: 'PUBLISHED'
      };

      const response = await executeOperation(server, mutation, { id: project._id.toString(), input }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      const updated = (response.body as any).singleResult.data?.updateProject;
      expect(updated).toMatchObject({
        id: project._id.toString(),
        name: input.name,
        description: input.description,
        status: input.status
      });
    });

    it('updates project intake fields while project is draft', async () => {
      const project = await Project.create({
        name: 'Draft intake',
        slug: 'draft-intake',
        description: 'Draft intake project',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }],
        ...completeIntakeInput
      });

      const server = createTestServer();
      const mutation = `
        mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {
          updateProject(id: $id, input: $input) {
            id
            reason
            reasonOther
            scanGoal
            impactSituation
            impactMotivation
            scope
            additionalContext
          }
        }
      `;

      const input = {
        reason: ['COUNCIL_LETTER', 'OTHER'],
        reasonOther: 'Een bestuurlijke vraag',
        scanGoal: 'Alle effecten scherper in beeld krijgen',
        impactMotivation: 'De raad wil de bredewelvaartseffecten kunnen wegen',
        scope: 'Alleen stadsdeel Centrum',
        additionalContext: 'Gebruik de meest recente context',
        completeIntake: true
      };

      const response = await executeOperation(server, mutation, { id: project._id.toString(), input }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      const { completeIntake: _completeIntake, ...expectedInput } = input;
      expect((response.body as any).singleResult.data?.updateProject).toMatchObject(expectedInput);
    });

    it('updates partial draft intake without requiring completion', async () => {
      const project = await Project.create({
        name: 'Partial draft',
        slug: 'partial-draft',
        description: 'Projectintake nog niet afgerond.',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }],
        reason: ['NEW_POLICY']
      });

      const server = createTestServer();
      const mutation = `
        mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {
          updateProject(id: $id, input: $input) {
            id
            reason
            scanGoal
            impactMotivation
            scope
          }
        }
      `;

      const response = await executeOperation(server, mutation, {
        id: project._id.toString(),
        input: {
          scanGoal: 'Alle effecten scherper in beeld krijgen'
        }
      }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors).toBeUndefined();
      expect((response.body as any).singleResult.data?.updateProject).toMatchObject({
        reason: ['NEW_POLICY'],
        scanGoal: 'Alle effecten scherper in beeld krijgen',
        impactMotivation: null,
        scope: null
      });
    });

    it('fails to update intake fields after publication', async () => {
      const project = await Project.create({
        name: 'Published intake',
        slug: 'published-intake',
        description: 'Published intake project',
        status: 'PUBLISHED',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }],
        ...completeIntakeInput
      });

      const server = createTestServer();
      const mutation = `
        mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {
          updateProject(id: $id, input: $input) {
            id
          }
        }
      `;

      const response = await executeOperation(server, mutation, {
        id: project._id.toString(),
        input: {
          scanGoal: 'Nieuwe doelstelling'
        }
      }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('BAD_USER_INPUT');
    });

    it('fails to update the cover text after publication', async () => {
      const project = await Project.create({
        name: 'Published cover',
        slug: 'published-cover',
        description: 'Published project',
        coverText: 'Vastgestelde voorbladtekst',
        status: 'PUBLISHED',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }]
      });

      const server = createTestServer();
      const response = await executeOperation(server, `
        mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {
          updateProject(id: $id, input: $input) { id }
        }
      `, {
        id: project._id.toString(),
        input: { coverText: 'Gewijzigde tekst' }
      }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('BAD_USER_INPUT');
    });

    it('fails to clear required intake fields while project is draft', async () => {
      const project = await Project.create({
        name: 'Draft required intake',
        slug: 'draft-required-intake',
        description: 'Draft project with required intake',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }],
        ...completeIntakeInput
      });

      const server = createTestServer();
      const mutation = `
        mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {
          updateProject(id: $id, input: $input) {
            id
          }
        }
      `;

      const response = await executeOperation(server, mutation, {
        id: project._id.toString(),
        input: {
          scanGoal: null,
          completeIntake: true
        }
      }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('BAD_USER_INPUT');
    });

    it('fails when a non-owner updates intake fields', async () => {
      const reviewer: TestUser = {
        ...mockUser,
        id: new mongoose.Types.ObjectId().toString(),
        email: 'reviewer@example.com',
      };
      const project = await Project.create({
        name: 'Owner only intake',
        slug: 'owner-only-intake',
        description: 'Draft project with reviewer',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [
          { user: mockUser.id, role: 'OWNER' },
          { user: reviewer.id, role: 'REVIEWER' },
        ],
        ...completeIntakeInput
      });

      const server = createTestServer();
      const mutation = `
        mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {
          updateProject(id: $id, input: $input) {
            id
          }
        }
      `;

      const response = await executeOperation(server, mutation, {
        id: project._id.toString(),
        input: {
          scope: 'Alleen stadsdeel Centrum'
        }
      }, {
        user: reviewer,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
    });

    it('returns error when updating non-existent project', async () => {
      const server = createTestServer();
      const mutation = `
        mutation UpdateProject($id: ID!, $input: UpdateProjectInput!) {
          updateProject(id: $id, input: $input) {
            id
          }
        }
      `;

      const response = await executeOperation(server, mutation, { id: new mongoose.Types.ObjectId().toString(), input: { name: 'Nope' } }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors).toBeDefined();
    });
  });

  describe('deleteProject', () => {
    it('deletes an existing project', async () => {
      const project = await Project.create({
        name: 'Delete Me',
        slug: 'delete-me',
        description: 'To be deleted',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }]
      });

      const server = createTestServer();
      const mutation = `
        mutation DeleteProject($id: ID!) {
          deleteProject(id: $id)
        }
      `;

      const response = await executeOperation(server, mutation, { id: project._id.toString() }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.data?.deleteProject).toBe(true);
    });

    it('returns an error when deleting non-existent project', async () => {
      const server = createTestServer();
      const mutation = `
        mutation DeleteProject($id: ID!) {
          deleteProject(id: $id)
        }
      `;

      const response = await executeOperation(server, mutation, { id: new mongoose.Types.ObjectId().toString() }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('NOT_FOUND');
    });
  });

  describe('duplicateProject', () => {
    it('duplicates a project and increments the copy suffix', async () => {
      const project = await Project.create({
        name: 'Duplicate Me',
        slug: 'duplicate-me',
        description: 'To be duplicated',
        coverText: 'Introductie voor het voorblad',
        status: 'DRAFT',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }]
      });

      const server = createTestServer();
      const mutation = `
        mutation DuplicateProject($id: ID!) {
          duplicateProject(id: $id) {
            id
            name
            description
            coverText
            status
          }
        }
      `;

      const firstResponse = await executeOperation(server, mutation, { id: project._id.toString() }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(firstResponse.body.kind).toBe('single');
      const firstDuplicate = (firstResponse.body as any).singleResult.data?.duplicateProject;
      expect(firstDuplicate?.name).toBe('Duplicate Me (1)');
      expect(firstDuplicate?.description).toBe(project.description);
      expect(firstDuplicate?.coverText).toBe(project.coverText);
      expect(firstDuplicate?.status).toBe(project.status);

      const secondResponse = await executeOperation(server, mutation, { id: firstDuplicate.id }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(secondResponse.body.kind).toBe('single');
      const secondDuplicate = (secondResponse.body as any).singleResult.data?.duplicateProject;
      expect(secondDuplicate?.name).toBe('Duplicate Me (2)');
    });
  });

  describe('uploadProjectDocument', () => {
    it('uploads a document for an existing project theme', async () => {
      const project = await Project.create({
        name: 'Upload Project',
        slug: 'upload-project',
        description: 'Project with upload',
        status: 'DRAFT',
        createdBy: mockUser.id,
        themes: [{ slug: 'subjectief-welzijn', name: 'Subjectief welzijn', description: 'Welzijn' }],
        users: [{ user: mockUser.id, role: 'OWNER' }]
      });

      const server = createTestServer();
      const mutation = `
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
            aiTitle
            aiDescription
            aiStatements {
              text
              docId
              title
              page
              score
              source
            }
            uploadedBy
          }
        }
      `;

      const input = {
        themeSlug: 'subjectief-welzijn',
        fileName: 'onderzoek.pdf',
        mimeType: 'application/pdf',
        size: 12,
        contentBase64: Buffer.from('test content').toString('base64'),
        name: 'Observatieonderzoek',
        description: 'Onderzoek naar leefbaarheid.',
        keyword: 'Subjectief welzijn'
      };
      let resolveAnalysis: (value: any) => void = () => {};
      const analysisPromise = new Promise(resolve => {
        resolveAnalysis = resolve;
      });
      jest.mocked(defaultAiServiceClient.analyzeDocument).mockReturnValue(analysisPromise as any);

      const response = await executeOperation(server, mutation, {
        projectId: project._id.toString(),
        input
      }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors).toBeUndefined();
      expect((response.body as any).singleResult.data?.uploadProjectDocument).toMatchObject({
        themeSlug: input.themeSlug,
        fileName: input.fileName,
        mimeType: input.mimeType,
        size: input.size,
        name: input.name,
        description: input.description,
        keyword: input.keyword,
        blobPath: expect.stringMatching(new RegExp(`^uploads/${project._id.toString()}/documents/[a-f0-9]{24}/original\\.pdf$`)),
        analysisStatus: 'RUNNING',
        analysisError: null,
        aiTitle: null,
        aiDescription: null,
        aiStatements: [],
        uploadedBy: mockUser.id
      });

      expect(uploadProjectDocumentBlob).toHaveBeenCalledWith(expect.objectContaining({
        blobPath: expect.stringMatching(new RegExp(`^uploads/${project._id.toString()}/documents/[a-f0-9]{24}/original\\.pdf$`)),
        content: Buffer.from('test content'),
        mimeType: input.mimeType
      }));
      expect(deleteProjectDocumentBlob).not.toHaveBeenCalled();

      const persisted = await Project.findById(project._id);
      expect((persisted as any).uploadedDocuments).toHaveLength(1);
      expect((persisted as any).uploadedDocuments[0].contentBase64).toBeUndefined();
      expect((persisted as any).uploadedDocuments[0].blobPath).toMatch(new RegExp(`^uploads/${project._id.toString()}/documents/[a-f0-9]{24}/original\\.pdf$`));
      expect((persisted as any).uploadedDocuments[0].analysisStatus).toBe('RUNNING');

      await waitFor(() => {
        expect(mapProjectToAiServiceInput).toHaveBeenCalledWith(expect.anything(), 'Subjectief welzijn');
        expect(defaultAiServiceClient.analyzeDocument).toHaveBeenCalledWith({
          input: expect.objectContaining({
            language: 'nl',
            theme: 'Subjectief welzijn'
          }),
          blob_path: expect.stringMatching(new RegExp(`^uploads/${project._id.toString()}/documents/[a-f0-9]{24}/original\\.pdf$`)),
          filename: 'onderzoek.pdf'
        });
      });

      resolveAnalysis({
        summary: {
          title: 'Gegenereerde titel',
          summary: 'Gegenereerde beschrijving van het document.'
        },
        statements: [
          {
            text: 'Een echt tekstfragment uit het document.',
            doc_id: 'upload:onderzoek:1',
            title: 'Onderzoek',
            page: 3,
            score: 0.91,
            source: 'upload'
          }
        ]
      });

      await waitFor(async () => {
        const completed = await Project.findById(project._id);
        expect((completed as any).uploadedDocuments[0].analysisStatus).toBe('COMPLETED');
        expect((completed as any).uploadedDocuments[0].name).toBe('Gegenereerde titel');
        expect((completed as any).uploadedDocuments[0].description).toBe('Gegenereerde beschrijving van het document.');
        expect((completed as any).uploadedDocuments[0].aiStatements).toHaveLength(1);
      });
    });

    it('rejects document uploads from reviewers', async () => {
      const reviewer: TestUser = {
        ...mockUser,
        id: new mongoose.Types.ObjectId().toString(),
        email: 'reviewer-upload@example.com',
      };
      const project = await Project.create({
        name: 'Reviewer Upload Project',
        slug: 'reviewer-upload-project',
        description: 'Project with reviewer',
        status: 'DRAFT',
        createdBy: mockUser.id,
        themes: [{ slug: 'subjectief-welzijn', name: 'Subjectief welzijn', description: 'Welzijn' }],
        users: [
          { user: mockUser.id, role: 'OWNER' },
          { user: reviewer.id, role: 'REVIEWER' },
        ]
      });

      const server = createTestServer();
      const mutation = `
        mutation UploadProjectDocument($projectId: ID!, $input: UploadProjectDocumentInput!) {
          uploadProjectDocument(projectId: $projectId, input: $input) {
            id
          }
        }
      `;

      const response = await executeOperation(server, mutation, {
        projectId: project._id.toString(),
        input: {
          themeSlug: 'subjectief-welzijn',
          fileName: 'onderzoek.pdf',
          size: 12,
          contentBase64: Buffer.from('test content').toString('base64'),
          name: 'Observatieonderzoek'
        }
      }, {
        user: reviewer,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
    });
  });

  describe('deleteProjectUploadedDocument', () => {
    const mutation = `
      mutation DeleteProjectUploadedDocument($projectId: ID!, $documentId: ID!) {
        deleteProjectUploadedDocument(projectId: $projectId, documentId: $documentId)
      }
    `;

    const projectWithDocument = (extra: Record<string, unknown> = {}) =>
      Project.create({
        name: 'Delete Doc Project',
        slug: 'delete-doc-project',
        description: 'Project with a document',
        status: 'DRAFT',
        createdBy: mockUser.id,
        themes: [{ slug: 'subjectief-welzijn', name: 'Subjectief welzijn', description: 'Welzijn' }],
        users: [{ user: mockUser.id, role: 'OWNER' }],
        uploadedDocuments: [
          {
            themeSlug: 'subjectief-welzijn',
            fileName: 'onderzoek.pdf',
            size: 12,
            name: 'Observatieonderzoek',
            blobPath: 'uploads/x/documents/y/original.pdf',
          },
        ],
        ...extra,
      });

    it('removes the document and deletes its blob for an owner', async () => {
      const project = await projectWithDocument();
      const documentId = (project as any).uploadedDocuments[0]._id.toString();
      const { blobPath } = (project as any).uploadedDocuments[0];
      const server = createTestServer();

      const response = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), documentId },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.data?.deleteProjectUploadedDocument).toBe(true);
      expect(deleteProjectDocumentBlob).toHaveBeenCalledWith(blobPath);

      const persisted = await Project.findById(project._id);
      expect((persisted as any).uploadedDocuments).toHaveLength(0);
    });

    it('rejects deletion from reviewers', async () => {
      const reviewer: TestUser = {
        ...mockUser,
        id: new mongoose.Types.ObjectId().toString(),
        email: 'reviewer-delete@example.com',
      };
      const project = await projectWithDocument({
        slug: 'reviewer-delete-project',
        users: [
          { user: mockUser.id, role: 'OWNER' },
          { user: reviewer.id, role: 'REVIEWER' },
        ],
      });
      const documentId = (project as any).uploadedDocuments[0]._id.toString();
      const server = createTestServer();

      const response = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), documentId },
        { user: reviewer, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
      expect(deleteProjectDocumentBlob).not.toHaveBeenCalled();
    });

    it('returns not found for an unknown document', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      const project = await projectWithDocument({ slug: 'unknown-doc-project' });
      const server = createTestServer();

      const response = await executeOperation(
        server,
        mutation,
        { projectId: project._id.toString(), documentId: new mongoose.Types.ObjectId().toString() },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('NOT_FOUND');
      expect(deleteProjectDocumentBlob).not.toHaveBeenCalled();
    });
  });

  describe('useShareLink', () => {
    it('returns project for valid shareLink', async () => {
      const project = await Project.create({
        name: 'Shared Project',
        slug: 'shared-project',
        description: 'Shared via link',
        status: 'PUBLISHED',
        createdBy: mockUser.id,
        users: [{ user: mockUser.id, role: 'OWNER' }],
        shareLink: 'valid-share-link'
      });

      const server = createTestServer();
      const mutation = `
        mutation UseShareLink($shareLink: String!) {
          useShareLink(shareLink: $shareLink) {
            id
            name
            shareLink
          }
        }
      `;

      const response = await executeOperation(server, mutation, { shareLink: project.shareLink }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      const result = (response.body as any).singleResult.data?.useShareLink;
      expect(result).toMatchObject({
        id: project._id.toString(),
        name: project.name,
        shareLink: project.shareLink
      });
    });

    it('returns an error for invalid shareLink', async () => {
      const server = createTestServer();
      const mutation = `
        mutation UseShareLink($shareLink: String!) {
          useShareLink(shareLink: $shareLink) {
            id
          }
        }
      `;

      const response = await executeOperation(server, mutation, { shareLink: 'invalid-link' }, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('NOT_FOUND');
    });
  });
});
