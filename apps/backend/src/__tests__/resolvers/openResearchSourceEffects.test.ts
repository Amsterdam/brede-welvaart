import { afterEach, describe, expect, it, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { Project } from '../../models/Project';
import { SourceEffectCache, ISourceEffectStatement } from '../../models/SourceEffectCache';
import { defaultAiServiceClient } from '../../lib/aiServiceClient';
import { createTestServer, executeOperation, TestUser } from '../utils/testServer';

const createMockUser = (): TestUser => ({
  id: new mongoose.Types.ObjectId().toString(),
  entraId: 'test-entra-id',
  email: 'test@example.com',
  displayName: 'Test User',
  createdAt: new Date(),
  updatedAt: new Date(),
});

const createProject = async (ownerId: string, extra: Record<string, unknown> = {}) =>
  Project.create({
    name: 'Bezoekerseconomie',
    description: 'Onderzoek naar bezoekerseconomie in Amsterdam.',
    reason: ['NEW_POLICY'],
    scanGoal: 'Een breder perspectief krijgen op nieuw beleid.',
    impactMotivation: 'We willen bredewelvaartseffecten beter begrijpen.',
    scope: 'Richt u op Amsterdam.',
    status: 'DRAFT',
    createdBy: ownerId,
    themes: [{ slug: 'wonen', name: 'Wonen', description: 'Woningmarkt', isActive: true }],
    users: [{ user: ownerId, role: 'OWNER' }],
    ...extra,
  });

const EFFECTS_QUERY = `
  query SourceEffects($projectId: ID!, $sourceId: ID!) {
    openResearchSourceEffects(projectId: $projectId, sourceId: $sourceId) {
      text
      page
    }
  }
`;

const statementsOf = (response: any) =>
  (response.body as any).singleResult.data?.openResearchSourceEffects;

describe('openResearchSourceEffects caching', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores statements and reuses them without re-calling the AI service', async () => {
    const user = createMockUser();
    const project = await createProject(user.id);
    const server = createTestServer();

    const findStatements = jest
      .spyOn(defaultAiServiceClient, 'findStatements')
      .mockResolvedValue([
        { text: 'Effect A', page: 3 },
        { text: '   ', page: null }, // blank → filtered out
      ] as any);

    const vars = { projectId: project._id.toString(), sourceId: '71261' };

    const first = await executeOperation(server, EFFECTS_QUERY, vars, { user, isAuthenticated: true });
    expect(statementsOf(first)).toEqual([{ text: 'Effect A', page: 3 }]);
    expect(findStatements).toHaveBeenCalledTimes(1);

    const rows = await SourceEffectCache.find({ projectId: project._id });
    expect(rows).toHaveLength(1);
    expect(rows[0].docId).toBe('openresearch:71261');

    const second = await executeOperation(server, EFFECTS_QUERY, vars, { user, isAuthenticated: true });
    expect(statementsOf(second)).toEqual([{ text: 'Effect A', page: 3 }]);
    // Cache hit → the AI service is not called again.
    expect(findStatements).toHaveBeenCalledTimes(1);
  });

  it('recomputes and overwrites the cache when the project specs change', async () => {
    const user = createMockUser();
    const project = await createProject(user.id);
    const server = createTestServer();

    const findStatements = jest
      .spyOn(defaultAiServiceClient, 'findStatements')
      .mockResolvedValueOnce([{ text: 'Old', page: 1 }] as any)
      .mockResolvedValueOnce([{ text: 'New', page: 2 }] as any);

    const vars = { projectId: project._id.toString(), sourceId: '71261' };

    await executeOperation(server, EFFECTS_QUERY, vars, { user, isAuthenticated: true });
    expect(findStatements).toHaveBeenCalledTimes(1);

    // Change a spec the extraction depends on → invalidates the cached statements.
    await Project.updateOne({ _id: project._id }, { scanGoal: 'Een heel ander onderwerp.' });

    const after = await executeOperation(server, EFFECTS_QUERY, vars, { user, isAuthenticated: true });
    expect(statementsOf(after)).toEqual([{ text: 'New', page: 2 }]);
    expect(findStatements).toHaveBeenCalledTimes(2);

    // Overwritten in place — not duplicated.
    const rows = await SourceEffectCache.find({ projectId: project._id });
    expect(rows).toHaveLength(1);
    expect(rows[0].statements.map((s: ISourceEffectStatement) => ({ text: s.text, page: s.page }))).toEqual([
      { text: 'New', page: 2 },
    ]);
  });

  it('does not cache an extraction failure as a valid empty result', async () => {
    const user = createMockUser();
    const project = await createProject(user.id);
    const server = createTestServer();

    jest.spyOn(defaultAiServiceClient, 'findStatements').mockRejectedValue(
      new Error('AI service returned 502')
    );

    const response = await executeOperation(
      server,
      EFFECTS_QUERY,
      { projectId: project._id.toString(), sourceId: '71261' },
      { user, isAuthenticated: true }
    );

    expect((response.body as any).singleResult.errors).toBeDefined();
    expect(await SourceEffectCache.countDocuments({ projectId: project._id })).toBe(0);
  });
});
