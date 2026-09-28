import gql from 'graphql-tag';

export const projectTypeDefs = gql`
  type Project {
    id: ID!
    slug: String!
    name: String!
    description: String!
    reason: [ProjectReason!]!
    reasonOther: String
    scanGoal: String
    impactSituation: String
    impactMotivation: String
    scope: String
    additionalContext: String
    status: ProjectStatus!
    template: ProjectTemplate!
    createdBy: User
    themes: [Theme]
    users: [ProjectUser]
    shareLink: String
    keyMessage: String
    coverText: String
    aiAnalyses: [ProjectAiAnalysis!]!
    uploadedDocuments: [ProjectUploadedDocument!]!
    aiDraftEffects: [ProjectAiDraftEffect!]!
    createdAt: DateTime!
    updatedAt: DateTime!
    permissibleActions: [String!]!
    previewData: [[String!]]
  }

  type ProjectAiAnalysis {
    searchQuestion: String
    status: ProjectAiAnalysisStatus!
    generatedQuestion: String
    inputSummary: String
    methodExplanation: String
    errorMessage: String
    startedAt: DateTime
    completedAt: DateTime
    progress: ProjectAiAnalysisProgress
    experts: [ProjectAiExpert!]!
    sources: [ProjectAiSource!]!
    talkingPoints: [ProjectAiTalkingPoint!]!
    themes: [ProjectAiTheme!]!
  }

  type ProjectAiAnalysisProgress {
    phases: [ProjectAiAnalysisProgressPhase!]!
  }

  type ProjectAiAnalysisProgressPhase {
    key: String!
    status: String!
  }

  type ProjectAiExpert {
    externalId: String
    name: String
    organisation: String
    description: String
    score: Float
    sourceIds: [String!]!
    metadata: JSON
  }

  type ProjectAiSource {
    externalId: String
    title: String
    content: String
    url: String
    score: Float
    sourceType: String
    publishedAt: DateTime
    metadata: JSON
  }

  type ProjectAiTalkingPoint {
    topic: String
    description: String
    themes: [String!]!
    supportingSourceIds: [String!]!
  }

  type ProjectAiTheme {
    slug: String
    name: String
    relevance: Float
    rationale: String
    talkingPointIds: [String!]!
  }

  type OpenResearchSource {
    id: ID!
    docId: String
    title: String
    content: String
    url: String
    score: Float
    sourceType: String
    publishedAt: DateTime
    category: String
    metadata: JSON
  }

  type SourceEffect {
    text: String!
    page: Int
  }

  type ProjectUploadedDocument {
    id: ID!
    themeSlug: String!
    fileName: String!
    mimeType: String
    size: Int!
    name: String!
    description: String
    keyword: String
    blobPath: String!
    analysisStatus: String!
    analysisError: String
    aiTitle: String
    aiDescription: String
    aiStatements: [ProjectUploadedDocumentStatement!]!
    uploadedAt: DateTime!
    uploadedBy: ID
  }

  type ProjectUploadedDocumentStatement {
    text: String!
    docId: String
    title: String
    url: String
    author: String
    page: Int
    score: Float
    source: String!
  }

  type ProjectAiDraftEffect {
    id: ID!
    title: String!
    explanation: String!
    sentiment: ArgumentSentiment!
    discussionPoint: Boolean!
    timeFrame: [ArgumentTimeFrame!]!
    location: [ArgumentLocation!]!
    source: ArgumentSource!
    sourceTitle: String
    sourceEffect: ArgumentSourceEffect!
    generatedByAi: Boolean!
    aiProposal: String
    importance: ArgumentImportance!
    # Set once this draft has been converted into a real effect (argument). The draft
    # is kept for AI-dashboard tracking; this id lets the to-do list hide it reliably.
    convertedArgumentId: ID
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type ProjectUser {
    user: User!
    role: UserProjectRole!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  input CreateProjectInput {
    name: NonEmptyString!
    description: NonEmptyString!
    reason: [ProjectReason!]
    reasonOther: String
    scanGoal: NonEmptyString
    impactSituation: NonEmptyString
    impactMotivation: NonEmptyString
    scope: String
    additionalContext: String
    status: String = "DRAFT"
    template: ProjectTemplate = V1_1
    keyMessage: String
    coverText: String
    completeIntake: Boolean
  }

  input UpdateProjectInput {
    name: String
    description: String
    reason: [ProjectReason!]
    reasonOther: String
    scanGoal: String
    impactSituation: String
    impactMotivation: String
    scope: String
    additionalContext: String
    status: String
    keyMessage: String
    coverText: String
    completeIntake: Boolean
  }

  input UploadProjectDocumentInput {
    themeSlug: String!
    fileName: NonEmptyString!
    mimeType: String
    size: Int!
    contentBase64: NonEmptyString!
    name: NonEmptyString!
    description: String
    keyword: String
  }

  input CreateProjectAiDraftEffectInput {
    title: NonEmptyString!
    explanation: NonEmptyString!
    sentiment: ArgumentSentiment!
    discussionPoint: Boolean!
    timeFrame: [ArgumentTimeFrame]
    location: [ArgumentLocation]
    source: CreateArgumentSourceInput!
    sourceTitle: String
    sourceEffect: CreateArgumentSourceEffectInput!
    generatedByAi: Boolean
    aiProposal: String
    importance: ArgumentImportance!
  }

  enum ProjectStatus {
    DRAFT
    PUBLISHED
    ARCHIVED
 }

  enum ProjectTemplate {
    DEFAULT
    V1_1
  }

  enum ProjectReason {
    COUNCIL_LETTER
    NEW_POLICY
    PROJECT_PROPOSAL
    OTHER
  }

  enum UserProjectRole {
    OWNER
    REVIEWER
  }

  enum ProjectAiAnalysisStatus {
    NOT_STARTED
    RUNNING
    COMPLETED
    FAILED
  }

  type Query {
    project(slug: String!): Project
    projectAiAnalysis(projectId: ID!): ProjectAiAnalysis!
    openResearchSource(id: ID!): OpenResearchSource
    openResearchSourceEffects(projectId: ID!, sourceId: ID!, themeSlug: String): [SourceEffect!]!
    projects: [Project!]!
  }

  type Mutation {
    createProject(input: CreateProjectInput!): Project!
    startProjectAiAnalysis(projectId: ID!, searchQuestion: String): ProjectAiAnalysis!
    generateProjectKeyMessage(projectId: ID!): String!
    uploadProjectDocument(projectId: ID!, input: UploadProjectDocumentInput!): ProjectUploadedDocument!
    deleteProjectUploadedDocument(projectId: ID!, documentId: ID!): Boolean!
    createProjectAiDraftEffects(projectId: ID!, input: [CreateProjectAiDraftEffectInput!]!): [ProjectAiDraftEffect!]!
    deleteProjectAiDraftEffect(projectId: ID!, draftEffectId: ID!): Boolean!
    updateProject(id: ID!, input: UpdateProjectInput!): Project!
    deleteProject(id: ID!): Boolean!
    duplicateProject(id: ID!): Project!
    useShareLink(shareLink: String!): Project
    setupDemo: Project!
  }
`;
