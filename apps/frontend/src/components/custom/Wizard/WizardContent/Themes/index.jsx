import { useNavigate } from "react-router-dom";

import { usePopup } from "@shared/ui/context/PopupContext";

import Icon from "../../../../common/Icon";

import ProgressArguments from "../../../ProgressArguments";
import CoverTextCard from "../../../Cards/CoverTextCard";
import QuestionsCard from "../../../Cards/QuestionsCard";
import KeyMessageCard from "../../../Cards/KeyMessageCard";
import AiDraftEffects from "../../../AiDraftEffects";

import "./index.scss";

export default function Themes({ project }) {
	const navigate = useNavigate();
	const { showCard } = usePopup();
	// Mirror the AI dashboard "Gebruikte effecten" tab: it lists every AI source
	// effect pulled into the scan (converted + still-pending), and treats the
	// converted ones as "verwerkt". Counting from the same draft set keeps this
	// "x van y" in sync with the tab instead of drifting from it.
	const aiSourceDrafts = (project.aiDraftEffects ?? []).filter((draft) => draft.sourceEffect?.key);
	const totalAiEffects = aiSourceDrafts.length;
	const verwerktAiEffects = aiSourceDrafts.filter((draft) => draft.convertedArgumentId).length;
	const effectCountLabel =
		totalAiEffects === 0
			? "Nog geen AI-effecten verwerkt"
			: `${verwerktAiEffects} van ${totalAiEffects} AI-effecten verwerkt`;

	return (
		<>
			<span>
				Door per thema effecten in te vullen en op te slaan, verschijnen deze rechts in het diagram. Je kunt per
				thema maximaal 12 effecten toevoegen. De samenvatting op pagina 2 wordt automatisch gemaakt. De
				kernboodschap kun je boven de thema's vinden.
			</span>

			<button
				type="button"
				className="wizard-content-editor-content-ai-action"
				data-tour="ai-exploration"
				onClick={() => navigate(`/project/${project.slug}/ai-dashboard`)}
			>
				<span>
					<Icon name="ai-wand-stars" />
					<span className="wizard-content-editor-content-ai-action-text">
						<strong>Naar de AI-ondersteunde verkenning</strong>
						<small>{effectCountLabel}</small>
					</span>
				</span>
				<Icon name="plus" />
			</button>

			<AiDraftEffects project={project} />

			<div className="wizard-content-editor-content-actions" data-tour="product-actions">
				<button type="button" onClick={() => showCard(CoverTextCard, "", () => {}, { project })}>
					<span>Voorblad aanpassen</span>
					<Icon name="plus" />
				</button>
				<button type="button" onClick={() => showCard(QuestionsCard, "", () => {}, { project })}>
					<span>Vragen aanpassen</span>
					<Icon name="plus" />
				</button>
				<button type="button" onClick={() => showCard(KeyMessageCard, "", () => {}, { project })}>
					<span>Kernboodschap toewijzen</span>
					<Icon name="plus" />
				</button>
			</div>

			<div className="wizard-content-editor-content-list" data-tour="topic-list">
				{project.themes.map((theme, themeIndex) => {
					return (
						<div
							key={themeIndex}
							className="wizard-content-editor-content-list-item"
							onClick={() => navigate(`/project/${project.slug}/${theme.slug}`)}
						>
							<div className="wizard-content-editor-content-list-item-left">
								<Icon name={`${theme.slug}-straight`} />
							</div>
							<div className="wizard-content-editor-content-list-item-middle">
								<span>{theme.name}</span>
								<ProgressArguments theme={theme} />
							</div>
							<div className="wizard-content-editor-content-list-item-right">
								<div className="wizard-content-editor-content-list-item-right-edit">
									<Icon name={theme.arguments.length > 0 ? "edit" : "plus-gray"} />
								</div>
							</div>
						</div>
					);
				})}
			</div>
		</>
	);
}
