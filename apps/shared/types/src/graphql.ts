import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
import { AppContext } from './context';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  DateTime: { input: unknown; output: unknown; }
  JSON: { input: unknown; output: unknown; }
  /** A string that cannot be empty or contain only whitespace */
  NonEmptyString: { input: unknown; output: unknown; }
};

export type Anchor = {
  __typename?: 'Anchor';
  argumentId?: Maybe<Scalars['ID']['output']>;
  effectIndex?: Maybe<Scalars['Int']['output']>;
  relativePosition?: Maybe<Position>;
  themeId?: Maybe<Scalars['ID']['output']>;
  type: Scalars['String']['output'];
};

export type AnchorInput = {
  argumentId?: InputMaybe<Scalars['ID']['input']>;
  effectIndex?: InputMaybe<Scalars['Int']['input']>;
  relativePosition?: InputMaybe<PositionInput>;
  themeId?: InputMaybe<Scalars['ID']['input']>;
  type: Scalars['String']['input'];
};

export type Argument = {
  __typename?: 'Argument';
  aiProposal?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  discussionPoint: Scalars['Boolean']['output'];
  explanation: Scalars['String']['output'];
  generatedByAi?: Maybe<Scalars['Boolean']['output']>;
  id: Scalars['ID']['output'];
  importance: ArgumentImportance;
  location: Array<ArgumentLocation>;
  order: Scalars['Int']['output'];
  sentiment: ArgumentSentiment;
  source: ArgumentSource;
  sourceEffect?: Maybe<ArgumentSourceEffect>;
  sourceTitle?: Maybe<Scalars['String']['output']>;
  theme?: Maybe<Theme>;
  timeFrame: Array<ArgumentTimeFrame>;
  title: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export enum ArgumentImportance {
  High = 'HIGH',
  Low = 'LOW',
  Medium = 'MEDIUM'
}

export enum ArgumentLocation {
  City = 'CITY',
  CityDistrict = 'CITY_DISTRICT',
  InsideEu = 'INSIDE_EU',
  Neighborhood = 'NEIGHBORHOOD',
  OutsideEu = 'OUTSIDE_EU',
  Province = 'PROVINCE',
  Street = 'STREET'
}

export enum ArgumentSentiment {
  Negative = 'NEGATIVE',
  Neutral = 'NEUTRAL',
  Positive = 'POSITIVE'
}

export type ArgumentSource = {
  __typename?: 'ArgumentSource';
  link?: Maybe<Scalars['String']['output']>;
  type: ArgumentSourceType;
};

export type ArgumentSourceEffect = {
  __typename?: 'ArgumentSourceEffect';
  effectId: Scalars['String']['output'];
  key: Scalars['String']['output'];
  page?: Maybe<Scalars['Int']['output']>;
  sourceId: Scalars['String']['output'];
  sourceKind: ArgumentSourceEffectKind;
  text?: Maybe<Scalars['String']['output']>;
  themeSlug?: Maybe<Scalars['String']['output']>;
};

export enum ArgumentSourceEffectKind {
  OpenResearch = 'OPEN_RESEARCH',
  UploadedDocument = 'UPLOADED_DOCUMENT'
}

export enum ArgumentSourceType {
  Data = 'DATA',
  Expert = 'EXPERT',
  Link = 'LINK',
  Policy = 'POLICY',
  Resident = 'RESIDENT'
}

export enum ArgumentTimeFrame {
  FiveToTenY = 'FIVE_TO_TEN_Y',
  FortyPlusY = 'FORTY_PLUS_Y',
  Now = 'NOW',
  OneToFiveY = 'ONE_TO_FIVE_Y',
  TenToTwentyY = 'TEN_TO_TWENTY_Y',
  TwentyToFortyY = 'TWENTY_TO_FORTY_Y'
}

export type Comment = {
  __typename?: 'Comment';
  anchor?: Maybe<Anchor>;
  author: User;
  body: Scalars['String']['output'];
  canResolve: Scalars['Boolean']['output'];
  createdAt: Scalars['DateTime']['output'];
  hasUnread: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  locationData?: Maybe<Scalars['JSON']['output']>;
  page?: Maybe<Scalars['String']['output']>;
  replies: Array<Reply>;
  resolved: Scalars['Boolean']['output'];
  unreadReplyCount: Scalars['Int']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type CreateArgumentInput = {
  aiProposal?: InputMaybe<Scalars['String']['input']>;
  discussionPoint: Scalars['Boolean']['input'];
  explanation: Scalars['NonEmptyString']['input'];
  fromDraftEffectId?: InputMaybe<Scalars['ID']['input']>;
  generatedByAi?: InputMaybe<Scalars['Boolean']['input']>;
  importance: ArgumentImportance;
  location?: InputMaybe<Array<InputMaybe<ArgumentLocation>>>;
  order: Scalars['Int']['input'];
  sentiment: ArgumentSentiment;
  source: CreateArgumentSourceInput;
  sourceEffect?: InputMaybe<CreateArgumentSourceEffectInput>;
  sourceTitle?: InputMaybe<Scalars['String']['input']>;
  timeFrame?: InputMaybe<Array<InputMaybe<ArgumentTimeFrame>>>;
  title: Scalars['NonEmptyString']['input'];
};

export type CreateArgumentSourceEffectInput = {
  effectId: Scalars['NonEmptyString']['input'];
  page?: InputMaybe<Scalars['Int']['input']>;
  sourceId: Scalars['NonEmptyString']['input'];
  sourceKind: ArgumentSourceEffectKind;
  text?: InputMaybe<Scalars['String']['input']>;
  themeSlug?: InputMaybe<Scalars['String']['input']>;
};

export type CreateArgumentSourceInput = {
  link?: InputMaybe<Scalars['String']['input']>;
  type: ArgumentSourceType;
};

export type CreateCommentInput = {
  anchor?: InputMaybe<AnchorInput>;
  body: Scalars['String']['input'];
  locationData?: InputMaybe<Scalars['JSON']['input']>;
  page?: InputMaybe<Scalars['String']['input']>;
  projectId: Scalars['ID']['input'];
};

export type CreateProjectAiDraftEffectInput = {
  aiProposal?: InputMaybe<Scalars['String']['input']>;
  discussionPoint: Scalars['Boolean']['input'];
  explanation: Scalars['NonEmptyString']['input'];
  generatedByAi?: InputMaybe<Scalars['Boolean']['input']>;
  importance: ArgumentImportance;
  location?: InputMaybe<Array<InputMaybe<ArgumentLocation>>>;
  sentiment: ArgumentSentiment;
  source: CreateArgumentSourceInput;
  sourceEffect: CreateArgumentSourceEffectInput;
  sourceTitle?: InputMaybe<Scalars['String']['input']>;
  timeFrame?: InputMaybe<Array<InputMaybe<ArgumentTimeFrame>>>;
  title: Scalars['NonEmptyString']['input'];
};

export type CreateProjectInput = {
  additionalContext?: InputMaybe<Scalars['String']['input']>;
  completeIntake?: InputMaybe<Scalars['Boolean']['input']>;
  coverText?: InputMaybe<Scalars['String']['input']>;
  description: Scalars['NonEmptyString']['input'];
  impactMotivation?: InputMaybe<Scalars['NonEmptyString']['input']>;
  impactSituation?: InputMaybe<Scalars['NonEmptyString']['input']>;
  keyMessage?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['NonEmptyString']['input'];
  reason?: InputMaybe<Array<ProjectReason>>;
  reasonOther?: InputMaybe<Scalars['String']['input']>;
  scanGoal?: InputMaybe<Scalars['NonEmptyString']['input']>;
  scope?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
  template?: InputMaybe<ProjectTemplate>;
};

export type CreateReplyInput = {
  body: Scalars['String']['input'];
  commentId: Scalars['ID']['input'];
};

export type Mutation = {
  __typename?: 'Mutation';
  addReply: Reply;
  createArgument: Argument;
  createComment: Comment;
  createProject: Project;
  createProjectAiDraftEffects: Array<ProjectAiDraftEffect>;
  deleteArguments: Scalars['Boolean']['output'];
  deleteComment: Scalars['Boolean']['output'];
  deleteProject: Scalars['Boolean']['output'];
  deleteProjectAiDraftEffect: Scalars['Boolean']['output'];
  deleteProjectUploadedDocument: Scalars['Boolean']['output'];
  deleteReply: Scalars['Boolean']['output'];
  duplicateProject: Project;
  generateProjectKeyMessage: Scalars['String']['output'];
  markAllProjectCommentsRead: Scalars['Boolean']['output'];
  markCommentResolved: Comment;
  markCommentsRead: Scalars['Boolean']['output'];
  moveArgumentToTheme: Argument;
  reorderArguments: Array<Argument>;
  setupDemo: Project;
  startProjectAiAnalysis: ProjectAiAnalysis;
  updateArgument: Argument;
  updateComment: Comment;
  updateProject: Project;
  updateReply: Reply;
  uploadProjectDocument: ProjectUploadedDocument;
  useShareLink?: Maybe<Project>;
};


export type MutationAddReplyArgs = {
  input: CreateReplyInput;
};


export type MutationCreateArgumentArgs = {
  input: CreateArgumentInput;
  projectId: Scalars['ID']['input'];
  themeSlug: Scalars['String']['input'];
};


export type MutationCreateCommentArgs = {
  input: CreateCommentInput;
};


export type MutationCreateProjectArgs = {
  input: CreateProjectInput;
};


export type MutationCreateProjectAiDraftEffectsArgs = {
  input: Array<CreateProjectAiDraftEffectInput>;
  projectId: Scalars['ID']['input'];
};


export type MutationDeleteArgumentsArgs = {
  argumentIds: Array<Scalars['ID']['input']>;
  projectId: Scalars['ID']['input'];
};


export type MutationDeleteCommentArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteProjectArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteProjectAiDraftEffectArgs = {
  draftEffectId: Scalars['ID']['input'];
  projectId: Scalars['ID']['input'];
};


export type MutationDeleteProjectUploadedDocumentArgs = {
  documentId: Scalars['ID']['input'];
  projectId: Scalars['ID']['input'];
};


export type MutationDeleteReplyArgs = {
  commentId: Scalars['ID']['input'];
  replyId: Scalars['ID']['input'];
};


export type MutationDuplicateProjectArgs = {
  id: Scalars['ID']['input'];
};


export type MutationGenerateProjectKeyMessageArgs = {
  projectId: Scalars['ID']['input'];
};


export type MutationMarkAllProjectCommentsReadArgs = {
  projectSlug: Scalars['ID']['input'];
};


export type MutationMarkCommentResolvedArgs = {
  id: Scalars['ID']['input'];
};


export type MutationMarkCommentsReadArgs = {
  commentIds: Array<Scalars['ID']['input']>;
};


export type MutationMoveArgumentToThemeArgs = {
  argumentId: Scalars['ID']['input'];
  projectId: Scalars['ID']['input'];
  themeSlug: Scalars['String']['input'];
};


export type MutationReorderArgumentsArgs = {
  input: Array<ReorderArgumentInput>;
};


export type MutationStartProjectAiAnalysisArgs = {
  projectId: Scalars['ID']['input'];
  searchQuestion?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateArgumentArgs = {
  id: Scalars['ID']['input'];
  input: UpdateArgumentInput;
};


export type MutationUpdateCommentArgs = {
  id: Scalars['ID']['input'];
  input: UpdateCommentInput;
};


export type MutationUpdateProjectArgs = {
  id: Scalars['ID']['input'];
  input: UpdateProjectInput;
};


export type MutationUpdateReplyArgs = {
  commentId: Scalars['ID']['input'];
  input: UpdateReplyInput;
  replyId: Scalars['ID']['input'];
};


export type MutationUploadProjectDocumentArgs = {
  input: UploadProjectDocumentInput;
  projectId: Scalars['ID']['input'];
};


export type MutationUseShareLinkArgs = {
  shareLink: Scalars['String']['input'];
};

export type OpenResearchSource = {
  __typename?: 'OpenResearchSource';
  category?: Maybe<Scalars['String']['output']>;
  content?: Maybe<Scalars['String']['output']>;
  docId?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  metadata?: Maybe<Scalars['JSON']['output']>;
  publishedAt?: Maybe<Scalars['DateTime']['output']>;
  score?: Maybe<Scalars['Float']['output']>;
  sourceType?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export type Position = {
  __typename?: 'Position';
  x: Scalars['Float']['output'];
  y: Scalars['Float']['output'];
};

export type PositionInput = {
  x: Scalars['Float']['input'];
  y: Scalars['Float']['input'];
};

export type Project = {
  __typename?: 'Project';
  additionalContext?: Maybe<Scalars['String']['output']>;
  aiAnalyses: Array<ProjectAiAnalysis>;
  aiDraftEffects: Array<ProjectAiDraftEffect>;
  coverText?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['DateTime']['output'];
  createdBy?: Maybe<User>;
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  impactMotivation?: Maybe<Scalars['String']['output']>;
  impactSituation?: Maybe<Scalars['String']['output']>;
  keyMessage?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  permissibleActions: Array<Scalars['String']['output']>;
  previewData?: Maybe<Array<Maybe<Array<Scalars['String']['output']>>>>;
  reason: Array<ProjectReason>;
  reasonOther?: Maybe<Scalars['String']['output']>;
  scanGoal?: Maybe<Scalars['String']['output']>;
  scope?: Maybe<Scalars['String']['output']>;
  shareLink?: Maybe<Scalars['String']['output']>;
  slug: Scalars['String']['output'];
  status: ProjectStatus;
  template: ProjectTemplate;
  themes?: Maybe<Array<Maybe<Theme>>>;
  updatedAt: Scalars['DateTime']['output'];
  uploadedDocuments: Array<ProjectUploadedDocument>;
  users?: Maybe<Array<Maybe<ProjectUser>>>;
};

export type ProjectAiAnalysis = {
  __typename?: 'ProjectAiAnalysis';
  completedAt?: Maybe<Scalars['DateTime']['output']>;
  errorMessage?: Maybe<Scalars['String']['output']>;
  experts: Array<ProjectAiExpert>;
  generatedQuestion?: Maybe<Scalars['String']['output']>;
  inputSummary?: Maybe<Scalars['String']['output']>;
  methodExplanation?: Maybe<Scalars['String']['output']>;
  progress?: Maybe<ProjectAiAnalysisProgress>;
  searchQuestion?: Maybe<Scalars['String']['output']>;
  sources: Array<ProjectAiSource>;
  startedAt?: Maybe<Scalars['DateTime']['output']>;
  status: ProjectAiAnalysisStatus;
  talkingPoints: Array<ProjectAiTalkingPoint>;
  themes: Array<ProjectAiTheme>;
};

export type ProjectAiAnalysisProgress = {
  __typename?: 'ProjectAiAnalysisProgress';
  phases: Array<ProjectAiAnalysisProgressPhase>;
};

export type ProjectAiAnalysisProgressPhase = {
  __typename?: 'ProjectAiAnalysisProgressPhase';
  key: Scalars['String']['output'];
  status: Scalars['String']['output'];
};

export enum ProjectAiAnalysisStatus {
  Completed = 'COMPLETED',
  Failed = 'FAILED',
  NotStarted = 'NOT_STARTED',
  Running = 'RUNNING'
}

export type ProjectAiDraftEffect = {
  __typename?: 'ProjectAiDraftEffect';
  aiProposal?: Maybe<Scalars['String']['output']>;
  convertedArgumentId?: Maybe<Scalars['ID']['output']>;
  createdAt: Scalars['DateTime']['output'];
  discussionPoint: Scalars['Boolean']['output'];
  explanation: Scalars['String']['output'];
  generatedByAi: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  importance: ArgumentImportance;
  location: Array<ArgumentLocation>;
  sentiment: ArgumentSentiment;
  source: ArgumentSource;
  sourceEffect: ArgumentSourceEffect;
  sourceTitle?: Maybe<Scalars['String']['output']>;
  timeFrame: Array<ArgumentTimeFrame>;
  title: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type ProjectAiExpert = {
  __typename?: 'ProjectAiExpert';
  description?: Maybe<Scalars['String']['output']>;
  externalId?: Maybe<Scalars['String']['output']>;
  metadata?: Maybe<Scalars['JSON']['output']>;
  name?: Maybe<Scalars['String']['output']>;
  organisation?: Maybe<Scalars['String']['output']>;
  score?: Maybe<Scalars['Float']['output']>;
  sourceIds: Array<Scalars['String']['output']>;
};

export type ProjectAiSource = {
  __typename?: 'ProjectAiSource';
  content?: Maybe<Scalars['String']['output']>;
  externalId?: Maybe<Scalars['String']['output']>;
  metadata?: Maybe<Scalars['JSON']['output']>;
  publishedAt?: Maybe<Scalars['DateTime']['output']>;
  score?: Maybe<Scalars['Float']['output']>;
  sourceType?: Maybe<Scalars['String']['output']>;
  title?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export type ProjectAiTalkingPoint = {
  __typename?: 'ProjectAiTalkingPoint';
  description?: Maybe<Scalars['String']['output']>;
  supportingSourceIds: Array<Scalars['String']['output']>;
  themes: Array<Scalars['String']['output']>;
  topic?: Maybe<Scalars['String']['output']>;
};

export type ProjectAiTheme = {
  __typename?: 'ProjectAiTheme';
  name?: Maybe<Scalars['String']['output']>;
  rationale?: Maybe<Scalars['String']['output']>;
  relevance?: Maybe<Scalars['Float']['output']>;
  slug?: Maybe<Scalars['String']['output']>;
  talkingPointIds: Array<Scalars['String']['output']>;
};

export enum ProjectReason {
  CouncilLetter = 'COUNCIL_LETTER',
  NewPolicy = 'NEW_POLICY',
  Other = 'OTHER',
  ProjectProposal = 'PROJECT_PROPOSAL'
}

export enum ProjectStatus {
  Archived = 'ARCHIVED',
  Draft = 'DRAFT',
  Published = 'PUBLISHED'
}

export enum ProjectTemplate {
  Default = 'DEFAULT',
  V1_1 = 'V1_1'
}

export type ProjectUploadedDocument = {
  __typename?: 'ProjectUploadedDocument';
  aiDescription?: Maybe<Scalars['String']['output']>;
  aiStatements: Array<ProjectUploadedDocumentStatement>;
  aiTitle?: Maybe<Scalars['String']['output']>;
  analysisError?: Maybe<Scalars['String']['output']>;
  analysisStatus: Scalars['String']['output'];
  blobPath: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  fileName: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  keyword?: Maybe<Scalars['String']['output']>;
  mimeType?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  size: Scalars['Int']['output'];
  themeSlug: Scalars['String']['output'];
  uploadedAt: Scalars['DateTime']['output'];
  uploadedBy?: Maybe<Scalars['ID']['output']>;
};

export type ProjectUploadedDocumentStatement = {
  __typename?: 'ProjectUploadedDocumentStatement';
  author?: Maybe<Scalars['String']['output']>;
  docId?: Maybe<Scalars['String']['output']>;
  page?: Maybe<Scalars['Int']['output']>;
  score?: Maybe<Scalars['Float']['output']>;
  source: Scalars['String']['output'];
  text: Scalars['String']['output'];
  title?: Maybe<Scalars['String']['output']>;
  url?: Maybe<Scalars['String']['output']>;
};

export type ProjectUser = {
  __typename?: 'ProjectUser';
  createdAt: Scalars['DateTime']['output'];
  role: UserProjectRole;
  updatedAt: Scalars['DateTime']['output'];
  user: User;
};

export type Query = {
  __typename?: 'Query';
  argument?: Maybe<Argument>;
  arguments: Array<Argument>;
  comments: Array<Comment>;
  me?: Maybe<User>;
  openResearchSource?: Maybe<OpenResearchSource>;
  openResearchSourceEffects: Array<SourceEffect>;
  project?: Maybe<Project>;
  projectAiAnalysis: ProjectAiAnalysis;
  projects: Array<Project>;
  theme?: Maybe<Theme>;
  themes: Array<Theme>;
};


export type QueryArgumentArgs = {
  id: Scalars['ID']['input'];
};


export type QueryCommentsArgs = {
  projectSlug: Scalars['ID']['input'];
};


export type QueryOpenResearchSourceArgs = {
  id: Scalars['ID']['input'];
};


export type QueryOpenResearchSourceEffectsArgs = {
  projectId: Scalars['ID']['input'];
  sourceId: Scalars['ID']['input'];
  themeSlug?: InputMaybe<Scalars['String']['input']>;
};


export type QueryProjectArgs = {
  slug: Scalars['String']['input'];
};


export type QueryProjectAiAnalysisArgs = {
  projectId: Scalars['ID']['input'];
};


export type QueryThemeArgs = {
  id: Scalars['ID']['input'];
};

export type ReorderArgumentInput = {
  id: Scalars['ID']['input'];
  order: Scalars['Int']['input'];
};

export type Reply = {
  __typename?: 'Reply';
  author: User;
  body: Scalars['String']['output'];
  createdAt: Scalars['DateTime']['output'];
  id: Scalars['ID']['output'];
  resolved: Scalars['Boolean']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type SourceEffect = {
  __typename?: 'SourceEffect';
  page?: Maybe<Scalars['Int']['output']>;
  text: Scalars['String']['output'];
};

export type Theme = {
  __typename?: 'Theme';
  arguments?: Maybe<Array<Maybe<Argument>>>;
  createdAt: Scalars['DateTime']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isActive: Scalars['Boolean']['output'];
  name: Scalars['String']['output'];
  projectSlug: Scalars['String']['output'];
  slug: Scalars['String']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export type UpdateArgumentInput = {
  aiProposal?: InputMaybe<Scalars['String']['input']>;
  discussionPoint?: InputMaybe<Scalars['Boolean']['input']>;
  explanation?: InputMaybe<Scalars['NonEmptyString']['input']>;
  generatedByAi?: InputMaybe<Scalars['Boolean']['input']>;
  importance?: InputMaybe<ArgumentImportance>;
  location?: InputMaybe<Array<InputMaybe<ArgumentLocation>>>;
  order?: InputMaybe<Scalars['Int']['input']>;
  sentiment?: InputMaybe<ArgumentSentiment>;
  source?: InputMaybe<CreateArgumentSourceInput>;
  timeFrame?: InputMaybe<Array<InputMaybe<ArgumentTimeFrame>>>;
  title?: InputMaybe<Scalars['NonEmptyString']['input']>;
};

export type UpdateCommentInput = {
  body?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateProjectInput = {
  additionalContext?: InputMaybe<Scalars['String']['input']>;
  completeIntake?: InputMaybe<Scalars['Boolean']['input']>;
  coverText?: InputMaybe<Scalars['String']['input']>;
  description?: InputMaybe<Scalars['String']['input']>;
  impactMotivation?: InputMaybe<Scalars['String']['input']>;
  impactSituation?: InputMaybe<Scalars['String']['input']>;
  keyMessage?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  reason?: InputMaybe<Array<ProjectReason>>;
  reasonOther?: InputMaybe<Scalars['String']['input']>;
  scanGoal?: InputMaybe<Scalars['String']['input']>;
  scope?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateReplyInput = {
  body?: InputMaybe<Scalars['String']['input']>;
};

export type UploadProjectDocumentInput = {
  contentBase64: Scalars['NonEmptyString']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
  fileName: Scalars['NonEmptyString']['input'];
  keyword?: InputMaybe<Scalars['String']['input']>;
  mimeType?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['NonEmptyString']['input'];
  size: Scalars['Int']['input'];
  themeSlug: Scalars['String']['input'];
};

export type User = {
  __typename?: 'User';
  createdAt: Scalars['DateTime']['output'];
  displayName: Scalars['String']['output'];
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  updatedAt: Scalars['DateTime']['output'];
};

export enum UserProjectRole {
  Owner = 'OWNER',
  Reviewer = 'REVIEWER'
}



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;





/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Anchor: ResolverTypeWrapper<Anchor>;
  AnchorInput: AnchorInput;
  Argument: ResolverTypeWrapper<Argument>;
  ArgumentImportance: ArgumentImportance;
  ArgumentLocation: ArgumentLocation;
  ArgumentSentiment: ArgumentSentiment;
  ArgumentSource: ResolverTypeWrapper<ArgumentSource>;
  ArgumentSourceEffect: ResolverTypeWrapper<ArgumentSourceEffect>;
  ArgumentSourceEffectKind: ArgumentSourceEffectKind;
  ArgumentSourceType: ArgumentSourceType;
  ArgumentTimeFrame: ArgumentTimeFrame;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Comment: ResolverTypeWrapper<Comment>;
  CreateArgumentInput: CreateArgumentInput;
  CreateArgumentSourceEffectInput: CreateArgumentSourceEffectInput;
  CreateArgumentSourceInput: CreateArgumentSourceInput;
  CreateCommentInput: CreateCommentInput;
  CreateProjectAiDraftEffectInput: CreateProjectAiDraftEffectInput;
  CreateProjectInput: CreateProjectInput;
  CreateReplyInput: CreateReplyInput;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>;
  NonEmptyString: ResolverTypeWrapper<Scalars['NonEmptyString']['output']>;
  OpenResearchSource: ResolverTypeWrapper<OpenResearchSource>;
  Position: ResolverTypeWrapper<Position>;
  PositionInput: PositionInput;
  Project: ResolverTypeWrapper<Project>;
  ProjectAiAnalysis: ResolverTypeWrapper<ProjectAiAnalysis>;
  ProjectAiAnalysisProgress: ResolverTypeWrapper<ProjectAiAnalysisProgress>;
  ProjectAiAnalysisProgressPhase: ResolverTypeWrapper<ProjectAiAnalysisProgressPhase>;
  ProjectAiAnalysisStatus: ProjectAiAnalysisStatus;
  ProjectAiDraftEffect: ResolverTypeWrapper<ProjectAiDraftEffect>;
  ProjectAiExpert: ResolverTypeWrapper<ProjectAiExpert>;
  ProjectAiSource: ResolverTypeWrapper<ProjectAiSource>;
  ProjectAiTalkingPoint: ResolverTypeWrapper<ProjectAiTalkingPoint>;
  ProjectAiTheme: ResolverTypeWrapper<ProjectAiTheme>;
  ProjectReason: ProjectReason;
  ProjectStatus: ProjectStatus;
  ProjectTemplate: ProjectTemplate;
  ProjectUploadedDocument: ResolverTypeWrapper<ProjectUploadedDocument>;
  ProjectUploadedDocumentStatement: ResolverTypeWrapper<ProjectUploadedDocumentStatement>;
  ProjectUser: ResolverTypeWrapper<ProjectUser>;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  ReorderArgumentInput: ReorderArgumentInput;
  Reply: ResolverTypeWrapper<Reply>;
  SourceEffect: ResolverTypeWrapper<SourceEffect>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Theme: ResolverTypeWrapper<Theme>;
  UpdateArgumentInput: UpdateArgumentInput;
  UpdateCommentInput: UpdateCommentInput;
  UpdateProjectInput: UpdateProjectInput;
  UpdateReplyInput: UpdateReplyInput;
  UploadProjectDocumentInput: UploadProjectDocumentInput;
  User: ResolverTypeWrapper<User>;
  UserProjectRole: UserProjectRole;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Anchor: Anchor;
  AnchorInput: AnchorInput;
  Argument: Argument;
  ArgumentSource: ArgumentSource;
  ArgumentSourceEffect: ArgumentSourceEffect;
  Boolean: Scalars['Boolean']['output'];
  Comment: Comment;
  CreateArgumentInput: CreateArgumentInput;
  CreateArgumentSourceEffectInput: CreateArgumentSourceEffectInput;
  CreateArgumentSourceInput: CreateArgumentSourceInput;
  CreateCommentInput: CreateCommentInput;
  CreateProjectAiDraftEffectInput: CreateProjectAiDraftEffectInput;
  CreateProjectInput: CreateProjectInput;
  CreateReplyInput: CreateReplyInput;
  DateTime: Scalars['DateTime']['output'];
  Float: Scalars['Float']['output'];
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  JSON: Scalars['JSON']['output'];
  Mutation: Record<PropertyKey, never>;
  NonEmptyString: Scalars['NonEmptyString']['output'];
  OpenResearchSource: OpenResearchSource;
  Position: Position;
  PositionInput: PositionInput;
  Project: Project;
  ProjectAiAnalysis: ProjectAiAnalysis;
  ProjectAiAnalysisProgress: ProjectAiAnalysisProgress;
  ProjectAiAnalysisProgressPhase: ProjectAiAnalysisProgressPhase;
  ProjectAiDraftEffect: ProjectAiDraftEffect;
  ProjectAiExpert: ProjectAiExpert;
  ProjectAiSource: ProjectAiSource;
  ProjectAiTalkingPoint: ProjectAiTalkingPoint;
  ProjectAiTheme: ProjectAiTheme;
  ProjectUploadedDocument: ProjectUploadedDocument;
  ProjectUploadedDocumentStatement: ProjectUploadedDocumentStatement;
  ProjectUser: ProjectUser;
  Query: Record<PropertyKey, never>;
  ReorderArgumentInput: ReorderArgumentInput;
  Reply: Reply;
  SourceEffect: SourceEffect;
  String: Scalars['String']['output'];
  Theme: Theme;
  UpdateArgumentInput: UpdateArgumentInput;
  UpdateCommentInput: UpdateCommentInput;
  UpdateProjectInput: UpdateProjectInput;
  UpdateReplyInput: UpdateReplyInput;
  UploadProjectDocumentInput: UploadProjectDocumentInput;
  User: User;
};

export type AnchorResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['Anchor'] = ResolversParentTypes['Anchor']> = {
  argumentId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  effectIndex?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  relativePosition?: Resolver<Maybe<ResolversTypes['Position']>, ParentType, ContextType>;
  themeId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ArgumentResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['Argument'] = ResolversParentTypes['Argument']> = {
  aiProposal?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  discussionPoint?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  explanation?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  generatedByAi?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  importance?: Resolver<ResolversTypes['ArgumentImportance'], ParentType, ContextType>;
  location?: Resolver<Array<ResolversTypes['ArgumentLocation']>, ParentType, ContextType>;
  order?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  sentiment?: Resolver<ResolversTypes['ArgumentSentiment'], ParentType, ContextType>;
  source?: Resolver<ResolversTypes['ArgumentSource'], ParentType, ContextType>;
  sourceEffect?: Resolver<Maybe<ResolversTypes['ArgumentSourceEffect']>, ParentType, ContextType>;
  sourceTitle?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  theme?: Resolver<Maybe<ResolversTypes['Theme']>, ParentType, ContextType>;
  timeFrame?: Resolver<Array<ResolversTypes['ArgumentTimeFrame']>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type ArgumentSourceResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['ArgumentSource'] = ResolversParentTypes['ArgumentSource']> = {
  link?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['ArgumentSourceType'], ParentType, ContextType>;
};

export type ArgumentSourceEffectResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['ArgumentSourceEffect'] = ResolversParentTypes['ArgumentSourceEffect']> = {
  effectId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  page?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  sourceId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  sourceKind?: Resolver<ResolversTypes['ArgumentSourceEffectKind'], ParentType, ContextType>;
  text?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  themeSlug?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type CommentResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['Comment'] = ResolversParentTypes['Comment']> = {
  anchor?: Resolver<Maybe<ResolversTypes['Anchor']>, ParentType, ContextType>;
  author?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  body?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  canResolve?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  hasUnread?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  locationData?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  page?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  replies?: Resolver<Array<ResolversTypes['Reply']>, ParentType, ContextType>;
  resolved?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  unreadReplyCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type MutationResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  addReply?: Resolver<ResolversTypes['Reply'], ParentType, ContextType, RequireFields<MutationAddReplyArgs, 'input'>>;
  createArgument?: Resolver<ResolversTypes['Argument'], ParentType, ContextType, RequireFields<MutationCreateArgumentArgs, 'input' | 'projectId' | 'themeSlug'>>;
  createComment?: Resolver<ResolversTypes['Comment'], ParentType, ContextType, RequireFields<MutationCreateCommentArgs, 'input'>>;
  createProject?: Resolver<ResolversTypes['Project'], ParentType, ContextType, RequireFields<MutationCreateProjectArgs, 'input'>>;
  createProjectAiDraftEffects?: Resolver<Array<ResolversTypes['ProjectAiDraftEffect']>, ParentType, ContextType, RequireFields<MutationCreateProjectAiDraftEffectsArgs, 'input' | 'projectId'>>;
  deleteArguments?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteArgumentsArgs, 'argumentIds' | 'projectId'>>;
  deleteComment?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteCommentArgs, 'id'>>;
  deleteProject?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteProjectArgs, 'id'>>;
  deleteProjectAiDraftEffect?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteProjectAiDraftEffectArgs, 'draftEffectId' | 'projectId'>>;
  deleteProjectUploadedDocument?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteProjectUploadedDocumentArgs, 'documentId' | 'projectId'>>;
  deleteReply?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationDeleteReplyArgs, 'commentId' | 'replyId'>>;
  duplicateProject?: Resolver<ResolversTypes['Project'], ParentType, ContextType, RequireFields<MutationDuplicateProjectArgs, 'id'>>;
  generateProjectKeyMessage?: Resolver<ResolversTypes['String'], ParentType, ContextType, RequireFields<MutationGenerateProjectKeyMessageArgs, 'projectId'>>;
  markAllProjectCommentsRead?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationMarkAllProjectCommentsReadArgs, 'projectSlug'>>;
  markCommentResolved?: Resolver<ResolversTypes['Comment'], ParentType, ContextType, RequireFields<MutationMarkCommentResolvedArgs, 'id'>>;
  markCommentsRead?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType, RequireFields<MutationMarkCommentsReadArgs, 'commentIds'>>;
  moveArgumentToTheme?: Resolver<ResolversTypes['Argument'], ParentType, ContextType, RequireFields<MutationMoveArgumentToThemeArgs, 'argumentId' | 'projectId' | 'themeSlug'>>;
  reorderArguments?: Resolver<Array<ResolversTypes['Argument']>, ParentType, ContextType, RequireFields<MutationReorderArgumentsArgs, 'input'>>;
  setupDemo?: Resolver<ResolversTypes['Project'], ParentType, ContextType>;
  startProjectAiAnalysis?: Resolver<ResolversTypes['ProjectAiAnalysis'], ParentType, ContextType, RequireFields<MutationStartProjectAiAnalysisArgs, 'projectId'>>;
  updateArgument?: Resolver<ResolversTypes['Argument'], ParentType, ContextType, RequireFields<MutationUpdateArgumentArgs, 'id' | 'input'>>;
  updateComment?: Resolver<ResolversTypes['Comment'], ParentType, ContextType, RequireFields<MutationUpdateCommentArgs, 'id' | 'input'>>;
  updateProject?: Resolver<ResolversTypes['Project'], ParentType, ContextType, RequireFields<MutationUpdateProjectArgs, 'id' | 'input'>>;
  updateReply?: Resolver<ResolversTypes['Reply'], ParentType, ContextType, RequireFields<MutationUpdateReplyArgs, 'commentId' | 'input' | 'replyId'>>;
  uploadProjectDocument?: Resolver<ResolversTypes['ProjectUploadedDocument'], ParentType, ContextType, RequireFields<MutationUploadProjectDocumentArgs, 'input' | 'projectId'>>;
  useShareLink?: Resolver<Maybe<ResolversTypes['Project']>, ParentType, ContextType, RequireFields<MutationUseShareLinkArgs, 'shareLink'>>;
};

export interface NonEmptyStringScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['NonEmptyString'], any> {
  name: 'NonEmptyString';
}

export type OpenResearchSourceResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['OpenResearchSource'] = ResolversParentTypes['OpenResearchSource']> = {
  category?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  content?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  docId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  publishedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  score?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  sourceType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type PositionResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['Position'] = ResolversParentTypes['Position']> = {
  x?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  y?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
};

export type ProjectResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['Project'] = ResolversParentTypes['Project']> = {
  additionalContext?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  aiAnalyses?: Resolver<Array<ResolversTypes['ProjectAiAnalysis']>, ParentType, ContextType>;
  aiDraftEffects?: Resolver<Array<ResolversTypes['ProjectAiDraftEffect']>, ParentType, ContextType>;
  coverText?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  createdBy?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  impactMotivation?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  impactSituation?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  keyMessage?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  permissibleActions?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  previewData?: Resolver<Maybe<Array<Maybe<Array<ResolversTypes['String']>>>>, ParentType, ContextType>;
  reason?: Resolver<Array<ResolversTypes['ProjectReason']>, ParentType, ContextType>;
  reasonOther?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  scanGoal?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  scope?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  shareLink?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['ProjectStatus'], ParentType, ContextType>;
  template?: Resolver<ResolversTypes['ProjectTemplate'], ParentType, ContextType>;
  themes?: Resolver<Maybe<Array<Maybe<ResolversTypes['Theme']>>>, ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  uploadedDocuments?: Resolver<Array<ResolversTypes['ProjectUploadedDocument']>, ParentType, ContextType>;
  users?: Resolver<Maybe<Array<Maybe<ResolversTypes['ProjectUser']>>>, ParentType, ContextType>;
};

export type ProjectAiAnalysisResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['ProjectAiAnalysis'] = ResolversParentTypes['ProjectAiAnalysis']> = {
  completedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  errorMessage?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  experts?: Resolver<Array<ResolversTypes['ProjectAiExpert']>, ParentType, ContextType>;
  generatedQuestion?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  inputSummary?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  methodExplanation?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  progress?: Resolver<Maybe<ResolversTypes['ProjectAiAnalysisProgress']>, ParentType, ContextType>;
  searchQuestion?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sources?: Resolver<Array<ResolversTypes['ProjectAiSource']>, ParentType, ContextType>;
  startedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['ProjectAiAnalysisStatus'], ParentType, ContextType>;
  talkingPoints?: Resolver<Array<ResolversTypes['ProjectAiTalkingPoint']>, ParentType, ContextType>;
  themes?: Resolver<Array<ResolversTypes['ProjectAiTheme']>, ParentType, ContextType>;
};

export type ProjectAiAnalysisProgressResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['ProjectAiAnalysisProgress'] = ResolversParentTypes['ProjectAiAnalysisProgress']> = {
  phases?: Resolver<Array<ResolversTypes['ProjectAiAnalysisProgressPhase']>, ParentType, ContextType>;
};

export type ProjectAiAnalysisProgressPhaseResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['ProjectAiAnalysisProgressPhase'] = ResolversParentTypes['ProjectAiAnalysisProgressPhase']> = {
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ProjectAiDraftEffectResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['ProjectAiDraftEffect'] = ResolversParentTypes['ProjectAiDraftEffect']> = {
  aiProposal?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  convertedArgumentId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  discussionPoint?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  explanation?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  generatedByAi?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  importance?: Resolver<ResolversTypes['ArgumentImportance'], ParentType, ContextType>;
  location?: Resolver<Array<ResolversTypes['ArgumentLocation']>, ParentType, ContextType>;
  sentiment?: Resolver<ResolversTypes['ArgumentSentiment'], ParentType, ContextType>;
  source?: Resolver<ResolversTypes['ArgumentSource'], ParentType, ContextType>;
  sourceEffect?: Resolver<ResolversTypes['ArgumentSourceEffect'], ParentType, ContextType>;
  sourceTitle?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  timeFrame?: Resolver<Array<ResolversTypes['ArgumentTimeFrame']>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type ProjectAiExpertResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['ProjectAiExpert'] = ResolversParentTypes['ProjectAiExpert']> = {
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  externalId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  organisation?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  score?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  sourceIds?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
};

export type ProjectAiSourceResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['ProjectAiSource'] = ResolversParentTypes['ProjectAiSource']> = {
  content?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  externalId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  publishedAt?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  score?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  sourceType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type ProjectAiTalkingPointResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['ProjectAiTalkingPoint'] = ResolversParentTypes['ProjectAiTalkingPoint']> = {
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  supportingSourceIds?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  themes?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  topic?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type ProjectAiThemeResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['ProjectAiTheme'] = ResolversParentTypes['ProjectAiTheme']> = {
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rationale?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  relevance?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  slug?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  talkingPointIds?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
};

export type ProjectUploadedDocumentResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['ProjectUploadedDocument'] = ResolversParentTypes['ProjectUploadedDocument']> = {
  aiDescription?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  aiStatements?: Resolver<Array<ResolversTypes['ProjectUploadedDocumentStatement']>, ParentType, ContextType>;
  aiTitle?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  analysisError?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  analysisStatus?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  blobPath?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  fileName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  keyword?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  mimeType?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  size?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  themeSlug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  uploadedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  uploadedBy?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
};

export type ProjectUploadedDocumentStatementResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['ProjectUploadedDocumentStatement'] = ResolversParentTypes['ProjectUploadedDocumentStatement']> = {
  author?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  docId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  page?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  score?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  source?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  text?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type ProjectUserResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['ProjectUser'] = ResolversParentTypes['ProjectUser']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  role?: Resolver<ResolversTypes['UserProjectRole'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  user?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
};

export type QueryResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  argument?: Resolver<Maybe<ResolversTypes['Argument']>, ParentType, ContextType, RequireFields<QueryArgumentArgs, 'id'>>;
  arguments?: Resolver<Array<ResolversTypes['Argument']>, ParentType, ContextType>;
  comments?: Resolver<Array<ResolversTypes['Comment']>, ParentType, ContextType, RequireFields<QueryCommentsArgs, 'projectSlug'>>;
  me?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
  openResearchSource?: Resolver<Maybe<ResolversTypes['OpenResearchSource']>, ParentType, ContextType, RequireFields<QueryOpenResearchSourceArgs, 'id'>>;
  openResearchSourceEffects?: Resolver<Array<ResolversTypes['SourceEffect']>, ParentType, ContextType, RequireFields<QueryOpenResearchSourceEffectsArgs, 'projectId' | 'sourceId'>>;
  project?: Resolver<Maybe<ResolversTypes['Project']>, ParentType, ContextType, RequireFields<QueryProjectArgs, 'slug'>>;
  projectAiAnalysis?: Resolver<ResolversTypes['ProjectAiAnalysis'], ParentType, ContextType, RequireFields<QueryProjectAiAnalysisArgs, 'projectId'>>;
  projects?: Resolver<Array<ResolversTypes['Project']>, ParentType, ContextType>;
  theme?: Resolver<Maybe<ResolversTypes['Theme']>, ParentType, ContextType, RequireFields<QueryThemeArgs, 'id'>>;
  themes?: Resolver<Array<ResolversTypes['Theme']>, ParentType, ContextType>;
};

export type ReplyResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['Reply'] = ResolversParentTypes['Reply']> = {
  author?: Resolver<ResolversTypes['User'], ParentType, ContextType>;
  body?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  resolved?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type SourceEffectResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['SourceEffect'] = ResolversParentTypes['SourceEffect']> = {
  page?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  text?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ThemeResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['Theme'] = ResolversParentTypes['Theme']> = {
  arguments?: Resolver<Maybe<Array<Maybe<ResolversTypes['Argument']>>>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  isActive?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  projectSlug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type UserResolvers<ContextType = AppContext, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
  displayName?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>;
};

export type Resolvers<ContextType = AppContext> = {
  Anchor?: AnchorResolvers<ContextType>;
  Argument?: ArgumentResolvers<ContextType>;
  ArgumentSource?: ArgumentSourceResolvers<ContextType>;
  ArgumentSourceEffect?: ArgumentSourceEffectResolvers<ContextType>;
  Comment?: CommentResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  JSON?: GraphQLScalarType;
  Mutation?: MutationResolvers<ContextType>;
  NonEmptyString?: GraphQLScalarType;
  OpenResearchSource?: OpenResearchSourceResolvers<ContextType>;
  Position?: PositionResolvers<ContextType>;
  Project?: ProjectResolvers<ContextType>;
  ProjectAiAnalysis?: ProjectAiAnalysisResolvers<ContextType>;
  ProjectAiAnalysisProgress?: ProjectAiAnalysisProgressResolvers<ContextType>;
  ProjectAiAnalysisProgressPhase?: ProjectAiAnalysisProgressPhaseResolvers<ContextType>;
  ProjectAiDraftEffect?: ProjectAiDraftEffectResolvers<ContextType>;
  ProjectAiExpert?: ProjectAiExpertResolvers<ContextType>;
  ProjectAiSource?: ProjectAiSourceResolvers<ContextType>;
  ProjectAiTalkingPoint?: ProjectAiTalkingPointResolvers<ContextType>;
  ProjectAiTheme?: ProjectAiThemeResolvers<ContextType>;
  ProjectUploadedDocument?: ProjectUploadedDocumentResolvers<ContextType>;
  ProjectUploadedDocumentStatement?: ProjectUploadedDocumentStatementResolvers<ContextType>;
  ProjectUser?: ProjectUserResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Reply?: ReplyResolvers<ContextType>;
  SourceEffect?: SourceEffectResolvers<ContextType>;
  Theme?: ThemeResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
};

