import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";

import {
	Alert,
	Button,
	Heading,
	Paragraph,
} from "@amsterdam/design-system-react";
import { usePopup } from "@shared/ui/context/PopupContext";

import Icon from "../../components/common/Icon";
import { GET_PROJECT, GET_PROJECT_AI_ANALYSIS } from "../../graphql/queries";
import { START_PROJECT_AI_ANALYSIS } from "../../graphql/mutations";

import ResultsTabs from "./components/ResultsTabs";
import EditSearchQuestionDialog from "./components/EditSearchQuestionDialog";
import SearchQuestionExplanation from "./components/SearchQuestionExplanation";
import UploadDocumentCard from "../../components/custom/Cards/UploadDocumentCard";

import "./index.scss";

function GhostBar({ className = "" }) {
	return <span className={`ai-dashboard-ghost-bar ${className}`} aria-hidden="true" />;
}

function GhostSourceCard() {
	return (
		<article className="ai-dashboard-source-card ai-dashboard-ghost-card" aria-hidden="true">
			<div className="ai-dashboard-source-card__main">
				<GhostBar className="ai-dashboard-ghost-bar--date" />
				<GhostBar className="ai-dashboard-ghost-bar--title" />
				<GhostBar className="ai-dashboard-ghost-bar--title-short" />
				<div className="ai-dashboard-ghost-lines">
					<GhostBar />
					<GhostBar />
					<GhostBar className="ai-dashboard-ghost-bar--line-short" />
				</div>
			</div>
			<div className="ai-dashboard-source-card__footer">
				<GhostBar className="ai-dashboard-ghost-bar--meta" />
				<GhostBar className="ai-dashboard-ghost-bar--link" />
			</div>
		</article>
	);
}

function GhostExpertCard() {
	return (
		<article className="ai-dashboard-expert-card ai-dashboard-ghost-card" aria-hidden="true">
			<div className="ai-dashboard-expert-card__main">
				<div className="ai-dashboard-expert-card__profile">
					<span className="ai-dashboard-ghost-avatar" />
					<div className="ai-dashboard-expert-card__identity">
						<GhostBar className="ai-dashboard-ghost-bar--name" />
						<GhostBar className="ai-dashboard-ghost-bar--organisation" />
					</div>
				</div>
				<div className="ai-dashboard-ghost-lines">
					<GhostBar />
					<GhostBar />
					<GhostBar className="ai-dashboard-ghost-bar--line-short" />
				</div>
			</div>
			<div className="ai-dashboard-expert-card__footer">
				<GhostBar className="ai-dashboard-ghost-bar--label" />
				<div className="ai-dashboard-ghost-chip-row">
					<GhostBar className="ai-dashboard-ghost-bar--chip" />
					<GhostBar className="ai-dashboard-ghost-bar--chip-wide" />
				</div>
				<GhostBar className="ai-dashboard-ghost-bar--link" />
			</div>
		</article>
	);
}

function GhostDiscussionPoint() {
	return (
		<article className="ai-dashboard-discussion-point ai-dashboard-ghost-card" aria-hidden="true">
			<div className="ai-dashboard-discussion-point__content">
				<GhostBar className="ai-dashboard-ghost-bar--label-pill" />
				<GhostBar className="ai-dashboard-ghost-bar--discussion-title" />
				<div className="ai-dashboard-ghost-lines">
					<GhostBar />
					<GhostBar className="ai-dashboard-ghost-bar--line-short" />
				</div>
				<div className="ai-dashboard-ghost-chip-row ai-dashboard-ghost-chip-row--themes">
					<GhostBar className="ai-dashboard-ghost-bar--themes-label" />
					<GhostBar className="ai-dashboard-ghost-bar--chip-wide" />
					<GhostBar className="ai-dashboard-ghost-bar--chip" />
				</div>
			</div>
		</article>
	);
}

// Phase keys mirror the ai-service `_analysis_phases` contract. Labels and
// descriptions live here so copy stays with the UI (Heldere Taal, je-vorm).
const ANALYSIS_PHASES = [
	{ key: "prepare", label: "Zoekvraag voorbereiden", description: "We zetten je projectintake om in een zoekvraag." },
	{ key: "sources", label: "Bronnen zoeken", description: "We doorzoeken openresearch.amsterdam op relevante bronnen." },
	{ key: "authors", label: "Experts vinden", description: "We zoeken de experts achter deze bronnen." },
	{ key: "talking_points", label: "Bespreekpunten afleiden", description: "We bundelen terugkerende inzichten tot bevindingen." },
	{ key: "finalize", label: "Resultaten klaarzetten", description: "We zetten alles overzichtelijk klaar in je dashboard." },
];

