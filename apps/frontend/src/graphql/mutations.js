import { gql } from "@apollo/client";
import { PROJECT_FRAGMENT, ARGUMENT_FRAGMENT, COMMENT_FRAGMENT, REPLY_FRAGMENT } from "./fragments";

export const ADD_REPLY = gql`
	${REPLY_FRAGMENT}
	mutation AddReply($input: CreateReplyInput!) {
		addReply(input: $input) {
			...ReplyFragment
		}
	}
`;

export const CREATE_COMMENT = gql`
	${COMMENT_FRAGMENT}
	mutation CreateComment($input: CreateCommentInput!) {
		createComment(input: $input) {
			...CommentFragment
		}
	}
`;

export const DELETE_COMMENT = gql`
	mutation DeleteComment($deleteCommentId: ID!) {
		deleteComment(id: $deleteCommentId)
	}
`;

export const MARK_COMMENT_RESOLVED = gql`
	${COMMENT_FRAGMENT}
	mutation MarkCommentResolved($resolveCommentId: ID!) {
		markCommentResolved(id: $resolveCommentId) {
			...CommentFragment
		}
	}
`;

export const UPDATE_ARGUMENT = gql`
	${ARGUMENT_FRAGMENT}
	mutation UpdateArgument($id: ID!, $input: UpdateArgumentInput!) {
		updateArgument(id: $id, input: $input) {
			...ArgumentFragment
		}
	}
`;

export const CREATE_ARGUMENT = gql`
	mutation CreateArgument($projectId: ID!, $themeSlug: String!, $input: CreateArgumentInput!) {
		createArgument(projectId: $projectId, themeSlug: $themeSlug, input: $input) {
			id
		}
	}
`;

export const CREATE_PROJECT_AI_DRAFT_EFFECTS = gql`
	mutation CreateProjectAiDraftEffects($projectId: ID!, $input: [CreateProjectAiDraftEffectInput!]!) {
		createProjectAiDraftEffects(projectId: $projectId, input: $input) {
			id
			title
			explanation
			generatedByAi
			aiProposal
			sourceEffect {
				key
			}
			sourceTitle
		}
	}
`;

export const DELETE_PROJECT_AI_DRAFT_EFFECT = gql`
	mutation DeleteProjectAiDraftEffect($projectId: ID!, $draftEffectId: ID!) {
		deleteProjectAiDraftEffect(projectId: $projectId, draftEffectId: $draftEffectId)
	}
`;

export const UPDATE_PROJECT = gql`
	${PROJECT_FRAGMENT}
	mutation UpdateProject($updateProjectId: ID!, $input: UpdateProjectInput!) {
		updateProject(id: $updateProjectId, input: $input) {
			...ProjectFragment
		}
	}
`;

export const GENERATE_PROJECT_KEY_MESSAGE = gql`
	mutation GenerateProjectKeyMessage($projectId: ID!) {
		generateProjectKeyMessage(projectId: $projectId)
	}
`;

export const DELETE_PROJECT = gql`
	mutation DeleteProject($deleteProjectId: ID!) {
		deleteProject(id: $deleteProjectId)
	}
`;

export const DUPLICATE_PROJECT = gql`
	${PROJECT_FRAGMENT}
	mutation DuplicateProject($duplicateProjectId: ID!) {
		duplicateProject(id: $duplicateProjectId) {
			...ProjectFragment
		}
	}
`;

export const DELETE_ARGUMENTS = gql`
	mutation DeleteArguments($projectId: ID!, $argumentIds: [ID!]!) {
		deleteArguments(projectId: $projectId, argumentIds: $argumentIds)
	}
`;

export const UPLOAD_PROJECT_DOCUMENT = gql`
	mutation UploadProjectDocument($projectId: ID!, $input: UploadProjectDocumentInput!) {
		uploadProjectDocument(projectId: $projectId, input: $input) {
			id
			themeSlug
			fileName
			mimeType
			size
			name
			description
			keyword
			blobPath
			analysisStatus
			analysisError
			aiTitle
			aiDescription
			aiStatements {
				text
				docId
				title
				url
				author
				page
				score
				source
			}
			uploadedAt
			uploadedBy
		}
	}
`;

export const DELETE_PROJECT_DOCUMENT = gql`
	mutation DeleteProjectUploadedDocument($projectId: ID!, $documentId: ID!) {
		deleteProjectUploadedDocument(projectId: $projectId, documentId: $documentId)
	}
`;

export const MOVE_ARGUMENT_TO_THEME = gql`
	mutation MoveArgumentToTheme($projectId: ID!, $argumentId: ID!, $themeSlug: String!) {
		moveArgumentToTheme(projectId: $projectId, argumentId: $argumentId, themeSlug: $themeSlug) {
			id
		}
	}
`;

export const CREATE_PROJECT = gql`
	mutation CreateProject($input: CreateProjectInput!) {
		createProject(input: $input) {
			id
			slug
		}
	}
`;
export const USE_SHARE_LINK = gql`
	${PROJECT_FRAGMENT}
	mutation UseShareLink($shareLink: String!) {
		useShareLink(shareLink: $shareLink) {
			...ProjectFragment
		}
	}
`;

export const SETUP_DEMO = gql`
	${PROJECT_FRAGMENT}
	mutation SetupDemo {
		setupDemo {
			...ProjectFragment
		}
	}
`;

export const MARK_COMMENTS_READ = gql`
	mutation MarkCommentsRead($commentIds: [ID!]!) {
		markCommentsRead(commentIds: $commentIds)
	}
`;

export const MARK_ALL_PROJECT_COMMENTS_READ = gql`
	mutation MarkAllProjectCommentsRead($projectSlug: ID!) {
		markAllProjectCommentsRead(projectSlug: $projectSlug)
	}
`;

export const START_PROJECT_AI_ANALYSIS = gql`
	mutation StartProjectAiAnalysis($projectId: ID!, $searchQuestion: String) {
		startProjectAiAnalysis(projectId: $projectId, searchQuestion: $searchQuestion) {
			status
			searchQuestion
			generatedQuestion
			startedAt
			errorMessage
		}
	}
`;
