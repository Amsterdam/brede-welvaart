import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { Alert, Button, Heading, Link, Paragraph, Tabs } from "@amsterdam/design-system-react";
import { ArgumentImportance, ArgumentSentiment, ArgumentSourceType } from "@shared/types";
import { usePopup } from "@shared/ui/context/PopupContext";

import Icon from "../../components/common/Icon";
import AddToScanDialog from "./AddToScanDialog";
import { CREATE_PROJECT_AI_DRAFT_EFFECTS } from "../../graphql/mutations";
import { GET_OPEN_RESEARCH_SOURCE, GET_OPEN_RESEARCH_SOURCE_EFFECTS, GET_PROJECT } from "../../graphql/queries";

import SourceEffectCard from "./SourceEffectCard";
import {
	buildOpenResearchEffects,
	buildUploadedDocumentEffects,
	formatAiProposal,
	getSourceEffectKey,
} from "./effects";
import {
	decodeSourceId,
	formatSourceDate,
	formatUploadDate,
	getMetadataList,
	getMetadataValue,
	parseMetadata,
	sourceMatchesId,
	stripHtml,
} from "./helpers";

import "./index.scss";

function AuthorCard({ source }) {
	const metadata = source.metadata ?? {};
	const authorName = getMetadataValue(metadata, [
		"author",
		"authors",
		"creator",
		"publisher",
		"organization",
		"organisation",
	]);
	const organisation = getMetadataValue(metadata, ["organisation", "organization", "publisher"]);

	if (!authorName && !organisation) return null;

	const initials = (authorName ?? organisation)
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();

	return (
		<div className="source-page-author">
			<span className="source-page-author__avatar" aria-hidden="true">
				{initials}
			</span>
			<div className="source-page-author__body">
				{authorName && <p className="source-page-author__name">{authorName}</p>}
				{organisation && organisation !== authorName && (
					<p className="source-page-author__organisation">{organisation}</p>
				)}
			</div>
		</div>
	);
}

// --- normalisers ----------------------------------------------------------

function normaliseOpenResearchSource(raw) {
	const metadata = parseMetadata(raw.metadata);
	return {
		title: raw.title,
		dateLabel: formatSourceDate(raw.publishedAt),
		content: stripHtml(raw.content),
		sourceUrl: raw.url,
		sourceName: raw.title || "Open Research",
		sourceKind: "OPEN_RESEARCH",
		sourceId: raw.externalId ?? raw.docId ?? raw.doc_id ?? raw.id ?? metadata.doc_id ?? raw.url ?? raw.title,
		breadcrumbLabel: "Open Research",
		ariaLabel: "Open Research bron",
		argumentSourceType: ArgumentSourceType.Link,
		metadata,
		raw,
	};
}

function normalisePdfDocument(document) {
	const title = document.aiTitle || document.name;
	const description = document.aiDescription || document.description;
	return {
		title,
		dateLabel: formatUploadDate(document.uploadedAt),
		content:
			description ||
			`We hebben ${document.fileName} verwerkt en zoeken naar mogelijke effecten voor de brede welvaartscan.`,
		sourceUrl: null,
		sourceName: title || document.fileName || "Eigen document",
		sourceKind: "UPLOADED_DOCUMENT",
		sourceId: document.id,
		breadcrumbLabel: "AI Voorstel",
		ariaLabel: "Resultaten van geüpload document",
		argumentSourceType: ArgumentSourceType.Policy,
		document,
	};
}

// --- main component -------------------------------------------------------

