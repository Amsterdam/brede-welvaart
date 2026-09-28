import { IProject, IProjectUser, ProjectUserRole, AppContext } from '@shared/types';
import { Project } from '../models/Project';
import { AuthenticationError, NotFoundError } from './errors';

/**
 * Checks if a user is the author of a comment or reply
 *
 * @param comment The comment/reply object (must have author field that is string or has toString())
 * @param userId The user's id to check
 * @returns boolean indicating if user is author
 */
export function isAuthor(comment: { author: string | { toString(): string } }, userId: string): boolean {
  return (typeof comment.author === 'string' ? comment.author : comment.author.toString()) === userId;
}

/**
 * Returns a list of permissible actions for a user on a project.
 *
 * Permissions:
 * - There is no "unpublish" action.
 * - Owners can:
 *   - "publish" (create a final version PDF)
 *   - "resolveComment"
 *   - "writeComment"
 *   - "writeReply"
 *   - "update" and "delete" ONLY when the project status is "DRAFT"
 *   - "update" and "delete" are NOT permitted when the project status is "PUBLISHED" or "ARCHIVED"
 * - Reviewers can:
 *   - "writeComment"
 *   - "writeReply"
 *   - "update" and "delete" are NEVER permitted for reviewers, regardless of project status
 * - If status is ARCHIVED, no actions are permitted for any user.
 * - Service tokens for PDF generation have read-only access to projects.
 *
 * @param project The project object (must have users and status)
 * @param userId The user's id (string)
 * @param context Optional app context for service token handling
 * @returns string[] of actions
 */
export function getPermissibleActions(project: IProject, userId: string, context?: AppContext): string[] {
  if (!project || !userId) return [];
  if (project.status === 'ARCHIVED') return [];

  // Handle service token access for PDF generation
  if (context?.serviceToken) {
    // Service tokens can only read projects that match the token's projectId
    if (context.serviceToken.projectId === project.id?.toString()) {
      return ['read']; // Read-only access for PDF generation
    }
    return []; // No access if project doesn't match
  }

  // Find the user's role in the project
  const userEntry = (project.users || []).find(
    (u: IProjectUser) =>
      (typeof u.user === 'string' ? u.user : u.user?.toString()) === userId
  );
  if (!userEntry) return [];

  const role = userEntry.role;

  if (role === 'OWNER') {
    const actions = ['publish', 'resolveComment', 'writeComment', 'writeReply'];
    if (project.status === 'DRAFT') {
      actions.push('update', 'delete');
    }
    return actions;
  }
  if (role === 'REVIEWER') {
    return ['writeComment', 'writeReply'];
  }
  return [];
}

export async function isUserAssignedToProject(
  projectId: string,
  userId: string,
  role?: ProjectUserRole
) {
  const project = await Project.findById(projectId).lean() as { users?: { user: string | { toString(): string }, role?: ProjectUserRole }[] };
  if (!project) throw new NotFoundError("Project");

  return project.users?.some(u => {
    if (!u) return false;
    const userMatch = (typeof u.user === 'string' ? u.user : u.user.toString()) === userId;
    if (role) {
      return userMatch && u.role === role;
    }
    return userMatch;
  }) || false;
}

export const requireProjectOwner = (project: any, context: AppContext, action: string) => {
  const userId = String(context.user?._id);
  const userEntry = (project as any).users.find(
    (u: any) =>
      (typeof u.user === 'string' ? u.user : u.user._id?.toString()) === userId &&
      u.role === 'OWNER'
  );

  if (!userEntry) {
    throw new AuthenticationError(`You are not authorized to ${action} this project.`);
  }
};

/**
 * Checks if a user can delete a comment
 *
 * Permissions:
 * - Comment author can delete their own comments
 * - Project owner can delete any comment
 *
 * @param comment The comment object (must have author and projectId)
 * @param userId The user's id
 * @param projectId The project's id
 * @returns Promise<boolean>
 */
export async function canDeleteComment(comment: { author: string | { toString(): string }, projectId: string }, userId: string, projectId: string): Promise<boolean> {
  const isOwner = await isUserAssignedToProject(projectId, userId, 'OWNER');
  return isAuthor(comment, userId) || isOwner;
}

/**
 * Checks if a user can resolve a comment
 *
 * Permissions:
 * - Only project owners can resolve comments
 *
 * @param projectId The project's id
 * @param userId The user's id
 * @returns Promise<boolean>
 */
export async function canResolveComment(projectId: string, userId: string): Promise<boolean> {
  return isUserAssignedToProject(projectId, userId, 'OWNER');
}
