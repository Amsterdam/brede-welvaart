import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { usePopup } from "@shared/ui/context/PopupContext";
import { ArgumentSentiment } from "@shared/types";
import { getLocationOption, getSentimentOption, getTimeOption } from "../../../../../utils/argumentValues";

import { useMutation } from "@apollo/client/react";
import { DELETE_ARGUMENTS } from "../../../../../graphql/mutations";
import { GET_PROJECT } from "../../../../../graphql/queries";

import { Button as UIButton } from "@shared/ui";

import Icon from "../../../../common/Icon";

import EditArgumentCard from "../../../Cards/EditArgumentCard";
import TextWithMention from "../../../Mention/TextWithMention";
import ProgressArguments from "../../../ProgressArguments";
import ListArguments from "../../../Arguments/ListArguments";

import "./index.scss";
import DeleteArgumentsCard from "../../../Cards/DeleteArgumentsCard";

export default function ThemeOverview({ project }) {
	const { themeSlug } = useParams();
	const { showCard } = usePopup();

	const theme = project.themes.find((t) => t.slug === themeSlug);

	const [toggleThemeHeader, setToggleThemeHeader] = useState(theme.arguments.length === 0);

	const { positiveArguments, neutralArguments, negativeArguments } = useMemo(() => {
		if (!theme.arguments) return { positiveArguments: [], neutralArguments: [], negativeArguments: [] };
		return {
			positiveArguments: theme.arguments.filter((arg) => arg.sentiment === ArgumentSentiment.Positive),
			neutralArguments: theme.arguments.filter((arg) => arg.sentiment === ArgumentSentiment.Neutral),
			negativeArguments: theme.arguments.filter((arg) => arg.sentiment === ArgumentSentiment.Negative),
		};
	}, [theme.arguments]);
	const [togglePositive, setTogglePositive] = useState(true);
	const [toggleNeutral, setToggleNeutral] = useState(true);
	const [toggleNegative, setToggleNegative] = useState(true);
	const [argsToDelete, setArgsToDelete] = useState([]);

	return (
		<>
			<div className="wizard-content-editor-content-theme-overview-header">
				<div
					className="wizard-content-editor-content-theme-overview-header-title"
					onClick={() => setToggleThemeHeader((prev) => !prev)}
				>
					<Icon name={`${theme.slug}-straight`} />
					<span>{theme.name}</span>
					<Icon name={toggleThemeHeader ? "chevron-up" : "chevron-down"} />
				</div>
				{toggleThemeHeader && (
					<div className="wizard-content-editor-content-theme-overview-header-desc">
						<span>{theme.description}</span>
					</div>
				)}
			</div>

			<div className="wizard-content-editor-content-theme-overview-buttons">
				{argsToDelete.length > 0 ? (
					<UIButton
						variant="tertiary"
						onClick={() =>
							showCard(DeleteArgumentsCard, "", () => {}, { project, argsToDelete, setArgsToDelete })
						}
					>
						<Icon name={"trashbin-blue"} />
						Geselecteerde verwijderen
					</UIButton>
				) : (
					<div />
				)}
				<UIButton
					disabled={theme.arguments.length >= 10}
					variant="secondary"
					onClick={() => showCard(EditArgumentCard, "", () => {}, { project, theme })}
				>
					<Icon name={"plus-blue"} />
					Voeg nieuw effect toe
				</UIButton>
			</div>

			<div className="theme-arguments-list">
				{theme.arguments.length > 0 && (
					<>
						{positiveArguments?.length > 0 && (
							<>
								<div
									onClick={() => setTogglePositive((prev) => !prev)}
									className="theme-arguments-list-toggle"
								>
									<Icon name={togglePositive ? "chevron-up" : "chevron-down"} />
									<span>{getSentimentOption(ArgumentSentiment.Positive)}</span>
								</div>
								{togglePositive && (
									<ListArguments
										project={project}
										theme={theme}
										args={positiveArguments}
										argsToDelete={argsToDelete}
										setArgsToDelete={setArgsToDelete}
									/>
								)}
							</>
						)}
						{negativeArguments?.length > 0 && (
							<>
								<div
									onClick={() => setToggleNegative((prev) => !prev)}
									className="theme-arguments-list-toggle"
								>
									<Icon name={toggleNegative ? "chevron-up" : "chevron-down"} />
									<span>{getSentimentOption(ArgumentSentiment.Negative)}</span>
								</div>
								{toggleNegative && (
									<ListArguments
										project={project}
										theme={theme}
										args={negativeArguments}
										argsToDelete={argsToDelete}
										setArgsToDelete={setArgsToDelete}
									/>
								)}
							</>
						)}
						{neutralArguments?.length > 0 && (
							<>
								<div
									onClick={() => setToggleNeutral((prev) => !prev)}
									className="theme-arguments-list-toggle"
								>
									<Icon name={toggleNeutral ? "chevron-up" : "chevron-down"} />
									<span>{getSentimentOption(ArgumentSentiment.Neutral)}</span>
								</div>
								{toggleNeutral && (
									<ListArguments
										project={project}
										theme={theme}
										args={neutralArguments}
										argsToDelete={argsToDelete}
										setArgsToDelete={setArgsToDelete}
									/>
								)}
							</>
						)}
					</>
				)}
			</div>
		</>
	);
}
