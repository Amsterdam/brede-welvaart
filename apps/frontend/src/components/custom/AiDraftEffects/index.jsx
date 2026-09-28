import { useState } from "react";

import { usePopup } from "@shared/ui/context/PopupContext";

import Icon from "../../common/Icon";
import EditArgumentCard from "../Cards/EditArgumentCard";

import "./index.scss";

// Project-level list of AI draft effects still waiting to be processed
// ("Uit AI-ondersteunde verkenning"). Drafts are themeless; clicking one opens the
// editor where the user picks a theme and turns it into an effect. Once converted,
// a draft drops off this list — it now lives as an effect under its own theme — so
// the project overview stays a short to-do list instead of growing without bound.
export default function AiDraftEffects({ project }) {
	const { showCard } = usePopup();
	const aiDraftEffects = project.aiDraftEffects ?? [];

	// sourceEffect.key of every draft already converted into an argument (any theme).
	// Fallback for drafts converted before convertedArgumentId existed (no marker set).
	const usedKeys = new Set();
	for (const theme of project.themes ?? []) {
		for (const argument of theme.arguments ?? []) {
			if (argument.sourceEffect?.key) usedKeys.add(argument.sourceEffect.key);
		}
	}

	// A converted draft drops off the to-do list — primarily on its explicit
	// convertedArgumentId marker, with the key match as a fallback for legacy data.
	const pendingDrafts = aiDraftEffects.filter(
		(draft) => !draft.convertedArgumentId && !usedKeys.has(draft.sourceEffect?.key)
	);
	const [open, setOpen] = useState(true);

	// Nothing left to triage — converted effects live under their own themes.
	if (pendingDrafts.length === 0) return null;

	function openDraft(draft) {
		showCard(EditArgumentCard, "", () => {}, { project, theme: null, arg: {}, draftEffect: draft });
	}

	return (
		<div className="ai-draft-effects">
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className="ai-draft-effects-toggle"
				data-tour="ai-effects-toggle"
				aria-expanded={open}
			>
				<span className="ai-draft-effects-toggle__chevron" aria-hidden="true">
					<Icon name={open ? "chevron-up" : "chevron-down"} />
				</span>
				<span>Uit AI-ondersteunde verkenning ({pendingDrafts.length})</span>
				<Icon name="ai-wand-stars" />
			</button>
			{open && (
				<div className="ai-draft-effects-list" data-tour="ai-effects-list">
					{pendingDrafts.map((draft, index) => {
						const sourceLabel =
							draft.sourceTitle ||
							(draft.sourceEffect?.sourceKind === "OPEN_RESEARCH" ? "OpenResearch-bron" : "AI-bron");
						return (
							<div key={draft.id} className="ai-draft-effect">
								<div className="ai-draft-effect__line" aria-hidden="true" />
								<div
									className="ai-draft-effect__content"
									role="button"
									tabIndex={0}
									onClick={() => openDraft(draft)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											openDraft(draft);
										}
									}}
								>
									<button
										type="button"
										className="ai-draft-effect__edit"
										aria-label={`AI-voorstel ${index + 1} uitwerken`}
									>
										<Icon name="edit" />
									</button>
									<span className="ai-draft-effect__label">AI-zoekresultaat</span>
									<div className="ai-draft-effect__text">
										<span>{draft.aiProposal?.split("\n")[0] || draft.title}</span>
										<p>“{draft.explanation}”</p>
									</div>
									<div className="ai-draft-effect__source">
										<span>Bron:</span>
										<span>{sourceLabel}</span>
									</div>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