function AIDashboardProgress({ phases }) {
	const statusByKey = Object.fromEntries((phases ?? []).map((phase) => [phase.key, phase.status]));
	const steps = ANALYSIS_PHASES.map((phase) => ({ ...phase, status: statusByKey[phase.key] ?? "PENDING" }));
	const doneCount = steps.filter((step) => step.status === "DONE").length;

	return (
		<section className="ai-dashboard-progress" role="status" aria-live="polite">
			<div className="ai-dashboard-progress__intro">
				<p className="ai-dashboard-progress__title">We verkennen Open Research</p>
				<p className="ai-dashboard-progress__subtitle">
					Dit duurt meestal 1 tot 5 minuten. Blijf op dit tabblad wachten.
				</p>
			</div>

			<ol className="ai-dashboard-progress__steps">
				{steps.map((step, index) => (
					<li
						key={step.key}
						className={`ai-dashboard-progress__step ai-dashboard-progress__step--${step.status.toLowerCase()}`}
					>
						<span className="ai-dashboard-progress__marker" aria-hidden="true">
							{step.status === "DONE" ? (
								<Icon name="checkmark" size={16} />
							) : (
								<span className="ai-dashboard-progress__dot">{index + 1}</span>
							)}
						</span>
						<div className="ai-dashboard-progress__body">
							<p className="ai-dashboard-progress__step-label">{step.label}</p>
							<p className="ai-dashboard-progress__step-description">{step.description}</p>
							{step.status === "RUNNING" && (
								<span className="ai-dashboard-progress__bar" aria-hidden="true">
									<span className="ai-dashboard-progress__bar-fill" />
								</span>
							)}
						</div>
					</li>
				))}
			</ol>

			<p className="ai-dashboard-progress__count">
				Stap {Math.min(doneCount + 1, steps.length)} van {steps.length}
			</p>
		</section>
	);
}

function AIDashboardResultsGhost({ message }) {
	return (
		<div className="ai-dashboard-results-ghost" role="status" aria-live="polite" aria-label={message}>
			<div className="ai-dashboard-ghost-status">
				<span className="ai-dashboard-ghost-status__mark" aria-hidden="true" />
				<div className="ai-dashboard-ghost-status__text">
					<p className="ai-dashboard-ghost-status__title">{message}</p>
					<p className="ai-dashboard-ghost-status__description">We zetten de resultaten voor je klaar.</p>
				</div>
			</div>

			<div className="ai-dashboard-ghost-tabs" aria-hidden="true">
				<GhostBar className="ai-dashboard-ghost-bar--tab-active" />
				<GhostBar className="ai-dashboard-ghost-bar--tab" />
				<GhostBar className="ai-dashboard-ghost-bar--tab-wide" />
			</div>

			<div className="ai-dashboard-tab-header" aria-hidden="true">
				<div className="ai-dashboard-tab-header__meta">
					<GhostBar className="ai-dashboard-ghost-bar--count" />
					<GhostBar className="ai-dashboard-ghost-bar--timestamp" />
				</div>
				<div className="ai-dashboard-tab-header__actions">
					<GhostBar className="ai-dashboard-ghost-button" />
					<GhostBar className="ai-dashboard-ghost-button ai-dashboard-ghost-button--wide" />
				</div>
			</div>

			<div className="ai-dashboard-ghost-section" aria-hidden="true">
				<div className="ai-dashboard-experts-grid">
					<GhostExpertCard />
					<GhostExpertCard />
					<GhostExpertCard />
				</div>
				<div className="ai-dashboard-sources-grid">
					<GhostSourceCard />
					<GhostSourceCard />
					<GhostSourceCard />
				</div>
				<GhostDiscussionPoint />
			</div>
		</div>
	);
}

function AIDashboardPageGhost() {
	return (
		<div className="ai-dashboard ai-dashboard--ghost" aria-busy="true">
			<header className="ai-dashboard-header" aria-label="AI-dashboard laden">
				<div className="ai-dashboard-header-title">
					<GhostBar className="ai-dashboard-ghost-bar--header-title" />
				</div>
				<div className="ai-dashboard-header-back">
					<GhostBar className="ai-dashboard-ghost-bar--back-link" />
				</div>
			</header>
			<main className="ai-dashboard-main">
				<div className="ai-dashboard-column">
					<div className="ai-dashboard-block ai-dashboard-ai-info" aria-hidden="true">
						<GhostBar className="ai-dashboard-ghost-bar--ai-info" />
					</div>
					<div className="ai-dashboard-inspiratie" aria-hidden="true">
						<GhostBar className="ai-dashboard-ghost-bar--intro-label" />
						<GhostBar className="ai-dashboard-ghost-bar--intro-question" />
					</div>
					<div className="ai-dashboard-actions" aria-hidden="true">
						<GhostBar className="ai-dashboard-ghost-bar--action" />
						<GhostBar className="ai-dashboard-ghost-bar--action-wide" />
					</div>
					<section className="ai-dashboard-results" aria-label="AI-dashboard laden">
						<div className="ai-dashboard-results-row" aria-hidden="true">
							<GhostBar className="ai-dashboard-ghost-bar--results-heading" />
						</div>
						<div className="ai-dashboard-results-body">
							<AIDashboardResultsGhost message="Dashboard laden" />
						</div>
					</section>
				</div>
			</main>
		</div>
	);
}

