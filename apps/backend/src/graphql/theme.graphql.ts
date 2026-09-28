import gql from "graphql-tag";

export const themeTypeDefs = gql`
  type Theme {
    id: ID!
    name: String!
    slug: String!
    projectSlug: String!
    description: String!
    isActive: Boolean!
    arguments: [Argument]
    createdAt: DateTime!
    updatedAt: DateTime!
}

type Query {
  theme(id: ID!): Theme
  themes: [Theme!]!
}
`;
