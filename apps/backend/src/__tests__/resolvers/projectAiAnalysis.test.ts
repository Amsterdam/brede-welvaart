import { afterEach, describe, expect, it, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { Project } from '../../models/Project';
import { defaultAiServiceClient } from '../../lib/aiServiceClient';
import { createTestServer, executeOperation, TestUser } from '../utils/testServer';

// The verkenning is project-level: a single analysis per project, addressed
// internally under this key (kept in sync with PROJECT_ANALYSIS_KEY in the resolver).
const PROJECT_ANALYSIS_KEY = '__project__';

const createMockUser = (): TestUser => ({
  id: new mongoose.Types.ObjectId().toString(),
  entraId: 'test-entra-id',
  email: 'test@example.com',
  displayName: 'Test User',
  createdAt: new Date(),
  updatedAt: new Date(),
});

const DEFAULT_THEME = {
  slug: 'wonen',
  name: 'Wonen',
  description: 'Woningmarkt en huisvesting',
  isActive: true,
};

const CANONICAL_THEMES = [
  DEFAULT_THEME,
  { slug: 'gezondheid', name: 'Gezondheid', description: 'Fysieke en mentale gezondheid', isActive: true },
  { slug: 'sociaal-kapitaal', name: 'Sociaal kapitaal', description: 'Sociale netwerken en vertrouwen', isActive: true },
  { slug: 'consumptie-en-inkomen', name: 'Consumptie en Inkomen', description: 'Financiele situatie', isActive: true },
  { slug: 'veiligheid', name: 'Veiligheid', description: 'Overlast en criminaliteit', isActive: true },
];

const createProject = async (ownerId: string, extra: Record<string, unknown> = {}) => Project.create({
  name: 'Bezoekerseconomie',
  description: 'Onderzoek naar bezoekerseconomie in Amsterdam.',
  reason: ['NEW_POLICY'],
  scanGoal: 'Een breder perspectief krijgen op nieuw beleid.',
  impactMotivation: 'We willen bredewelvaartseffecten beter begrijpen.',
  scope: 'Richt u op Amsterdam.',
  status: 'DRAFT',
  createdBy: ownerId,
  themes: [DEFAULT_THEME],
  users: [
    {
      user: ownerId,
      role: 'OWNER',
    },
  ],
  ...extra,
});

const MOCK_AI_RESPONSE = {
  computed_at: '2026-05-12T12:00:00.000Z',
  sources: [
    {
      doc_id: 'openresearch:1',
      title: 'Bron over bezoekers',
      url: 'https://example.test/source',
      score: 0.91,
      chunk_type: 'summary',
      metadata: { category: 'report' },
    },
  ],
  authors: [
    {
      id: 42,
      name: 'Dr. Expert',
      affiliation: 'Onderzoeksbureau',
      doc_ids: ['openresearch:1'],
      score: 0.85,
    },
  ],
  talking_points: [
    {
      topic: 'Drukte in de binnenstad',
      description: 'Bespreek de verdeling van baten en lasten.',
      themes: ['veiligheid'],
      supporting_doc_ids: ['openresearch:1'],
    },
  ],
};

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

describe('Project AI analysis', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns an empty dashboard state before analysis has started', async () => {
    const user = createMockUser();
    const project = await createProject(user.id);
    const server = createTestServer();

    const response = await executeOperation(
      server,
      `
        query ProjectAiAnalysis($projectId: ID!) {
          projectAiAnalysis(projectId: $projectId) {
            status
            methodExplanation
            experts { name }
            sources { title }
            talkingPoints { topic }
            themes { slug }
          }
        }
      `,
      { projectId: project._id.toString() },
      { user, isAuthenticated: true }
    );

    expect(response.body.kind).toBe('single');
    expect((response.body as any).singleResult.data?.projectAiAnalysis).toMatchObject({
      status: 'NOT_STARTED',
      experts: [],
      sources: [],
      talkingPoints: [],
      themes: [],
    });
  });

  it('starts analysis through the AI service and persists the dashboard result', async () => {
    const user = createMockUser();
    const project = await createProject(user.id);
    let resolveAnalysis: (value: any) => void = () => {};
    const analysisPromise = new Promise(resolve => {
      resolveAnalysis = resolve;
    });
    const analyzeProjectStream = jest
      .spyOn(defaultAiServiceClient, 'analyzeProjectStream')
      .mockReturnValue(analysisPromise as any);
    const server = createTestServer();

    const response = await executeOperation(
      server,
      `
        mutation StartProjectAiAnalysis($projectId: ID!) {
          startProjectAiAnalysis(projectId: $projectId) {
            status
            generatedQuestion
            inputSummary
            errorMessage
            experts { externalId name organisation score sourceIds }
            sources { externalId title url score sourceType metadata }
            talkingPoints { topic description themes supportingSourceIds }
            themes { slug }
          }
        }
      `,
      { projectId: project._id.toString() },
      { user, isAuthenticated: true }
    );

    expect(response.body.kind).toBe('single');
    const analysis = (response.body as any).singleResult.data?.startProjectAiAnalysis;
    expect(analysis).toMatchObject({
      status: 'RUNNING',
      generatedQuestion: 'Een breder perspectief krijgen op nieuw beleid.',
      errorMessage: null,
      experts: [],
      sources: [],
      talkingPoints: [],
      themes: [],
    });

    await waitFor(() => {
      expect(analyzeProjectStream).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: project._id.toString(),
          input: expect.objectContaining({
            language: 'nl',
            top_n: 20,
            goal: expect.stringContaining('Een breder perspectief krijgen op nieuw beleid.'),
          }),
          features: ['sources', 'authors', 'talking_points'],
        }),
        expect.any(Function)
      );
    });

    const running = await Project.findById(project._id).lean();
    expect((running as any).aiAnalyses[0].status).toBe('RUNNING');

    resolveAnalysis({
      project_id: project._id.toString(),
      ...MOCK_AI_RESPONSE,
    });

    await waitFor(async () => {
      const persisted = await Project.findById(project._id).lean();
      expect((persisted as any).aiAnalyses).toHaveLength(1);
      expect((persisted as any).aiAnalyses[0].status).toBe('COMPLETED');
      expect((persisted as any).aiAnalyses[0]).not.toHaveProperty('errorMessage');
      expect((persisted as any).aiAnalyses[0].sources[0]).not.toHaveProperty('content');
      expect((persisted as any).aiAnalyses[0].experts[0]).not.toHaveProperty('description');
    });
  });

  it('does not send a theme to the AI service (project-level verkenning)', async () => {
    const user = createMockUser();
    const project = await createProject(user.id);
    const analyzeProjectStream = jest
      .spyOn(defaultAiServiceClient, 'analyzeProjectStream')
      .mockResolvedValue({ project_id: project._id.toString(), ...MOCK_AI_RESPONSE });
    const server = createTestServer();

    await executeOperation(
      server,
      `mutation StartProjectAiAnalysis($projectId: ID!) {
        startProjectAiAnalysis(projectId: $projectId) { status }
      }`,
      { projectId: project._id.toString() },
      { user, isAuthenticated: true }
    );

    await waitFor(() => {
      expect(analyzeProjectStream).toHaveBeenCalled();
    });
    const sentInput = (analyzeProjectStream.mock.calls[0][0] as any).input;
    expect(sentInput).not.toHaveProperty('theme');
  });

  it('normalizes AI talking point themes to project theme slugs before persisting', async () => {
    const user = createMockUser();
    const project = await createProject(user.id, {
      themes: CANONICAL_THEMES,
    });
    jest
      .spyOn(defaultAiServiceClient, 'analyzeProjectStream')
      .mockResolvedValue({
        project_id: project._id.toString(),
        ...MOCK_AI_RESPONSE,
        talking_points: [
          {
            topic: 'Verdeling van drukte',
            description: 'Bespreek welke groepen meer drukte ervaren.',
            themes: ['mentale gezondheid', 'sociale cohesie', 'inkomen & arbeid', 'onbekend label'],
            supporting_doc_ids: ['openresearch:1'],
          },
        ],
      });
    const server = createTestServer();

    await executeOperation(
      server,
      `
        mutation StartProjectAiAnalysis($projectId: ID!) {
          startProjectAiAnalysis(projectId: $projectId) {
            status
          }
        }
      `,
      { projectId: project._id.toString() },
      { user, isAuthenticated: true }
    );

    await waitFor(async () => {
      const persisted = await Project.findById(project._id).lean();
      expect((persisted as any).aiAnalyses[0].talkingPoints[0].themes).toEqual([
        'gezondheid',
        'sociaal-kapitaal',
        'consumptie-en-inkomen',
      ]);
    });
  });

  it('normalizes stored talking point themes when querying existing analyses', async () => {
    const user = createMockUser();
    const project = await createProject(user.id, {
      themes: CANONICAL_THEMES,
      aiAnalyses: [
        {
          themeSlug: PROJECT_ANALYSIS_KEY,
          status: 'COMPLETED',
          methodExplanation: 'Test',
          experts: [],
          sources: [],
          themes: [],
          talkingPoints: [
            {
              topic: 'Drukte en veiligheid',
              description: 'Bespreek het effect op gezondheid en veiligheid.',
              themes: ['mental health', 'Veiligheid', 'onbekend label'],
              supportingSourceIds: ['openresearch:1'],
            },
          ],
        },
      ],
    });
    const server = createTestServer();

    const response = await executeOperation(
      server,
      `
        query ProjectAiAnalysis($projectId: ID!) {
          projectAiAnalysis(projectId: $projectId) {
            talkingPoints {
              themes
            }
          }
        }
      `,
      { projectId: project._id.toString() },
      { user, isAuthenticated: true }
    );

    expect(response.body.kind).toBe('single');
    expect((response.body as any).singleResult.data?.projectAiAnalysis.talkingPoints[0].themes).toEqual([
      'gezondheid',
      'veiligheid',
    ]);
  });

  it('persists failed analysis state when the AI service fails', async () => {
    const user = createMockUser();
    const project = await createProject(user.id);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let rejectAnalysis: (error: Error) => void = () => {};
    const analysisPromise = new Promise((_, reject) => {
      rejectAnalysis = reject;
    });
    jest
      .spyOn(defaultAiServiceClient, 'analyzeProjectStream')
      .mockReturnValue(analysisPromise as any);
    const server = createTestServer();

    const response = await executeOperation(
      server,
      `
        mutation StartProjectAiAnalysis($projectId: ID!) {
          startProjectAiAnalysis(projectId: $projectId) {
            status
            errorMessage
            sources { externalId }
          }
        }
      `,
      { projectId: project._id.toString() },
      { user, isAuthenticated: true }
    );

    expect(response.body.kind).toBe('single');
    expect((response.body as any).singleResult.data?.startProjectAiAnalysis).toMatchObject({
      status: 'RUNNING',
      errorMessage: null,
      sources: [],
    });

    await waitFor(() => {
      expect(defaultAiServiceClient.analyzeProjectStream).toHaveBeenCalled();
    });
    rejectAnalysis(new Error('AI service unavailable: upstream details'));

    await waitFor(async () => {
      const persisted = await Project.findById(project._id).lean();
      expect((persisted as any).aiAnalyses[0].status).toBe('FAILED');
      expect((persisted as any).aiAnalyses[0].errorMessage).toBe('De AI-verkenning is niet gelukt. Probeer het later opnieuw.');
    });
  });

  it('rejects unauthenticated access', async () => {
    const server = createTestServer();

    const response = await executeOperation(
      server,
      `
        query ProjectAiAnalysis($projectId: ID!) {
          projectAiAnalysis(projectId: $projectId) {
            status
          }
        }
      `,
      { projectId: new mongoose.Types.ObjectId().toString() }
    );

    expect(response.body.kind).toBe('single');
    expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('rejects reviewer attempts to start analysis', async () => {
    const owner = createMockUser();
    const reviewer = createMockUser();
    const project = await createProject(owner.id, {
      users: [
        { user: owner.id, role: 'OWNER' },
        { user: reviewer.id, role: 'REVIEWER' },
      ],
    });
    const server = createTestServer();

    const response = await executeOperation(
      server,
      `
        mutation StartProjectAiAnalysis($projectId: ID!) {
          startProjectAiAnalysis(projectId: $projectId) {
            status
          }
        }
      `,
      { projectId: project._id.toString() },
      { user: reviewer, isAuthenticated: true }
    );

    expect(response.body.kind).toBe('single');
    expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
  });

  it('rejects analysis when the new intake flow is incomplete', async () => {
    const user = createMockUser();
    const project = await createProject(user.id, {
      scope: '',
    });
    const server = createTestServer();

    const response = await executeOperation(
      server,
      `
        mutation StartProjectAiAnalysis($projectId: ID!) {
          startProjectAiAnalysis(projectId: $projectId) {
            status
          }
        }
      `,
      { projectId: project._id.toString() },
      { user, isAuthenticated: true }
    );

    expect(response.body.kind).toBe('single');
    expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('BAD_USER_INPUT');
  });

  it('returns not found for a missing project', async () => {
    const user = createMockUser();
    const server = createTestServer();

    const response = await executeOperation(
      server,
      `
        mutation StartProjectAiAnalysis($projectId: ID!) {
          startProjectAiAnalysis(projectId: $projectId) {
            status
          }
        }
      `,
      { projectId: new mongoose.Types.ObjectId().toString() },
      { user, isAuthenticated: true }
    );

    expect(response.body.kind).toBe('single');
    expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('NOT_FOUND');
  });

  it('restarting the analysis replaces the single project-level entry', async () => {
    const user = createMockUser();
    const project = await createProject(user.id);
    jest
      .spyOn(defaultAiServiceClient, 'analyzeProjectStream')
      .mockResolvedValue({ project_id: project._id.toString(), ...MOCK_AI_RESPONSE });
    const server = createTestServer();

    const start = () =>
      executeOperation(
        server,
        `mutation StartProjectAiAnalysis($projectId: ID!) {
          startProjectAiAnalysis(projectId: $projectId) { status }
        }`,
        { projectId: project._id.toString() },
        { user, isAuthenticated: true }
      );

    await start();
    await start();

    await waitFor(async () => {
      const persisted = await Project.findById(project._id).lean();
      const analyses = (persisted as any).aiAnalyses;
      expect(analyses).toHaveLength(1);
      expect(analyses[0].status).toBe('COMPLETED');
    });
  });

  it('searchQuestion override propagates into stored generatedQuestion', async () => {
    const user = createMockUser();
    const project = await createProject(user.id);
    const analyzeProjectStream = jest
      .spyOn(defaultAiServiceClient, 'analyzeProjectStream')
      .mockResolvedValue({ project_id: project._id.toString(), ...MOCK_AI_RESPONSE });
    const server = createTestServer();

    const customQuestion = 'Wat is de impact op woningprijzen?';

    const response = await executeOperation(
      server,
      `mutation StartProjectAiAnalysis($projectId: ID!, $searchQuestion: String) {
        startProjectAiAnalysis(projectId: $projectId, searchQuestion: $searchQuestion) {
          generatedQuestion
          searchQuestion
        }
      }`,
      { projectId: project._id.toString(), searchQuestion: customQuestion },
      { user, isAuthenticated: true }
    );

    expect(response.body.kind).toBe('single');
    const result = (response.body as any).singleResult.data?.startProjectAiAnalysis;
    expect(result.generatedQuestion).toBe(customQuestion);
    expect(result.searchQuestion).toBe(customQuestion);

    const persisted = await Project.findById(project._id).lean();
    expect((persisted as any).aiAnalyses[0].generatedQuestion).toBe(customQuestion);
    expect((persisted as any).aiAnalyses[0].searchQuestion).toBe(customQuestion);

    // The edited question drives the search: it leads the goal sent to the AI.
    await waitFor(() => {
      expect(analyzeProjectStream).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            goal: expect.stringContaining(customQuestion),
          }),
        }),
        expect.any(Function)
      );
    });
  });

  it('non-member cannot query project AI analysis', async () => {
    const owner = createMockUser();
    const stranger = createMockUser();
    const project = await createProject(owner.id);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const server = createTestServer();

    const response = await executeOperation(
      server,
      `query ProjectAiAnalysis($projectId: ID!) {
        projectAiAnalysis(projectId: $projectId) { status }
      }`,
      { projectId: project._id.toString() },
      { user: stranger, isAuthenticated: true }
    );

    expect(response.body.kind).toBe('single');
    expect((response.body as any).singleResult.errors?.[0].extensions.code).toBe('UNAUTHENTICATED');
  });
});
