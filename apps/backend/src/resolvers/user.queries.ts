import { User } from '../models/User';
import { AppContext, User as UserType } from '@shared/types';
import { mapMongoToGraphQL } from '../lib/mongoMapper';

export const userQueries = {
  me: async (_: any, {}: {}, context: AppContext) => {
    if (!context.isAuthenticated || !context.user) {
      return null;
    }

    try {
      // For direct user context (e.g. in tests), return the user directly
      if (!context.user._id) {
        return mapMongoToGraphQL<UserType>(context.user);
      }

      // For database users, fetch from MongoDB
      const user = await User.findById(context.user._id).lean();
      return mapMongoToGraphQL<UserType>(user);
    } catch (error) {
      console.error('Error in me query:', error);
      return null;
    }
  },
};
