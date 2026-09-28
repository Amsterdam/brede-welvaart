import { useNavigate, useParams } from "react-router-dom";
import { gql } from "@apollo/client";
import { useApolloClient } from "@apollo/client/react";

import { THEME_FRAGMENT } from "../../../../../graphql/fragments";

import { Button as UIButton } from "@shared/ui";

import Icon from "../../../../common/Icon";

export default function ThemeOverviewBar({ project }) {
	const client = useApolloClient();
	const { projectSlug, themeSlug } = useParams();
	const navigate = useNavigate();

	const theme = client.cache.readFragment({
		id: `Theme:{"projectSlug":"${projectSlug}","slug":"${themeSlug}"}`,
		fragment: gql`
			fragment ThemeFragmentSmall on Theme {
				name
			}
		`,
	});

	return (
		<>
			<UIButton
				className="wizard-content-editor-header-action"
				variant="quaternary"
				onClick={() => navigate(`/project/${projectSlug}`)}
			>
				<Icon name={"arrow-left-blue"} />
				<span>Terug</span>
			</UIButton>
			<div className="wizard-content-editor-header-breadcrumbs">
				<span>
					Thema's &gt;&nbsp;
					<b>{theme.name}</b>
				</span>
			</div>
		</>
	);
}
