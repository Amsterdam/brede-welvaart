import { ApolloServerPlugin, GraphQLRequestListener } from '@apollo/server';
import { trackGraphQLOperation, trackException, trackEvent } from './telemetry';

/**
 * Apollo Server plugin for GraphQL operation telemetry
 */
export function createGraphQLTelemetryPlugin(): ApolloServerPlugin {
  return {
    async requestDidStart(): Promise<GraphQLRequestListener<any>> {
      return {
        async didResolveOperation(requestContext) {
          // Track when operation is resolved
          const operationName = requestContext.request.operationName || 'Anonymous';
          const operationType = requestContext.operation?.operation || 'unknown';

          trackEvent('GraphQLOperationStart', {
            operationName,
            operationType,
            query: requestContext.request.query?.substring(0, 500) || '',
          });
        },

        async didEncounterErrors(requestContext) {
          // Track GraphQL errors
          const operationName = requestContext.request.operationName || 'Anonymous';
          const operationType = requestContext.operation?.operation || 'unknown';

          requestContext.errors.forEach((error) => {
            trackException(error, {
              operationName,
              operationType,
              query: requestContext.request.query?.substring(0, 500) || '',
              path: error.path?.join('.') || 'unknown',
              source: 'graphql',
            });
          });
        },

        async willSendResponse(requestContext) {
          // Track operation completion
          const operationName = requestContext.request.operationName || 'Anonymous';
          const operationType = requestContext.operation?.operation || 'unknown';
          const hasErrors = requestContext.errors && requestContext.errors.length > 0;

          // Calculate duration if possible
          const duration = Date.now() - (requestContext.request.extensions?.startTime || Date.now());

          trackGraphQLOperation(
            operationName,
            operationType as 'query' | 'mutation' | 'subscription',
            duration,
            !hasErrors,
            hasErrors ? requestContext.errors?.map(e => e.message).join('; ') : undefined,
            requestContext.contextValue?.user?.id
          );

          trackEvent('GraphQLOperationComplete', {
            operationName,
            operationType,
            success: (!hasErrors).toString(),
            duration: duration.toString(),
            errorCount: hasErrors ? requestContext.errors!.length.toString() : '0',
          });
        },
      };
    },
  };
}
