import gql from 'graphql-tag';

export const commentTypeDefs = gql`
  type Anchor {
    type: String!
    themeId: ID
    argumentId: ID
    effectIndex: Int
    relativePosition: Position
  }

  type Position {
    x: Float!
    y: Float!
  }

  type Comment {
    id: ID!
    author: User!
    body: String!
    replies: [Reply!]!
    resolved: Boolean!
    canResolve: Boolean!
    hasUnread: Boolean!
    unreadReplyCount: Int!
    page: String
    locationData: JSON
    anchor: Anchor
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Reply {
    id: ID!
    author: User!
    body: String!
    resolved: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input PositionInput {
    x: Float!
    y: Float!
  }

  input AnchorInput {
    type: String!
    themeId: ID
    argumentId: ID
    effectIndex: Int
    relativePosition: PositionInput
  }

  input CreateCommentInput {
    projectId: ID!
    body: String!
    page: String
    locationData: JSON
    anchor: AnchorInput
  }

  input UpdateCommentInput {
    body: String
  }

  input CreateReplyInput {
    commentId: ID!
    body: String!
  }

  input UpdateReplyInput {
    body: String
  }

  type Query {
    comments(projectSlug: ID!): [Comment!]!
  }

  type Mutation {
    createComment(input: CreateCommentInput!): Comment!
    updateComment(id: ID!, input: UpdateCommentInput!): Comment!
    deleteComment(id: ID!): Boolean!

    addReply(input: CreateReplyInput!): Reply!
    updateReply(commentId: ID!, replyId: ID!, input: UpdateReplyInput!): Reply!
    deleteReply(commentId: ID!, replyId: ID!): Boolean!

    markCommentResolved(id: ID!): Comment!

    markCommentsRead(commentIds: [ID!]!): Boolean!
    markAllProjectCommentsRead(projectSlug: ID!): Boolean!
  }
`;
