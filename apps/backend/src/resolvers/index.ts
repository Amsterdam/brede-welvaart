import { argumentMutations } from './argument.mutations';
import { projectQueries } from './project.queries';
import { projectResolver, projectUploadedDocumentResolver } from './project.resolver';
import { projectMutations } from './project.mutations';
import { projectAiAnalysisMutations, projectAiAnalysisQueries } from './projectAiAnalysis';
import { openResearchSourceQueries } from './openResearchSource';
import { userQueries } from './user.queries';
import { dateTimeResolver, jsonResolver } from '../graphql/scalars.graphql';
import { validationScalarResolvers } from '../graphql/scalars.validation';
import { commentResolver, replyResolver } from './comment.resolver';
import { commentQueries } from './comment.queries';
import { commentMutations } from './comment.mutations';

export const resolvers: any = {
  Query: {
    ...projectQueries,
    ...projectAiAnalysisQueries,
    ...openResearchSourceQueries,
    ...userQueries,
    ...commentQueries
  },
  Mutation: {
    ...argumentMutations,
    ...projectMutations,
    ...projectAiAnalysisMutations,
    ...commentMutations
  },
  DateTime: dateTimeResolver,
  JSON: jsonResolver,
  ...validationScalarResolvers,
  Project: {
    ...projectResolver,
  },
  ProjectUploadedDocument: {
    ...projectUploadedDocumentResolver,
  },
  Comment: {
    ...commentResolver
  },
  Reply: {
    ...replyResolver
  }
};