export default function SourcePage({ type }) {
	const params = useParams();
	const navigate = useNavigate();
	const location = useLocation();
	const { showCard } = usePopup();
	const [showAiInfo, setShowAiInfo] = useState(false);
	const [selectedIndexes, setSelectedIndexes] = useState([]);
	const [submitError, setSubmitError] = useState("");
	const [submitMessage, setSubmitMessage] = useState("");

	const { projectSlug, themeSlug, documentId, sourceId } = params;
	const decodedSourceId = type === "open-research" ? decodeSourceId(sourceId) : null;

	// Project context — used for breadcrumb, themes, and the add-to-scan mutation.
	const {
		data: projectData,
		loading: projectLoading,
		startPolling: startProjectPolling,
		stopPolling: stopProjectPolling,
	} = useQuery(GET_PROJECT, {
		variables: { slug: projectSlug },
		fetchPolicy: "cache-first",
		skip: !projectSlug,
	});
	const project = projectData?.project;

	// Open Research: fetch the source directly by id; PDF: skip the call.
	const {
		data: sourceData,
		loading: sourceLoading,
		error: sourceError,
	} = useQuery(GET_OPEN_RESEARCH_SOURCE, {
		variables: { id: decodedSourceId },
		fetchPolicy: "cache-first",
		skip: type !== "open-research" || !decodedSourceId,
	});

	// Open Research: the "Mogelijke effecten" are verbatim statements the ai-service
	// extracts from this source, filtered for project relevance. PDFs carry their
	// statements on the uploaded document, so this query is open-research only.
	const {
		data: effectsData,
		loading: effectsLoading,
		error: effectsError,
	} = useQuery(GET_OPEN_RESEARCH_SOURCE_EFFECTS, {
		variables: { projectId: project?.id, sourceId: decodedSourceId, themeSlug },
		fetchPolicy: "cache-first",
		skip: type !== "open-research" || !project?.id || !decodedSourceId,
	});

	const navigationSource = location.state?.source
		? { ...location.state.source, metadata: parseMetadata(location.state.source.metadata) }
		: null;

	// Resolve the source into a shared shape regardless of type.
	const source = useMemo(() => {
		if (type === "open-research") {
			const fetched = sourceData?.openResearchSource;
			if (fetched) return normaliseOpenResearchSource(fetched);
			if (navigationSource && sourceMatchesId(navigationSource, decodedSourceId)) {
				return normaliseOpenResearchSource(navigationSource);
			}
			return null;
		}
		// pdf
		const document = project?.uploadedDocuments?.find((item) => item.id === documentId);
		return document ? normalisePdfDocument(document) : null;
	}, [type, sourceData, navigationSource, decodedSourceId, project, documentId]);
	const sourceDocumentStatus = source?.document?.analysisStatus;

	useEffect(() => {
		if (type === "pdf" && ["PENDING", "RUNNING"].includes(sourceDocumentStatus)) {
			startProjectPolling(3000);
			return () => stopProjectPolling?.();
		}
		stopProjectPolling?.();
	}, [type, sourceDocumentStatus, startProjectPolling, stopProjectPolling]);

	const projectThemes = project?.themes ?? [];
	const theme = projectThemes.find((item) => item.slug === themeSlug);

	const effects = useMemo(() => {
		if (!source) return [];
		if (type === "pdf") {
			return buildUploadedDocumentEffects({ document: source.document });
		}
		return buildOpenResearchEffects({
			statements: effectsData?.openResearchSourceEffects,
			sourceKind: source.sourceKind,
			sourceId: source.sourceId,
		});
	}, [source, type, effectsData]);

	const usedSourceEffectKeys = useMemo(() => {
		const argumentKeys = (project?.themes ?? [])
			.flatMap((item) => item.arguments ?? [])
			.map((argument) => getSourceEffectKey(argument.sourceEffect));
		const draftKeys = (project?.aiDraftEffects ?? []).map((draft) => getSourceEffectKey(draft.sourceEffect));
		const keys = [...argumentKeys, ...draftKeys].filter(Boolean);
		return new Set(keys);
	}, [project]);

	function isEffectUsed(effect) {
		return usedSourceEffectKeys.has(getSourceEffectKey(effect.sourceEffect));
	}

	const availableIndexes = effects
		.map((effect, index) => (isEffectUsed(effect) ? null : index))
		.filter((index) => index !== null);
	const allSelected =
		availableIndexes.length > 0 && availableIndexes.every((index) => selectedIndexes.includes(index));
	const selectedEffects = selectedIndexes
		.map((index) => effects[index])
		.filter((effect) => effect && !isEffectUsed(effect));
	const documentAnalysisStatus = source?.document?.analysisStatus;
	const emptyEffectsMessage = (() => {
		if (effects.length > 0) return null;
		if (type === "open-research") {
			if (effectsLoading) return "De AI zoekt naar mogelijke effecten in deze bron...";
			if (effectsError) return "De mogelijke effecten konden niet worden geladen. Probeer het later opnieuw.";
			return "Er zijn geen mogelijke effecten gevonden in deze bron.";
		}
		// pdf
		if (documentAnalysisStatus === "PENDING" || documentAnalysisStatus === "RUNNING") {
			return "De AI-analyse van dit document loopt nog.";
		}
		if (documentAnalysisStatus === "FAILED") {
			return source.document?.analysisError || "De AI-analyse van dit document is niet gelukt.";
		}
		return "Er zijn geen mogelijke effecten gevonden in dit document.";
	})();

	const [createDraftEffects, { loading: addingResults }] = useMutation(CREATE_PROJECT_AI_DRAFT_EFFECTS, {
		refetchQueries: [GET_PROJECT],
		awaitRefetchQueries: true,
	});

	function toggleSelect(index) {
		if (isEffectUsed(effects[index])) return;
		setSelectedIndexes((current) =>
			current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
		);
	}

	function toggleSelectAll() {
		setSelectedIndexes(allSelected ? [] : availableIndexes);
	}

	function goBack() {
		// Source pages are reached from the project-level AI dashboard, so return there.
		navigate(`/project/${projectSlug}/ai-dashboard`);
	}

	function returnToProductPage(event) {
		event.preventDefault();
		navigate(`/project/${projectSlug}`, { state: { productTourPhase: "aiEffects" } });
	}

	// Open the dialog where the user picks the destination theme for the selected
	// results. The theme used to default to the first project theme; now the user
	// chooses it explicitly so effects no longer all land under "subjectief welzijn".
	function openAddDialog() {
		if (!project || selectedEffects.length === 0) return;
		showCard(AddToScanDialog, "", undefined, {
			count: selectedEffects.length,
			onConfirm: addSelectedResults,
		});
	}

	// Throws on failure so AddToScanDialog can surface the error and stay open.
	// Drafts are project-level (themeless); the user picks a theme later, when
	// converting a draft into an effect.
	async function addSelectedResults() {
		setSubmitError("");
		setSubmitMessage("");
		try {
			if (selectedEffects.length === 0) return;
			const sourceName = source.sourceName;
			await createDraftEffects({
				variables: {
					projectId: project.id,
					input: selectedEffects.map((effect) => {
						const aiProposal = formatAiProposal(effect, sourceName);
						return {
							title: effect.text.slice(0, 90),
							explanation: effect.text,
							sentiment: ArgumentSentiment.Neutral,
							discussionPoint: false,
							timeFrame: [],
							location: [],
							source: {
								type: source.argumentSourceType,
								// The backend reconstructs the canonical URL from sourceEffect.sourceId.
								// Sending it here trips the S-ADS WAF RFI rule (off-domain https://).
								link: null,
							},
							sourceTitle: sourceName,
							sourceEffect: effect.sourceEffect,
							generatedByAi: true,
							aiProposal,
							importance: ArgumentImportance.Low,
						};
					}),
				},
			});
			setSelectedIndexes([]);
			setSubmitMessage("De geselecteerde resultaten staan klaar in de scan.");
		} catch {
			setSubmitError("De geselecteerde resultaten konden niet aan de scan worden toegevoegd.");
		}
	}

	// --- loading / error ---------------------------------------------------
	const isLoading = projectLoading || (type === "open-research" && sourceLoading);
	if (isLoading) {
		return (
			<div className="source-page">
				<main className="source-page-main">
					<Paragraph>Bron laden...</Paragraph>
				</main>
			</div>
		);
	}

	// PDF requires both project AND document to be present
	if (type === "pdf" && (!project || !source)) {
		return (
			<div className="source-page">
				<Alert heading="Niet gelukt" headingLevel={2} severity="error">
					<Paragraph>Fout tijdens het laden van het geüploade document.</Paragraph>
				</Alert>
			</div>
		);
	}

	// Open Research requires only the source; project is optional context
	if (type === "open-research" && (sourceError || !source)) {
		return (
			<div className="source-page">
				<Alert heading="Niet gelukt" headingLevel={2} severity="error">
					<Paragraph>Fout tijdens het laden van de bron.</Paragraph>
					{process.env.NODE_ENV === "development" && (
						<Paragraph size="small">
							Debug: {sourceError?.message || "bron niet gevonden"} voor bron{" "}
							{decodedSourceId || "(geen id)"}.
						</Paragraph>
					)}
				</Alert>
			</div>
		);
	}

	// --- sidebar data ------------------------------------------------------
	const metadata = source.metadata ?? {};
	const collection =
		getMetadataValue(metadata, ["collection", "collectionName", "dataset", "source", "sourceName"]) ??
		"Open Research";

	let keywords;
	if (type === "open-research") {
		keywords = [
			...getMetadataList(metadata, ["keywords", "tags", "topics", "trefwoorden"]),
			source.raw?.sourceType,
		].filter(Boolean);
	} else {
		keywords = [source.document?.keyword, theme?.name, "Eigen document"].filter(Boolean);
	}
	const uniqueKeywords = [...new Set(keywords)];
	const resultTabButtons = [
		<Tabs.Button key="effects" aria-controls="source-page-effects-tab">
			Mogelijke effecten
		</Tabs.Button>,
	];

	if (type === "open-research") {
		resultTabButtons.push(
			<Tabs.Button key="more" aria-controls="source-page-more-tab">
				Meer zoals dit
			</Tabs.Button>
		);
	}

	return (
		<div className="source-page">
			<header className="source-page-header" aria-label={source.ariaLabel}>
				<div className="source-page-header__title">
					<Heading level={1} size="level-5">
						{project?.name ?? "Open Research"}
					</Heading>
				</div>
				<div className="source-page-header__nav">
					<a
						className="source-page-back-link"
						href="#terug"
						onClick={(event) => {
							event.preventDefault();
							goBack();
						}}
					>
						<Icon name="arrow-left-blue" size={16} />
						<span>Terug</span>
					</a>
					<nav className="source-page-breadcrumb" aria-label="Broodkruimelpad">
						<span>Thema's</span>
						<span aria-hidden="true">›</span>
						<span>{source.breadcrumbLabel}</span>
						<span aria-hidden="true">›</span>
						<strong>{source.title}</strong>
					</nav>
				</div>
			</header>

			<main className="source-page-main">
				<section className="source-page-intro" aria-labelledby="source-page-title">
					<div className="source-page-intro__left">
						<Paragraph size="small">{source.dateLabel}</Paragraph>
						<Heading id="source-page-title" level={2} size="level-2">
							{source.title}
						</Heading>
						{source.content && <Paragraph>{source.content}</Paragraph>}
						{source.sourceUrl ? (
							<a
								className="source-page-text-button"
								href={source.sourceUrl}
								target="_blank"
								rel="noreferrer"
							>
								<Icon name="chevron-right" size={16} />
								<span>Lees bron</span>
							</a>
						) : (
							<button type="button" className="source-page-text-button">
								<Icon name="chevron-down" size={16} />
								Lees meer
							</button>
						)}
					</div>

					<aside className="source-page-sidebar" aria-label="Broninformatie">
						{type === "open-research" && <AuthorCard source={source} />}
						{type === "open-research" && (
							<div className="source-page-sidebar__section">
								<Heading level={3} size="level-5">
									Onderdeel van:
								</Heading>
								<p>{collection}</p>
							</div>
						)}
						{uniqueKeywords.length > 0 && (
							<div className="source-page-sidebar__section">
								<Heading level={3} size="level-5">
									Trefwoorden:
								</Heading>
								<div className="source-page-keywords__list">
									{uniqueKeywords.map((keyword) => (
										<span className="source-page-keyword" key={keyword}>
											{keyword}
										</span>
									))}
								</div>
							</div>
						)}
					</aside>
				</section>

				<section className="source-page-results" aria-labelledby="source-page-results-title">
					<Tabs>
						<Tabs.List>{resultTabButtons}</Tabs.List>

						<Tabs.Panel id="source-page-effects-tab">
							<div className="source-page-results__toolbar">
								<button
									type="button"
									className="source-page-ai-info"
									onClick={() => setShowAiInfo((value) => !value)}
									aria-expanded={showAiInfo}
								>
									<Icon name="ai-wand-stars" size={16} />
									<span>
										Quotes gevonden door AI, niet door AI geschreven. Lees meer over hoe dit werkt.
									</span>
									<Icon name={showAiInfo ? "chevron-up" : "chevron-down"} size={16} />
								</button>
								<div className="source-page-results__actions">
									<Button
										variant="secondary"
										onClick={toggleSelectAll}
										disabled={availableIndexes.length === 0}
									>
										{allSelected ? "Selectie wissen" : "Selecteer alles"}
									</Button>
									<Button
										variant="primary"
										onClick={openAddDialog}
										disabled={!project || selectedEffects.length === 0 || addingResults}
									>
										Resultaten naar de scan
									</Button>
								</div>
							</div>
							{showAiInfo && (
								<Paragraph className="source-page-ai-info__body">
									De AI zoekt tekstfragmenten die kunnen wijzen op effecten. Controleer de resultaten
									voordat je ze toevoegt aan de scan.
								</Paragraph>
							)}
							{submitError && (
								<Alert heading="Niet gelukt" headingLevel={3} severity="error">
									<Paragraph>{submitError}</Paragraph>
								</Alert>
							)}
							{submitMessage && (
								<Alert heading="Toegevoegd" headingLevel={3}>
									<Paragraph>{submitMessage}</Paragraph>
									<Link href={`#/project/${projectSlug}`} onClick={returnToProductPage}>
										Terug naar de productpagina
									</Link>
								</Alert>
							)}
							{emptyEffectsMessage ? (
								<div className="source-page-empty">
									<Paragraph>{emptyEffectsMessage}</Paragraph>
								</div>
							) : (
								<div className="source-page-cards">
									{effects.map((effect, index) => (
										<SourceEffectCard
											key={`${effect.effectId}-${index}`}
											effect={effect}
											index={index}
											selected={selectedIndexes.includes(index)}
											used={isEffectUsed(effect)}
											onSelect={() => toggleSelect(index)}
										/>
									))}
								</div>
							)}
						</Tabs.Panel>

						{type === "open-research" && (
							<Tabs.Panel id="source-page-more-tab">
								<div className="source-page-empty">
									<Paragraph>
										Deze functie is nog niet beschikbaar. Binnenkort vind je hier bronnen die lijken
										op deze bron.
									</Paragraph>
								</div>
							</Tabs.Panel>
						)}
					</Tabs>
				</section>
			</main>
		</div>
	);
}
