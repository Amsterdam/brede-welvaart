import { gql } from "@apollo/client";
import { PROJECT_FRAGMENT, COMMENT_FRAGMENT } from "./fragments";

export const GET_COMMENTS = gql`
	${COMMENT_FRAGMENT}
	query Comments($projectSlug: ID!) {
		comments(projectSlug: $projectSlug) {
			...CommentFragment
		}
	}
`;

export const GET_PROJECT = gql`
	${PROJECT_FRAGMENT}
	query Project($slug: String!) {
		project(slug: $slug) {
			...ProjectFragment
		}
	}
`;

export const GET_PROJECT_AI_ANALYSIS = gql`
	query ProjectAiAnalysis($projectId: ID!) {
		projectAiAnalysis(projectId: $projectId) {
			status
			searchQuestion
			generatedQuestion
			methodExplanation
			startedAt
			completedAt
			errorMessage
			progress {
				phases {
					key
					status
				}
			}
			experts {
				externalId
				name
				organisation
				description
				score
				sourceIds
				metadata
			}
			sources {
				externalId
				title
				content
				url
				score
				sourceType
				publishedAt
				metadata
			}
			talkingPoints {
				topic
				description
				themes
				supportingSourceIds
			}
		}
	}
`;

export const GET_OPEN_RESEARCH_SOURCE = gql`
	query OpenResearchSource($id: ID!) {
		openResearchSource(id: $id) {
			id
			docId
			title
			content
			url
			score
			sourceType
			publishedAt
			category
			metadata
		}
	}
`;

export const GET_OPEN_RESEARCH_SOURCE_EFFECTS = gql`
	query OpenResearchSourceEffects($projectId: ID!, $sourceId: ID!, $themeSlug: String) {
		openResearchSourceEffects(projectId: $projectId, sourceId: $sourceId, themeSlug: $themeSlug) {
			text
			page
		}
	}
`;

export const GET_PROJECTS = gql`
	query Projects {
		projects {
			id
			name
			slug
			description
			reason
			reasonOther
			scanGoal
			impactMotivation
			scope
			status
			updatedAt
			previewData
		}
	}
`;
