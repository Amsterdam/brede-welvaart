import { Comment } from "../models/Comment";
import { CommentReadState } from "../models/CommentReadState";
import { Project } from "../models/Project";
import { mapMongoToGraphQL } from "../lib/mongoMapper";
import { AuthenticationError, NotFoundError } from "../lib/errors";
import { isUserAssignedToProject, canDeleteComment, canResolveComment, isAuthor } from "../lib/permissions";
import { CreateCommentInput, CreateReplyInput, UpdateCommentInput, UpdateReplyInput } from "@shared/types";

// Mutation resolvers for comments
export const commentMutations = {
  async createComment(_parent: any, args: { input: CreateCommentInput }, context: any) {
    const { projectId, body, page, locationData, anchor } = args.input;

    if (!(await isUserAssignedToProject(projectId, context.user.id))) {
      throw new AuthenticationError("Not authorized for this project");
    }

    const now = new Date();
    const comment = await Comment.create({
      projectId,
      author: context.user.id,
      body,
      parent: null,
      replies: [],
      resolved: false,
      page,
      locationData,
      anchor,
      lastActivityAt: now,
    });

    // Auto-mark as read for the author
    await CommentReadState.updateOne(
      { userId: context.user.id, commentId: comment._id },
      { $set: { projectId, lastReadAt: now } },
      { upsert: true }
    );

    return mapMongoToGraphQL(comment.toObject());
  },

  async updateComment(_parent: any, args: { id: string, input: UpdateCommentInput }, context: any) {
    const commentsDoc = await Comment.find({}).exec();
    let updatedComment: any = null;
    let topLevelDoc: any = null;
    for (const doc of commentsDoc) {
      if (doc._id.toString() === args.id) {
        if (!isAuthor(doc, context.user.id)) {
          throw new AuthenticationError("Only the author can edit this comment");
        }
        if (args.input.body !== undefined) doc.body = args.input.body;
        doc.updatedAt = new Date();
        updatedComment = doc;
        topLevelDoc = doc;
        break;
      }
    }
    if (!updatedComment || !topLevelDoc) throw new NotFoundError("Comment");
    await topLevelDoc.save();
    return mapMongoToGraphQL(updatedComment);
  },

  async deleteComment(_parent: any, args: { id: string }, context: any) {
    const comment = await Comment.findById(args.id);
    if (!comment) throw new NotFoundError("Comment");

    if (!(await canDeleteComment(comment, context.user.id, comment.projectId))) {
      throw new AuthenticationError("Only the comment author or project owner can delete this comment");
    }

    await comment.deleteOne();

    // Cascade delete read states for this comment
    await CommentReadState.deleteMany({ commentId: args.id });

    return true;
  },

  async addReply(_parent: any, args: { input: CreateReplyInput }, context: any) {
    const { commentId, body } = args.input;
    // Find the top-level comment
    const parentDoc = await Comment.findById(commentId);

    if (!parentDoc) throw new NotFoundError("Parent comment");

    const now = new Date();
    const reply = {
      _id: new Comment()._id,
      author: context.user.id,
      body,
      resolved: false,
      createdAt: now,
      updatedAt: now,
    };
    parentDoc.replies = parentDoc.replies || [];
    parentDoc.replies.push(reply);

    // Bump lastActivityAt on the parent comment
    parentDoc.lastActivityAt = now;

    await parentDoc.save();

    // Auto-upsert read state for the reply author
    await CommentReadState.updateOne(
      { userId: context.user.id, commentId: parentDoc._id },
      { $set: { projectId: parentDoc.projectId, lastReadAt: now } },
      { upsert: true }
    );

    return mapMongoToGraphQL(reply);
  },

  async updateReply(_parent: any, args: { commentId: string, replyId: string, input: UpdateReplyInput }, context: any) {
    const comment = await Comment.findById(args.commentId);

    if (!comment) throw new NotFoundError("Parent comment");
    const reply = comment.replies.find((r: any) => r._id.toString() === args.replyId);
    if (!reply) throw new NotFoundError("Reply");

    if (!isAuthor(reply, context.user.id)) {
      throw new AuthenticationError("Only the author can edit this reply");
    }

    if (args.input.body !== undefined) reply.body = args.input.body;
    reply.updatedAt = new Date();
    await comment.save();

    return mapMongoToGraphQL(reply);
  },

  async deleteReply(_parent: any, args: { commentId: string, replyId: string }, context: any) {
    const comment = await Comment.findById(args.commentId);

    if (!comment) throw new NotFoundError("Parent comment");

    const replyIndex = comment.replies.findIndex((r: any) => r._id.toString() === args.replyId);

    if (replyIndex === -1) throw new NotFoundError("Reply");

    const reply = comment.replies[replyIndex];
    if (!(await canDeleteComment(reply, context.user.id, comment.projectId))) {
      throw new AuthenticationError("Only the reply author or project owner can delete this reply");
    }

    comment.replies.splice(replyIndex, 1);
    await comment.save();

    return true;
  },

  async markCommentResolved(_parent: any, args: { id: string }, context: any) {
    const comment = await Comment.findById(args.id);
    if (!comment) throw new NotFoundError("Comment");

    if (!(await canResolveComment(comment.projectId, context.user.id))) {
      throw new AuthenticationError("Only the project owner can resolve this comment");
    }

    comment.resolved = true;
    await comment.save();

    return mapMongoToGraphQL(comment);
  },

  async markCommentsRead(_parent: any, args: { commentIds: string[] }, context: any) {
    const now = new Date();

    // Fetch comments to get projectIds for denormalized field
    const comments = await Comment.find({ _id: { $in: args.commentIds } }).lean();
    if (comments.length === 0) return true;

    const bulkOps = comments.map((c: any) => ({
      updateOne: {
        filter: { userId: context.user.id, commentId: c._id },
        update: { $set: { projectId: c.projectId, lastReadAt: now } },
        upsert: true,
      },
    }));

    await CommentReadState.bulkWrite(bulkOps);
    return true;
  },

  async markAllProjectCommentsRead(_parent: any, args: { projectSlug: string }, context: any) {
    const project = await Project.findOne({ slug: args.projectSlug }).lean();
    if (!project) throw new NotFoundError("Project");

    const projectId = (project as any)._id;

    if (!(await isUserAssignedToProject(projectId.toString(), context.user.id))) {
      throw new AuthenticationError("Not authorized for this project");
    }

    const now = new Date();
    const comments = await Comment.find({ projectId }).lean();

    if (comments.length === 0) return true;

    const bulkOps = comments.map((c: any) => ({
      updateOne: {
        filter: { userId: context.user.id, commentId: c._id },
        update: { $set: { projectId, lastReadAt: now } },
        upsert: true,
      },
    }));

    await CommentReadState.bulkWrite(bulkOps);
    return true;
  },
};
