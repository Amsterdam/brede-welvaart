import gql from "graphql-tag";
import { NonEmptyStringResolver } from "graphql-scalars";

export const validationScalarTypeDefs = gql`
  """
  A string that cannot be empty or contain only whitespace
  """
  scalar NonEmptyString
`;

export const validationScalarResolvers = {
  NonEmptyString: NonEmptyStringResolver,
};
