import { describe, it, expect, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { createTestServer, executeOperation, TestUser } from '../utils/testServer';
import { Project } from '../../models/Project';
import { Comment } from '../../models/Comment';
import { User } from '../../models/User';

describe('Comment Mutations', () => {
  let mockUser: TestUser;
  let project: any;
  let comment: any;
  let reply: any;

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

    comment = await Comment.create({
      projectId: project.id,
      author: mockUser.id,
      body: 'Initial comment',
      resolved: false,
      replies: []
    });
  });

  describe('createComment', () => {
    it('creates a new comment', async () => {
      const server = createTestServer();
      const mutation = `
        mutation CreateComment($input: CreateCommentInput!) {
          createComment(input: $input) {
            id
            body
            resolved
          }
        }
      `;
      const input = {
        projectId: project.id,
        body: 'New comment'
      };
      const response = await executeOperation(server, mutation, { input }, { user: mockUser, isAuthenticated: true });
      expect(response.body.kind).toBe('single');
      const data = (response.body as any).singleResult.data.createComment;
      expect(data.body).toBe('New comment');
      expect(data.resolved).toBe(false);
    });

    it('returns error if not authenticated', async () => {
      const server = createTestServer();
      const mutation = `
        mutation CreateComment($input: CreateCommentInput!) {
          createComment(input: $input) {
            id
          }
        }
      `;
      const input = {
        projectId: project.id,
        body: 'New comment'
      };
      const response = await executeOperation(server, mutation, { input }, { user: null, isAuthenticated: false });
      expect(response.body.kind).toBe('single');
      const singleResult = (response.body as any).singleResult;
      expect(singleResult.errors).toBeDefined();
      expect(singleResult.data).toBeNull();
    });
  });

  describe('updateComment', () => {
    it('updates an existing comment', async () => {
      const server = createTestServer();
      const mutation = `
        mutation UpdateComment($id: ID!, $input: UpdateCommentInput!) {
          updateComment(id: $id, input: $input) {
            id
            body
          }
        }
      `;
      const input = { body: 'Updated comment' };
      const response = await executeOperation(server, mutation, { id: comment.id, input }, { user: mockUser, isAuthenticated: true });
      expect(response.body.kind).toBe('single');
      const data = (response.body as any).singleResult.data.updateComment;
      expect(data.body).toBe('Updated comment');
    });

    it('returns error for invalid comment id', async () => {
      const server = createTestServer();
      const mutation = `
        mutation UpdateComment($id: ID!, $input: UpdateCommentInput!) {
          updateComment(id: $id, input: $input) {
            id
          }
        }
      `;
      const input = { body: 'Updated comment' };
      const response = await executeOperation(server, mutation, { id: 'invalid-id', input }, { user: mockUser, isAuthenticated: true });
      expect(response.body.kind).toBe('single');
      const singleResult = (response.body as any).singleResult;
      expect(singleResult.errors).toBeDefined();
      expect(singleResult.data).toBeNull();
    });
  });

  describe('deleteComment', () => {
    it('deletes a comment', async () => {
      const server = createTestServer();
      const mutation = `
        mutation DeleteComment($id: ID!) {
          deleteComment(id: $id)
        }
      `;
      const response = await executeOperation(server, mutation, { id: comment.id }, { user: mockUser, isAuthenticated: true });
      expect(response.body.kind).toBe('single');
      const data = (response.body as any).singleResult.data.deleteComment;
      expect(data).toBe(true);
    });

    it('returns error for invalid comment id', async () => {
      const server = createTestServer();
      const mutation = `
        mutation DeleteComment($id: ID!) {
          deleteComment(id: $id)
        }
      `;
      const response = await executeOperation(server, mutation, { id: 'invalid-id' }, { user: mockUser, isAuthenticated: true });
      expect(response.body.kind).toBe('single');
      const singleResult = (response.body as any).singleResult;
      expect(singleResult.errors).toBeDefined();
      expect(singleResult.data).toBeNull();
    });
  });

  describe('addReply', () => {
    it('adds a reply to a comment', async () => {
      const server = createTestServer();
      const mutation = `
        mutation AddReply($input: CreateReplyInput!) {
          addReply(input: $input) {
            id
            body
            resolved
          }
        }
      `;
      const input = { commentId: comment.id, body: 'A reply' };
      const response = await executeOperation(server, mutation, { input }, { user: mockUser, isAuthenticated: true });
      expect(response.body.kind).toBe('single');
      const data = (response.body as any).singleResult.data.addReply;
      expect(data.body).toBe('A reply');
      expect(data.resolved).toBe(false);
    });

    it('returns error for invalid comment id', async () => {
      const server = createTestServer();
      const mutation = `
        mutation AddReply($input: CreateReplyInput!) {
          addReply(input: $input) {
            id
          }
        }
      `;
      const input = { commentId: 'invalid-id', body: 'A reply' };
      const response = await executeOperation(server, mutation, { input }, { user: mockUser, isAuthenticated: true });
      expect(response.body.kind).toBe('single');
      const singleResult = (response.body as any).singleResult;
      expect(singleResult.errors).toBeDefined();
      expect(singleResult.data).toBeNull();
    });
  });

  describe('updateReply', () => {
    beforeEach(async () => {
      // Add a reply to the comment for update/delete tests
      const updated = await Comment.findById(comment.id);
      updated!.replies.push({
        author: mockUser.id,
        body: 'Original reply',
        resolved: false
      });
      await updated!.save();
      comment = await Comment.findById(comment.id);
      reply = comment!.replies[0];
    });

    it('updates a reply', async () => {
      const server = createTestServer();
      const mutation = `
        mutation UpdateReply($commentId: ID!, $replyId: ID!, $input: UpdateReplyInput!) {
          updateReply(commentId: $commentId, replyId: $replyId, input: $input) {
            id
            body
          }
        }
      `;
      const input = { body: 'Updated reply' };
      const response = await executeOperation(server, mutation, { commentId: comment.id, replyId: reply.id, input }, { user: mockUser, isAuthenticated: true });
      expect(response.body.kind).toBe('single');
      const data = (response.body as any).singleResult.data.updateReply;
      expect(data.body).toBe('Updated reply');
    });

    it('returns error for invalid reply id', async () => {
      const server = createTestServer();
      const mutation = `
        mutation UpdateReply($commentId: ID!, $replyId: ID!, $input: UpdateReplyInput!) {
          updateReply(commentId: $commentId, replyId: $replyId, input: $input) {
            id
          }
        }
      `;
      const input = { body: 'Updated reply' };
      const response = await executeOperation(server, mutation, { commentId: comment.id, replyId: 'invalid-id', input }, { user: mockUser, isAuthenticated: true });
      expect(response.body.kind).toBe('single');
      const singleResult = (response.body as any).singleResult;
      expect(singleResult.errors).toBeDefined();
      expect(singleResult.data).toBeNull();
    });
  });

  describe('deleteReply', () => {
    beforeEach(async () => {
      // Add a reply to the comment for update/delete tests
      const updated = await Comment.findById(comment.id);
      updated!.replies.push({
        author: mockUser.id,
        body: 'Reply to delete',
        resolved: false
      });
      await updated!.save();
      comment = await Comment.findById(comment.id);
      reply = comment!.replies[0];
    });

    it('deletes a reply', async () => {
      const server = createTestServer();
      const mutation = `
        mutation DeleteReply($commentId: ID!, $replyId: ID!) {
          deleteReply(commentId: $commentId, replyId: $replyId)
        }
      `;
      const response = await executeOperation(server, mutation, { commentId: comment.id, replyId: reply.id }, { user: mockUser, isAuthenticated: true });
      expect(response.body.kind).toBe('single');
      const data = (response.body as any).singleResult.data.deleteReply;
      expect(data).toBe(true);
    });

    it('returns error for invalid reply id', async () => {
      const server = createTestServer();
      const mutation = `
        mutation DeleteReply($commentId: ID!, $replyId: ID!) {
          deleteReply(commentId: $commentId, replyId: $replyId)
        }
      `;
      const response = await executeOperation(server, mutation, { commentId: comment.id, replyId: 'invalid-id' }, { user: mockUser, isAuthenticated: true });
      expect(response.body.kind).toBe('single');
      const singleResult = (response.body as any).singleResult;
      expect(singleResult.errors).toBeDefined();
      expect(singleResult.data).toBeNull();
    });
  });

  describe('markCommentResolved', () => {
    it('marks a comment as resolved', async () => {
      const server = createTestServer();
      const mutation = `
        mutation MarkCommentResolved($id: ID!) {
          markCommentResolved(id: $id) {
            id
            resolved
          }
        }
      `;
      const response = await executeOperation(server, mutation, { id: comment.id }, { user: mockUser, isAuthenticated: true });
      expect(response.body.kind).toBe('single');
      const data = (response.body as any).singleResult.data.markCommentResolved;
      expect(data.resolved).toBe(true);
    });

    it('returns error for invalid comment id', async () => {
      const server = createTestServer();
      const mutation = `
        mutation MarkCommentResolved($id: ID!) {
          markCommentResolved(id: $id) {
            id
          }
        }
      `;
      const response = await executeOperation(server, mutation, { id: 'invalid-id' }, { user: mockUser, isAuthenticated: true });
      expect(response.body.kind).toBe('single');
      const singleResult = (response.body as any).singleResult;
      expect(singleResult.errors).toBeDefined();
      expect(singleResult.data).toBeNull();
    });
  });
});
