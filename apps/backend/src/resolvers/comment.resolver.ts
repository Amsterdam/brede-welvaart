import { User } from "../models/User";
import { mapMongoToGraphQL } from "../lib/mongoMapper";
import { canResolveComment } from "../lib/permissions";

// Recursively delete a comment/reply by id
export function deleteCommentById(comments: any[], id: string): boolean {
  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    if (c._id.toString() === id) {
      comments.splice(i, 1);
      return true;
    }
    if (c.replies && c.replies.length > 0) {
      const deleted = deleteCommentById(c.replies, id);
      if (deleted) return true;
    }
  }
  return false;
}

// Recursively update a comment/reply by id
export function updateCommentById(comments: any[], id: string, updateFn: (c: any) => void): boolean {
  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    if (c._id.toString() === id) {
      updateFn(c);
      return true;
    }
    if (c.replies && c.replies.length > 0) {
      const updated = updateCommentById(c.replies, id, updateFn);
      if (updated) return true;
    }
  }
  return false;
}

// Recursively set resolved for a comment/reply and all its descendants
export function setResolvedRecursive(comment: any, resolved: boolean) {
  comment.resolved = resolved;
  if (comment.replies && comment.replies.length > 0) {
    for (const reply of comment.replies) {
      setResolvedRecursive(reply, resolved);
    }
  }
}

// Recursively find parent of a comment/reply by id
export function findParentOfCommentById(comments: any[], id: string, parent: any = null): any | null {
  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    if (c._id.toString() === id) {
      return parent;
    }
    if (c.replies && c.replies.length > 0) {
      const found = findParentOfCommentById(c.replies, id, c);
      if (found) return found;
    }
  }
  return null;
}

// Main resolver export
export const commentResolver = {
  author: async (comment: any) => {
    const user = await User.findById(comment.author).lean();
    return user ? mapMongoToGraphQL(user) : null;
  },
  replies: async (comment: any) => {
    // Replies are embedded, just map them
    if (!comment.replies || comment.replies.length === 0) return [];
    return comment.replies.map((c: any) => mapMongoToGraphQL(c));
  },
  canResolve: async (comment: any, _args: any, context: any) => {
    if (!context?.user?.id || !comment.projectId || comment.resolved) {
      return false;
    }
    return await canResolveComment(comment.projectId, context.user.id);
  },
  hasUnread: (comment: any) => {
    // Resolved comments are never unread
    if (comment.resolved) return false;

    const lastReadAt: Date | null = comment._lastReadAt;
    const lastActivityAt: Date = comment._lastActivityAt || comment.createdAt;

    // No read state means never read → unread
    if (!lastReadAt) return true;

    return new Date(lastActivityAt).getTime() > new Date(lastReadAt).getTime();
  },
  unreadReplyCount: (comment: any) => {
    // Resolved comments have 0 unread
    if (comment.resolved) return 0;

    const lastReadAt: Date | null = comment._lastReadAt;
    const rawReplies: any[] = comment._rawReplies || [];

    // No read state → all replies are unread
    if (!lastReadAt) return rawReplies.length;

    const readTime = new Date(lastReadAt).getTime();
    return rawReplies.filter((r: any) => {
      const replyTime = new Date(r.createdAt).getTime();
      return replyTime > readTime;
    }).length;
  },
};

export const replyResolver = {
  author: async (comment: any) => {
    const user = await User.findById(comment.author).lean();
    return user ? mapMongoToGraphQL(user) : null;
  },
};