export default function AIDashboard() {
	const { projectSlug } = useParams();
	const navigate = useNavigate();
	const { showCard } = usePopup();

	const [showAiInfo, setShowAiInfo] = useState(false);

	const {
		data: projectData,
		loading: projectLoading,
		error: projectError,
		startPolling: startProjectPolling,
		stopPolling: stopProjectPolling,
	} = useQuery(GET_PROJECT, {
		variables: { slug: projectSlug },
		fetchPolicy: "cache-first",
	});

	const project = projectData?.project;
	// The verkenning is project-level; uploads stay theme-scoped in the backend,
	// so default an upload to the project's first theme.
	const uploadTheme = project?.themes?.[0];
	const uploadedDocuments = project?.uploadedDocuments ?? [];
	const hasRunningUploadedDocuments = uploadedDocuments.some((document) =>
		["PENDING", "RUNNING"].includes(document.analysisStatus),
	);

	const {
		data: analysisData,
		loading: analysisLoading,
		error: analysisError,
		startPolling,
		stopPolling,
	} = useQuery(GET_PROJECT_AI_ANALYSIS, {
		variables: { projectId: project?.id },
		skip: !project?.id,
	});

	const aiAnalysis = analysisData?.projectAiAnalysis;
	const status = aiAnalysis?.status ?? "NOT_STARTED";

	useEffect(() => {
		if (status === "RUNNING") {
			// Poll briskly so the phase stepper steps in near-real time.
			startPolling(2000);
			return () => stopPolling?.();
		}
		stopPolling?.();
	}, [status, startPolling, stopPolling]);

	useEffect(() => {
		if (hasRunningUploadedDocuments) {
			startProjectPolling(3000);
			return () => stopProjectPolling?.();
		}
		stopProjectPolling?.();
	}, [hasRunningUploadedDocuments, startProjectPolling, stopProjectPolling]);

	const [startAnalysis, { loading: startLoading }] = useMutation(START_PROJECT_AI_ANALYSIS, {
		refetchQueries: [
			{ query: GET_PROJECT_AI_ANALYSIS, variables: { projectId: project?.id } },
		],
		awaitRefetchQueries: false,
	});

	function handleStartAnalysis() {
		startAnalysis({ variables: { projectId: project.id } });
	}

	function handleOpenEditDialog() {
		const activeQuestion = aiAnalysis?.searchQuestion ?? aiAnalysis?.generatedQuestion ?? "";
		showCard(EditSearchQuestionDialog, "", () => {}, {
			projectId: project.id,
			currentQuestion: activeQuestion,
		});
	}

	function handleOpenUploadDialog() {
		showCard(UploadDocumentCard, "", () => {}, { project, theme: uploadTheme });
	}

	// Only ghost the page while there is no data yet. Apollo v4 flips `loading`
	// on every poll tick (notifyOnNetworkStatusChange defaults to true), and the
	// project is polled while an uploaded document is processing — unmounting
	// the page here would reset tab and scroll state every few seconds.
	if (projectLoading && !project) {
		return <AIDashboardPageGhost />;
	}

	if (projectError || !project) {
		return (
			<div className="ai-dashboard">
				<Alert heading="Niet gelukt" headingLevel={2} severity="error">
					<Paragraph>Fout tijdens het laden van het project.</Paragraph>
				</Alert>
			</div>
		);
	}

	const activeQuestion = aiAnalysis?.searchQuestion ?? aiAnalysis?.generatedQuestion ?? "";
	const aiSourceEffects = (project.aiDraftEffects ?? []).filter(
		(draft) => draft.sourceEffect?.key,
	);
	const allAiSourceEffects = [
		...(project.aiDraftEffects ?? []),
		...(project.themes ?? []).flatMap((item) => item.arguments ?? []),
	].filter((effect) => effect.generatedByAi && effect.sourceEffect?.key);

	return (
		<div className="ai-dashboard">
			{/* Two-row header */}
			<header className="ai-dashboard-header" aria-label="AI-ondersteunde verkenning">
				<div className="ai-dashboard-header-title">{project.name}</div>
				<div className="ai-dashboard-header-back">
					<a
						href={`/project/${projectSlug}`}
						onClick={(e) => { e.preventDefault(); navigate(`/project/${projectSlug}`); }}
						className="ai-dashboard-back-link"
					>
						<Icon name="arrow-left-blue" size={16} />
						<span>Terug</span>
					</a>
				</div>
			</header>

			<main className="ai-dashboard-main">
				<div className="ai-dashboard-column">
					{/* Block 1: AI verkenning explainer (purple) */}
					<div className="ai-dashboard-block ai-dashboard-ai-info">
						<button
							type="button"
							className="ai-dashboard-collapsible-row ai-dashboard-collapsible-row--ai"
							onClick={() => setShowAiInfo((v) => !v)}
							aria-expanded={showAiInfo}
						>
							<Icon name="ai-wand-stars" size={20} />
							<span className="ai-dashboard-ai-text">
								Dit is een AI-ondersteunde verkenning, lees meer over hoe dit werkt.
							</span>
							<Icon name={showAiInfo ? "chevron-up" : "chevron-down"} size={16} />
						</button>
						{showAiInfo && (
							<div className="ai-dashboard-block-body">
								<Paragraph>
									{aiAnalysis?.methodExplanation ??
										"De AI-verkenning doorzoekt Open Research naar perspectieven, experts en bespreekpunten die relevant zijn voor dit thema. De resultaten zijn een startpunt voor je eigen beoordeling, geen vervanging ervan."}
								</Paragraph>
							</div>
						)}
					</div>

					{/* Inspiratie heading: bold label + non-bold question */}
					<div className="ai-dashboard-inspiratie">
						<p className="ai-dashboard-inspiratie-label">Hier vind je inspiratie voor:</p>
						<p className="ai-dashboard-inspiratie-question">{activeQuestion || "—"}</p>
					</div>

					{/* Centered search-question action */}
					<div className="ai-dashboard-actions">
						<button
							type="button"
							className="ai-dashboard-text-button"
							onClick={handleOpenEditDialog}
						>
							<Icon name="edit" size={16} />
							Zoekvraag aanpassen
						</button>
					</div>

					<SearchQuestionExplanation onEdit={handleOpenEditDialog} />

					{/* Results section */}
					<section className="ai-dashboard-results" aria-labelledby="results-heading">
						<div className="ai-dashboard-results-row">
							<Heading id="results-heading" level={2} size="level-3">
								Resultaten van openresearch.amsterdam
							</Heading>
						</div>

						<div className="ai-dashboard-results-body">
								{analysisLoading && !aiAnalysis && (
									<AIDashboardResultsGhost message="Analyse laden" />
								)}

								{analysisError && (
									<Alert heading="Niet gelukt" headingLevel={3} severity="error">
										<Paragraph>Fout tijdens het laden van de analyse.</Paragraph>
									</Alert>
								)}

								{!analysisLoading && !analysisError && status === "NOT_STARTED" && (
									<Alert heading="Verkenning nog niet gestart" headingLevel={3} severity="info">
										<Paragraph>
											Start de AI-ondersteunde verkenning om resultaten te zien van Open Research.
										</Paragraph>
										<Button
											variant="primary"
											onClick={handleStartAnalysis}
											disabled={startLoading}
										>
											{startLoading ? "Bezig met starten…" : "Start verkenning"}
										</Button>
									</Alert>
								)}

								{status === "RUNNING" && (
									<AIDashboardProgress phases={aiAnalysis?.progress?.phases} />
								)}

								{status === "FAILED" && (
									<Alert heading="Verkenning mislukt" headingLevel={3} severity="error">
										<Paragraph>{aiAnalysis?.errorMessage ?? "Er is iets misgegaan."}</Paragraph>
										<Button
											variant="primary"
											onClick={handleStartAnalysis}
											disabled={startLoading}
										>
											{startLoading ? "Bezig met starten…" : "Opnieuw proberen"}
										</Button>
									</Alert>
								)}

								{status === "COMPLETED" && aiAnalysis && (
									<ResultsTabs
										experts={aiAnalysis.experts ?? []}
										sources={aiAnalysis.sources ?? []}
										talkingPoints={aiAnalysis.talkingPoints ?? []}
										uploadedDocuments={uploadedDocuments}
										usedEffects={aiSourceEffects}
										allUsedEffects={allAiSourceEffects}
										projectThemes={project.themes ?? []}
										completedAt={aiAnalysis.completedAt}
										projectId={project.id}
										projectSlug={projectSlug}
										onUploadDocument={handleOpenUploadDialog}
									/>
								)}
						</div>
					</section>
				</div>
			</main>
		</div>
	);
}
