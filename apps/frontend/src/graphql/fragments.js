import { gql } from "@apollo/client";

export const ARGUMENT_FRAGMENT = gql`
	fragment ArgumentFragment on Argument {
		id
		title
		explanation
		generatedByAi
		aiProposal
		location
		timeFrame
		sentiment
		discussionPoint
		importance
		theme {
			id
			name
			description
		}
		source {
			link
			type
		}
		sourceTitle
		sourceEffect {
			key
			sourceKind
			sourceId
			effectId
			themeSlug
			page
			text
		}
		__typename
	}
`;

export const THEME_FRAGMENT = gql`
	${ARGUMENT_FRAGMENT}
	fragment ThemeFragment on Theme {
		id
		slug
		projectSlug
		name
		description
		arguments {
			...ArgumentFragment
		}
		__typename
	}
`;

export const PROJECT_FRAGMENT = gql`
	${THEME_FRAGMENT}
	fragment ProjectFragment on Project {
		id
		slug
		name
		description
		reason
		reasonOther
		scanGoal
		impactSituation
		impactMotivation
		scope
		additionalContext
		keyMessage
		coverText
		status
		createdAt
		updatedAt
		uploadedDocuments {
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
		aiDraftEffects {
			id
			title
			explanation
			sentiment
			discussionPoint
			timeFrame
			location
			generatedByAi
			aiProposal
			importance
			convertedArgumentId
			source {
				link
				type
			}
			sourceTitle
			sourceEffect {
				key
				sourceKind
				sourceId
				effectId
				themeSlug
				page
				text
			}
			createdAt
			updatedAt
		}
		themes {
			...ThemeFragment
		}
		createdBy {
			id
		}
		shareLink
		__typename
	}
`;
export const USER_FRAGMENT = gql`
	fragment UserFragment on User {
		id
		displayName
		__typename
	}
`;

export const REPLY_FRAGMENT = gql`
	${USER_FRAGMENT}
	fragment ReplyFragment on Reply {
		id
		author {
			...UserFragment
		}
		body
		resolved
		createdAt
		updatedAt
		__typename
	}
`;

export const COMMENT_FRAGMENT = gql`
	${USER_FRAGMENT}
	${REPLY_FRAGMENT}
	fragment CommentFragment on Comment {
		id
		author {
			...UserFragment
		}
		body
		replies {
			...ReplyFragment
		}
		resolved
		canResolve
		hasUnread
		unreadReplyCount
		page
		locationData
		anchor {
			type
			argumentId
			themeId
			relativePosition {
				x
				y
			}
		}
		createdAt
		updatedAt
		__typename
	}
`;
