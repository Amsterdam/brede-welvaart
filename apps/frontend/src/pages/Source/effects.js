export function formatAiProposal(effect, sourceName) {
	const location = effect.page
		? `Op pagina ${effect.page} van ${sourceName} vind je een mogelijk effect:`
		: `In ${sourceName} vind je een mogelijk effect:`;
	return [location, `“${effect.text}”`].join("\n");
}

export function getSourceEffectKey(sourceEffect) {
	if (!sourceEffect) return null;
	if (sourceEffect.key) return sourceEffect.key;
	// Theme-independent identity: drafts are project-level, the theme is chosen
	// only when a draft is converted into an argument.
	return [
		sourceEffect.sourceKind,
		sourceEffect.sourceId,
		sourceEffect.effectId,
	].filter(Boolean).join(":");
}

/**
 * Build the effect cards for an Open Research source from the verbatim statements
 * the ai-service extracted from that document. Statements (and the drafts created
 * from them) are themeless; the theme is chosen when a draft becomes an argument.
 */
export function buildOpenResearchEffects({ statements, sourceKind, sourceId }) {
	return (statements ?? [])
		.map((statement, index) => ({
			effectId: `effect-${index + 1}`,
			page: typeof statement.page === "number" ? statement.page : null,
			text: statement.text,
		}))
		.filter((effect) => effect.text)
		.map((effect) => ({
			...effect,
			sourceEffect:
				sourceKind && sourceId
					? {
							sourceKind,
							sourceId,
							effectId: effect.effectId,
							page: effect.page,
							text: effect.text,
					  }
					: null,
		}));
}

export function buildUploadedDocumentEffects({ document }) {
	if (!document?.id) return [];

	return (document.aiStatements ?? [])
		.map((statement, index) => ({
			effectId: `statement-${index + 1}`,
			page: statement.page ?? null,
			text: statement.text,
		}))
		.filter((effect) => effect.text)
		.map((effect) => ({
			...effect,
			sourceEffect: {
				sourceKind: "UPLOADED_DOCUMENT",
				sourceId: document.id,
				effectId: effect.effectId,
				page: effect.page,
				text: effect.text,
			},
		}));
}
