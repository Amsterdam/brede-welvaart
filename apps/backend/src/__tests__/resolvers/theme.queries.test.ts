import { describe, it, expect, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { createTestServer, executeOperation } from '../utils/testServer';
import { Theme } from '../../models/Theme';
import { Project } from '../../models/Project';

describe('Theme Queries', () => {
  let mockUser: any;
  let project: any;
  let theme: any;

  beforeEach(async () => {
    // Clean up collections
    await Theme.deleteMany({});
    await Project.deleteMany({});

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
      createdBy: mockUser.id
    });

    theme = await Theme.create({
      name: 'Test Theme',
      slug: 'test-theme',
      projectId: project.id,
      color: '#000000'
    });
  });

  describe('project(id: ID!) { themes { ... } }', () => {
    it('returns all themes for the project', async () => {
      // Add a second theme
      const theme2 = await Theme.create({
        name: 'Second Theme',
        slug: 'second-theme',
        projectId: project.id,
        color: '#FFFFFF'
      });

      const server = createTestServer();
      const query = `
        query ProjectThemes($id: ID!) {
          project(id: $id) {
            id
            themes {
              id
              name
              slug
              color
              projectId
            }
          }
        }
      `;
      const response = await executeOperation(
        server,
        query,
        { id: project.id },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      const themes = (response.body as any).singleResult.data.project.themes;
      expect(Array.isArray(themes)).toBe(true);
      expect(themes.length).toBe(2);

      const names = themes.map((t: any) => t.name);
      expect(names).toContain(theme.name);
      expect(names).toContain(theme2.name);
    });

    it('returns an empty array if the project has no themes', async () => {
      await Theme.deleteMany({ projectId: project.id });
      const server = createTestServer();
      const query = `
        query ProjectThemes($id: ID!) {
          project(id: $id) {
            id
            themes {
              id
              name
            }
          }
        }
      `;
      const response = await executeOperation(
        server,
        query,
        { id: project.id },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      const themes = (response.body as any).singleResult.data.project.themes;
      expect(themes).toEqual([]);
    });

    it('returns null for non-existent project', async () => {
      const server = createTestServer();
      const query = `
        query ProjectThemes($id: ID!) {
          project(id: $id) {
            id
            themes {
              id
              name
            }
          }
        }
      `;
      const nonExistentId = new mongoose.Types.ObjectId().toString();
      const response = await executeOperation(
        server,
        query,
        { id: nonExistentId },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      const projectData = (response.body as any).singleResult.data.project;
      expect(projectData).toBeNull();
    });

    it('returns an error for invalid project ID format', async () => {
      const server = createTestServer();
      const query = `
        query ProjectThemes($id: ID!) {
          project(id: $id) {
            id
            themes {
              id
              name
            }
          }
        }
      `;
      const response = await executeOperation(
        server,
        query,
        { id: 'not-a-valid-id' },
        { user: mockUser, isAuthenticated: true }
      );

      expect(response.body.kind).toBe('single');
      const errors = (response.body as any).singleResult.errors;
      expect(errors).toBeDefined();
      const data = (response.body as any).singleResult.data;
      expect(data?.project).toBeNull();
    });
  });
});
