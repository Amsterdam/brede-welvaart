import { Project as ProjectModel } from '../models/Project';
import { AuthenticationError, NotFoundError, handleMongoError } from '../lib/errors';
import mongoose from 'mongoose';
import type { AppContext, QueryProjectArgs, Project } from '@shared/types';
import { mapMongoToGraphQL } from '../lib/mongoMapper';

export const projectQueries = {
  project: async (_: any, args: QueryProjectArgs, context: AppContext): Promise<Project | null> => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      const userId = String(context.user?._id);
      const project = await ProjectModel.findOne({
        'users.user': userId,
        slug: args.slug
      });
      if (!project) {
        throw new NotFoundError('Project');
      }

      return mapMongoToGraphQL<Project>(project);
    } catch (error) {
      handleMongoError(error);
      return null;
    }
  },

  projects: async (_: any, __: any, context: AppContext): Promise<Project[]> => {
    if (!context.isAuthenticated) {
      throw new AuthenticationError();
    }

    try {
      const userId = context.user?._id || (context.user as any)?.id;

      const projects = await ProjectModel.find({
        users: {
          $elemMatch: {
            user: userId,
            role: 'OWNER'
          }
        }
      });
      return projects
        .map(project => mapMongoToGraphQL<Project>(project))
        .filter((p): p is Project => p !== null);
    } catch (error) {
      handleMongoError(error);
      return [] as Project[];
    }
  },
};
