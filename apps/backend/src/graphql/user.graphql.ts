import gql from 'graphql-tag';

export const userTypeDefs = gql`
  type User {
    id: ID!
    email: String!
    displayName: String!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Query {
    me: User
  }
`;
