import { describe, it, expect } from '@jest/globals';
import { createTestServer, executeOperation } from '../utils/testServer';
import { TestUser } from '../utils/testServer';

describe('User Queries', () => {
  describe('me', () => {
    it('returns null when not authenticated', async () => {
      const server = createTestServer();
      const query = `
        query Me {
          me {
            id
            email
            displayName
          }
        }
      `;

      const response = await executeOperation(server, query);

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.data?.me).toBeNull();
    });

    it('returns user data when authenticated', async () => {
      const mockUser: TestUser = {
        id: '1',
        entraId: 'test-entra-id',
        email: 'test@example.com',
        displayName: 'Test User',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const server = createTestServer();
      const query = `
        query Me {
          me {
            id
            email
            displayName
          }
        }
      `;

      const response = await executeOperation(server, query, undefined, {
        user: mockUser,
        isAuthenticated: true
      });

      expect(response.body.kind).toBe('single');
      expect((response.body as any).singleResult.data?.me).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        displayName: mockUser.displayName
      });
    });
  });
});