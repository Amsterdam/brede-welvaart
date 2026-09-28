import { ApolloServer, GraphQLResponse } from '@apollo/server';
import { resolvers } from '../../resolvers';
import { userTypeDefs } from '../../graphql/user.graphql';
import { projectTypeDefs } from '../../graphql/project.graphql';
import { scalars } from '../../graphql/scalars.graphql';
import { argumentTypeDefs } from '../../graphql/argument.graphql';
import { themeTypeDefs } from '../../graphql/theme.graphql';
import { commentTypeDefs } from '../../graphql/comment.graphql';
import { validationScalarTypeDefs } from '../../graphql/scalars.validation';

export interface TestUser {
  _id?: string;
  id: string;
  entraId: string;
  email: string;
  displayName: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TestContext {
  user: TestUser | null;
  isAuthenticated: boolean;
}

export const createTestServer = () => {
  const server = new ApolloServer<TestContext>({
    typeDefs: [scalars, validationScalarTypeDefs, argumentTypeDefs, projectTypeDefs, themeTypeDefs, userTypeDefs, commentTypeDefs],
    resolvers,
  });

  return server;
};

export const executeOperation = async (
  server: ApolloServer<TestContext>,
  query: string,
  variables?: Record<string, any>,
  context?: Partial<TestContext>
): Promise<GraphQLResponse> => {
  const user: TestUser | null = context?.user && !context.user._id && /^[a-f\d]{24}$/i.test(context.user.id)
    ? { ...context.user, _id: context.user.id }
    : context?.user ?? null;

  return server.executeOperation(
    {
      query,
      variables,
    },
    {
      contextValue: {
        isAuthenticated: false,
        ...context,
        user,
      },
    }
  );
};
