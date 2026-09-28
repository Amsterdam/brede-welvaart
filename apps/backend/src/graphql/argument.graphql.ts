import gql from "graphql-tag";

export const argumentTypeDefs = gql`
  type Argument {
    id: ID!
    title: String!
    explanation: String!
    importance: ArgumentImportance!
    timeFrame: [ArgumentTimeFrame!]!
    location: [ArgumentLocation!]!
    sentiment: ArgumentSentiment!
    source: ArgumentSource!
    sourceEffect: ArgumentSourceEffect
    sourceTitle: String
    generatedByAi: Boolean
    aiProposal: String
    theme: Theme
    discussionPoint: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
    order: Int!
  }

  type ArgumentSource {
    type: ArgumentSourceType!
    link: String
  }

  type ArgumentSourceEffect {
    key: String!
    sourceKind: ArgumentSourceEffectKind!
    sourceId: String!
    effectId: String!
    themeSlug: String
    page: Int
    text: String
  }

  enum ArgumentSentiment {
    POSITIVE
    NEGATIVE
    NEUTRAL
  }

  enum ArgumentSourceType {
    EXPERT
    LINK
    DATA
    POLICY
    RESIDENT
  }

  enum ArgumentSourceEffectKind {
    OPEN_RESEARCH
    UPLOADED_DOCUMENT
  }

  enum ArgumentImportance {
    LOW
    MEDIUM
    HIGH
  }

  enum ArgumentTimeFrame {
    NOW
    ONE_TO_FIVE_Y
    FIVE_TO_TEN_Y
    TEN_TO_TWENTY_Y
    TWENTY_TO_FORTY_Y
    FORTY_PLUS_Y
  }

  enum ArgumentLocation {
    STREET
    NEIGHBORHOOD
    PROVINCE
    CITY
    CITY_DISTRICT
    INSIDE_EU
    OUTSIDE_EU
  }

  type Query {
    argument(id: ID!): Argument
    arguments: [Argument!]!
  }

  input CreateArgumentInput {
    title: NonEmptyString!
    explanation: NonEmptyString!
    importance: ArgumentImportance!
    timeFrame: [ArgumentTimeFrame]
    location: [ArgumentLocation]
    source: CreateArgumentSourceInput!
    sourceEffect: CreateArgumentSourceEffectInput
    sourceTitle: String
    generatedByAi: Boolean
    aiProposal: String
    sentiment: ArgumentSentiment!
    discussionPoint: Boolean!
    order: Int!
    # When this argument is the conversion of a project-level AI draft, the draft's
    # id. The resolver marks that draft converted (it stays for AI-dashboard tracking
    # but drops off the to-do list) instead of relying on a fragile sourceEffect-key match.
    fromDraftEffectId: ID
  }

  input UpdateArgumentInput {
    title: NonEmptyString
    order: Int
    explanation: NonEmptyString
    importance: ArgumentImportance
    timeFrame: [ArgumentTimeFrame]
    location: [ArgumentLocation]
    source: CreateArgumentSourceInput
    generatedByAi: Boolean
    aiProposal: String
    sentiment: ArgumentSentiment
    discussionPoint: Boolean
  }

  input CreateArgumentSourceInput {
    type: ArgumentSourceType!
    link: String
  }

  input CreateArgumentSourceEffectInput {
    sourceKind: ArgumentSourceEffectKind!
    sourceId: NonEmptyString!
    effectId: NonEmptyString!
    themeSlug: String
    page: Int
    text: String
  }

  input ReorderArgumentInput {
    id: ID!
    order: Int!
  }

  type Mutation {
    createArgument(
      projectId: ID!
      themeSlug: String!
      input: CreateArgumentInput!
    ): Argument!
    updateArgument(id: ID!, input: UpdateArgumentInput!): Argument!
    moveArgumentToTheme(projectId: ID!, argumentId: ID!, themeSlug: String!): Argument!
    reorderArguments(input: [ReorderArgumentInput!]!): [Argument!]!
    deleteArguments(projectId: ID!, argumentIds: [ID!]!): Boolean!
  }
`;
