import { Comment } from "../models/Comment";
import { CommentReadState } from "../models/CommentReadState";
import { Project } from "../models/Project";
import { mapMongoToGraphQL } from "../lib/mongoMapper";
import { AuthenticationError } from "../lib/errors";
import { isUserAssignedToProject } from "../lib/permissions";

// Query resolvers for comments
export const commentQueries = {
  comments: async (_parent: any, args: { projectSlug: string }, context: any) => {
    const project = await Project.findOne({ slug: args.projectSlug }).lean();
    if (!project) {
      throw new AuthenticationError("Project not found");
    }

    const projectId = (project as any)._id?.toString();
    if (!projectId) {
      throw new AuthenticationError("Invalid project ID");
    }

    if (!(await isUserAssignedToProject(projectId, context.user.id))) {
      throw new AuthenticationError("Not authorized for this project");
    }

    // Fetch comments and read states in parallel — zero N+1 queries
    const [commentsDoc, readStates] = await Promise.all([
      Comment.find({ projectId }).lean(),
      CommentReadState.find({ userId: context.user.id, projectId }).lean(),
    ]);

    // Build O(1) lookup map: commentId → lastReadAt
    const readStateMap = new Map<string, Date>();
    for (const rs of readStates) {
      readStateMap.set((rs as any).commentId.toString(), (rs as any).lastReadAt);
    }

    return Array.isArray(commentsDoc)
      ? commentsDoc.map((c: any) => {
          const mapped = mapMongoToGraphQL(c);
          if (mapped) {
            // Inject read state for field resolvers
            (mapped as any)._lastReadAt = readStateMap.get(c._id.toString()) || null;
            (mapped as any)._rawReplies = c.replies || [];
            (mapped as any)._lastActivityAt = c.lastActivityAt || c.createdAt;
          }
          return mapped;
        })
      : [];
  }
};
