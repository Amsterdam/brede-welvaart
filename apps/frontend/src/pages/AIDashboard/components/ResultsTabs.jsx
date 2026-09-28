import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";
import { Avatar, Button, Checkbox, Heading, Pagination, Paragraph, SearchField, Tabs } from "@amsterdam/design-system-react";

import { usePopup } from "@shared/ui/context/PopupContext";

import Icon from "../../../components/common/Icon";
import TextWithMention from "../../../components/custom/Mention/TextWithMention";
import DeleteDocumentCard from "../../../components/custom/Cards/DeleteDocumentCard";
import { GET_OPEN_RESEARCH_SOURCE_EFFECTS, GET_PROJECT } from "../../../graphql/queries";
import { DELETE_PROJECT_AI_DRAFT_EFFECT } from "../../../graphql/mutations";
import { buildOpenResearchEffects, buildUploadedDocumentEffects, getSourceEffectKey } from "../../Source/effects";

const DEFAULT_PAGE_SIZE = 10;
const CONSISTENT_FINDINGS_DESCRIPTION =
	"Deze bevindingen worden in meerdere onderzoeken gevonden. Ze staan hier als inspiratie. Gebruik de optie 'Zoekvraag aanpassen' om deze bevindingen verder te onderzoeken en er bronnen bij te zoeken zodat je ze kunt meenemen naar de scan.";
const AVATAR_COLORS = ["azure", "green", "lime", "magenta", "orange", "yellow"];
const SORT_OPTIONS = {
	experts: [
		{ value: "relevance-desc", label: "Relevantie" },
		{ value: "name-asc", label: "Naam A-Z" },
		{ value: "organisation-asc", label: "Organisatie A-Z" },
	],
	sources: [
		{ value: "relevance-desc", label: "Relevantie" },
		{ value: "date-desc", label: "Datum nieuw-oud" },
		{ value: "title-asc", label: "Titel A-Z" },
		{ value: "type-asc", label: "Type A-Z" },
	],
	discussionPoints: [
		{ value: "default", label: "Standaard" },
		{ value: "topic-asc", label: "Titel A-Z" },
		{ value: "themes-desc", label: "Meeste thema's" },
	],
};

function usePagination(items, pageSize = DEFAULT_PAGE_SIZE) {
	const [page, setPage] = useState(1);
	const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
	const activePage = Math.min(page, totalPages);
	const slice = items.slice((activePage - 1) * pageSize, activePage * pageSize);
	return { page: activePage, setPage, totalPages, slice };
}

// ADS Pagination is link-based; wrap it so clicks update local state instead of navigating.
function ClientPagination({ page, totalPages, onPageChange, className }) {
	function PaginationLink({ href, children, ...rest }) {
		const pageNum = parseInt(href?.replace("#page-", "") ?? "", 10);
		return (
			<a
				{...rest}
				href={href}
				onClick={(e) => {
					e.preventDefault();
					if (!isNaN(pageNum)) onPageChange(pageNum);
				}}
			>
				{children}
			</a>
		);
	}

	return (
		<Pagination
			className={className}
			page={page}
			totalPages={totalPages}
			linkTemplate={(p) => `#page-${p}`}
			linkComponent={PaginationLink}
			previousLabel="Vorige"
			nextLabel="Volgende"
		/>
	);
}

// "Dr. Esra van Dijk" → "EV". Skips academic titles.
function getExpertInitials(name) {
	if (!name) return "?";
	const titlesRx = /^(dr|drs|prof|ir|ing|mr|mw|mevr|dhr)\.?$/i;
	const tokens = name.split(/\s+/).filter((t) => t && !titlesRx.test(t));
	if (tokens.length === 0) return name.slice(0, 2).toUpperCase();
	const first = tokens[0][0];
	const last = tokens.length > 1 ? tokens[tokens.length - 1][0] : "";
	return (first + last).toUpperCase();
}

function pickAvatarColor(seed) {
	const key = String(seed ?? "");
	let h = 0;
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
	return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function getExpertTags(expert) {
	const tags = expert.metadata?.expertise;
	return Array.isArray(tags) ? tags.filter(Boolean).map(String) : [];
}

function getExpertBio(expert) {
	if (expert.description) return expert.description;
	const tags = getExpertTags(expert);
	return tags.length > 0 ? tags.join(", ") : null;
}

function getExpertOpenResearchUrl(expert) {
	const metadata = expert.metadata ?? {};
	const explicitUrl = metadata.openResearchUrl ?? metadata.openresearch_url ?? metadata.profileUrl ?? metadata.url;
	if (explicitUrl) return String(explicitUrl);
	if (/^\d+$/.test(String(expert.externalId ?? ""))) {
		return `https://openresearch.amsterdam/nl/page/${expert.externalId}`;
	}
	return null;
}

function getSourceKey(source) {
	return source.externalId ?? source.url ?? source.doc_id ?? source.title;
}

function getOpenResearchSourceId(source) {
	return source.externalId ?? source.docId ?? source.doc_id ?? source.id ?? source.url ?? source.title;
}

function getOpenResearchRouteId(source) {
	const key = getSourceKey(source);
	const idFromKey = String(key ?? "").match(/openresearch:(\d+)/i)?.[1];
	const idFromUrl = String(source.url ?? "").match(/\/page\/(\d+)/i)?.[1];
	return idFromKey ?? idFromUrl ?? key;
}

function toThemeSlug(theme) {
	return String(theme ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.trim()
		.replace(/&/g, "en")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function normalizedText(value) {
	return String(value ?? "").toLowerCase();
}

function getItemSearchText(item) {
	return [
		item.name,
		item.organisation,
		item.description,
		item.title,
		item.content,
		item.sourceType,
		item.topic,
		...(item.themes ?? []),
		...(item.metadata?.expertise ?? []),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
}

function compareText(left, right) {
	return String(left ?? "").localeCompare(String(right ?? ""), "nl-NL", { sensitivity: "base" });
}

function sortItems(items, sortKey) {
	const sorted = [...items];

	switch (sortKey) {
		case "name-asc":
			return sorted.sort((a, b) => compareText(a.name, b.name));
		case "organisation-asc":
			return sorted.sort((a, b) => compareText(a.organisation, b.organisation));
		case "date-desc":
			return sorted.sort((a, b) => new Date(b.publishedAt ?? 0) - new Date(a.publishedAt ?? 0));
		case "title-asc":
			return sorted.sort((a, b) => compareText(a.title, b.title));
		case "type-asc":
			return sorted.sort((a, b) => compareText(a.sourceType, b.sourceType));
		case "topic-asc":
			return sorted.sort((a, b) => compareText(a.topic, b.topic));
		case "themes-desc":
			return sorted.sort((a, b) => (b.themes?.length ?? 0) - (a.themes?.length ?? 0));
		case "relevance-desc":
			return sorted.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
		default:
			return sorted;
	}
}

function formatTimestamp(date) {
	if (!date) return null;
	const d = new Date(date);
	if (isNaN(d.getTime())) return null;
	const datePart = d.toLocaleDateString("nl-NL", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
	const timePart = d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
	return `Gegevens opgehaald op ${datePart} om ${timePart} uur`;
}

function formatUploadDate(date) {
	if (!date) return "Geüpload op onbekende datum";
	const d = new Date(date);
	if (isNaN(d.getTime())) return "Geüpload op onbekende datum";
	return `Geüpload op ${d.toLocaleDateString("nl-NL", {
		day: "numeric",
		month: "long",
		year: "numeric",
	})}`;
}

function getDocumentTypeLabel(document) {
	const extension = String(document.fileName ?? "").split(".").pop();
	if (extension && extension !== document.fileName) return extension.toLowerCase();
	if (document.mimeType?.includes("pdf")) return "pdf";
	return "document";
}

function TabHeader({
	count,
	label,
	completedAt,
	selectable,
	selectedCount,
	allSelected,
	filterOpen,
	sortOpen,
	onSelectAll,
	onRemoveSelected,
	onToggleFilter,
	onToggleSort,
	showControls = true,
}) {
	const timestamp = formatTimestamp(completedAt);
	return (
		<div className="ai-dashboard-tab-header">
			<div className="ai-dashboard-tab-header__meta">
				<p className="ai-dashboard-tab-header__title">
					{count} {label}
				</p>
				{timestamp && <p className="ai-dashboard-tab-header__timestamp">{timestamp}</p>}
			</div>
			<div className="ai-dashboard-tab-header__actions">
				{selectable && (
					<>
						<button
							type="button"
							className="ai-dashboard-tab-action"
							onClick={onSelectAll}
							aria-pressed={allSelected}
						>
							<Icon name="checkmark" size={16} />
							{allSelected ? "Selectie wissen" : "Selecteer alles"}
						</button>
						<button
							type="button"
							className="ai-dashboard-tab-action ai-dashboard-tab-action--danger"
							onClick={onRemoveSelected}
							disabled={selectedCount === 0}
						>
							Resultaten verwijderen uit scan
						</button>
					</>
				)}
				{showControls && (
					<>
						<button
							type="button"
							className={`ai-dashboard-tab-action ${filterOpen ? "ai-dashboard-tab-action--active" : ""}`}
							onClick={onToggleFilter}
							aria-pressed={filterOpen}
						>
							<Icon name="funnel" size={16} />
							Filter
						</button>
						<button
							type="button"
							className={`ai-dashboard-tab-action ${sortOpen ? "ai-dashboard-tab-action--active" : ""}`}
							onClick={onToggleSort}
							aria-pressed={sortOpen}
						>
							Sorteer op
							<Icon name="chevron-down" size={16} />
						</button>
					</>
				)}
			</div>
		</div>
	);
}

function ExpertCard({ expert }) {
	const initials = getExpertInitials(expert.name);
	const color = pickAvatarColor(expert.externalId ?? expert.name);
	const bio = getExpertBio(expert);
	const tags = getExpertTags(expert);
	const openResearchUrl = getExpertOpenResearchUrl(expert);

	return (
		<article className="ai-dashboard-expert-card">
			<div className="ai-dashboard-expert-card__main">
				<div className="ai-dashboard-expert-card__profile">
					<Avatar label={initials} color={color} />
					<div className="ai-dashboard-expert-card__identity">
						<p className="ai-dashboard-expert-card__name">{expert.name}</p>
						{expert.organisation && (
							<p className="ai-dashboard-expert-card__organisation">{expert.organisation}</p>
						)}
					</div>
				</div>
				{bio && <p className="ai-dashboard-expert-card__bio">{bio}</p>}
			</div>
			<div className="ai-dashboard-expert-card__footer">
				{tags.length > 0 && (
					<div className="ai-dashboard-expert-card__expertise">
						<p className="ai-dashboard-expert-card__expertise-label">Expertise</p>
						<div className="ai-dashboard-expert-card__tags">
							{tags.slice(0, 3).map((tag) => (
								<span key={tag} className="ai-dashboard-chip ai-dashboard-chip--outline">{tag}</span>
							))}
						</div>
					</div>
				)}
				{openResearchUrl && (
					<a
						className="ai-dashboard-expert-card__contact"
						href={openResearchUrl}
						target="_blank"
						rel="noreferrer"
					>
						<Icon name="chevron-right" size={16} />
						Kom in contact
					</a>
				)}
			</div>
		</article>
	);
}

export function SourceEffectsLabel({ usedCount, totalCount, loading, error }) {
	if (loading) {
		return (
			<span className="ai-dashboard-source-card__effects">
				<span className="ai-dashboard-source-card__spinner" aria-hidden="true" />
				Effecten zoeken…
			</span>
		);
	}
	if (error) {
		return (
			<span className="ai-dashboard-source-card__effects">
				<Icon name="cross" size={16} />
				Open de bron om effecten opnieuw te laden
			</span>
		);
	}
	if (totalCount === 0) {
		return (
			<span className="ai-dashboard-source-card__effects">
				<Icon name="ai-wand-stars" size={16} />
				Geen effecten gevonden
			</span>
		);
	}
	const allUsed = totalCount > 0 && usedCount === totalCount;
	return (
		<span className="ai-dashboard-source-card__effects">
			<Icon name={allUsed ? "checkmark" : "ai-wand-stars"} size={16} />
			{allUsed ? "Alle effecten gebruikt" : `${usedCount} van ${totalCount} effecten gebruikt`}
		</span>
	);
}

function DocumentAnalysisStatusLabel({ status }) {
	if (status === "PENDING" || status === "RUNNING") {
		return (
			<span className="ai-dashboard-source-card__effects">
				<span className="ai-dashboard-source-card__spinner" aria-hidden="true" />
				Analyse loopt
			</span>
		);
	}

	if (status === "FAILED") {
		return (
			<span className="ai-dashboard-source-card__effects">
				<Icon name="cross" size={16} />
				Analyse mislukt
			</span>
		);
	}

	return null;
}

function SourceCard({ source, projectId, projectSlug, themeSlug, projectThemes, usedSourceEffectKeys }) {
	const navigate = useNavigate();
	const dateLabel = source.publishedAt
		? new Date(source.publishedAt).toLocaleDateString("nl-NL", { year: "numeric", month: "long", day: "numeric" })
		: null;
	const sourceTypeLabel = source.sourceType || "Artikel";
	const sourceId = getOpenResearchSourceId(source);
	const sourceRouteId = getOpenResearchRouteId(source);

	// Real "Mogelijke effecten" for this source — the same verbatim statements the
	// source page shows. Fetched lazily per visible card (the list is paginated, so
	// only a handful query at once) so the footer reflects the actual effect count
	// instead of a fixed mock number.
	const { data: effectsData, loading: effectsLoading, error: effectsError } = useQuery(GET_OPEN_RESEARCH_SOURCE_EFFECTS, {
		variables: { projectId, sourceId: sourceRouteId, themeSlug },
		fetchPolicy: "cache-first",
		skip: !projectId || !sourceRouteId,
	});
	const sourceEffects = buildOpenResearchEffects({
		statements: effectsData?.openResearchSourceEffects,
		projectThemes,
		preferredThemeSlug: themeSlug,
		sourceKind: "OPEN_RESEARCH",
		sourceId,
	});
	const usedCount = sourceEffects.filter((effect) =>
		usedSourceEffectKeys.has(getSourceEffectKey(effect.sourceEffect)),
	).length;
	const sourcePath = projectSlug && sourceRouteId
		? `/project/${projectSlug}/open-research-source/${encodeURIComponent(sourceRouteId)}`
		: null;

	function openSource() {
		if (sourcePath) navigate(sourcePath, { state: { source } });
	}

	function handleKeyDown(event) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			openSource();
		}
	}

	return (
		<article
			className="ai-dashboard-source-card"
			onClick={openSource}
			onKeyDown={handleKeyDown}
			role={sourcePath ? "link" : undefined}
			tabIndex={sourcePath ? 0 : undefined}
			aria-label={sourcePath ? `${source.title} openen` : undefined}
		>
			<div className="ai-dashboard-source-card__main">
				{dateLabel && <p className="ai-dashboard-source-card__date">{dateLabel}</p>}
				<h4 className="ai-dashboard-source-card__title">{source.title}</h4>
				{source.content && <p className="ai-dashboard-source-card__excerpt">{source.content}</p>}
			</div>
			<div className="ai-dashboard-source-card__footer">
				<span className="ai-dashboard-source-card__type">{sourceTypeLabel}</span>
				<SourceEffectsLabel
					usedCount={usedCount}
					totalCount={sourceEffects.length}
					loading={effectsLoading}
					error={effectsError}
				/>
			</div>
		</article>
	);
}

function UploadedDocumentCard({ document, projectId, projectSlug, themeSlug, projectThemes, usedSourceEffectKeys }) {
	const navigate = useNavigate();
	const { showCard } = usePopup();
	const showEffectCount = !["PENDING", "RUNNING", "FAILED"].includes(document.analysisStatus);
	const sourceEffects = buildUploadedDocumentEffects({
		document,
		projectThemes,
		preferredThemeSlug: themeSlug,
	});
	const usedCount = sourceEffects.filter((effect) =>
		usedSourceEffectKeys.has(getSourceEffectKey(effect.sourceEffect)),
	).length;
	const sourcePath = projectSlug && document.id
		? `/project/${projectSlug}/upload-result/${document.id}`
		: null;

	function openDocument() {
		if (sourcePath) navigate(sourcePath);
	}

	function handleKeyDown(event) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			openDocument();
		}
	}

	function handleRemove(event) {
		// Keep the card's open-on-click from firing when removing.
		event.stopPropagation();
		showCard(DeleteDocumentCard, "", () => {}, {
			projectId,
			documentId: document.id,
			documentName: document.aiTitle || document.name,
		});
	}

	return (
		<article
			className="ai-dashboard-source-card ai-dashboard-upload-card"
			onClick={openDocument}
			onKeyDown={handleKeyDown}
			role={sourcePath ? "link" : undefined}
			tabIndex={sourcePath ? 0 : undefined}
			aria-label={sourcePath ? `${document.name} openen` : undefined}
		>
			<button
				type="button"
				className="ai-dashboard-upload-card__remove"
				onClick={handleRemove}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") event.stopPropagation();
				}}
				aria-label={`${document.name} verwijderen`}
			>
				<Icon name="trashbin-blue" size={16} />
			</button>
			<div className="ai-dashboard-source-card__main">
				<p className="ai-dashboard-source-card__date">{formatUploadDate(document.uploadedAt)}</p>
				<h4 className="ai-dashboard-source-card__title">{document.aiTitle || document.name}</h4>
				{(document.aiDescription || document.description) && (
					<p className="ai-dashboard-source-card__excerpt">
						{document.aiDescription || document.description}
					</p>
				)}
			</div>
			<div className="ai-dashboard-source-card__footer">
				<span className="ai-dashboard-source-card__type">{getDocumentTypeLabel(document)}</span>
				<DocumentAnalysisStatusLabel status={document.analysisStatus} />
				{showEffectCount && (
					<SourceEffectsLabel usedCount={usedCount} totalCount={sourceEffects.length} />
				)}
			</div>
		</article>
	);
}

function UploadedDocumentsPanel({
	documents,
	projectId,
	projectSlug,
	themeSlug,
	projectThemes,
	usedSourceEffectKeys,
	onUploadDocument,
}) {
	return (
		<Tabs.Panel id="tab-uploaded-documents">
			<div className="ai-dashboard-upload-intro">
				<Paragraph>Niet gevonden wat je zocht? Upload hier je eigen documentatie:</Paragraph>
				<Button
					className="ai-dashboard-upload-action"
					variant="secondary"
					onClick={onUploadDocument}
					disabled={!onUploadDocument}
				>
					<Icon name="ai-wand-stars" size={16} />
					Upload eigen document
				</Button>
			</div>

			{documents.length === 0 ? (
				<Paragraph>Er zijn nog geen eigen documenten geüpload voor dit thema.</Paragraph>
			) : (
				<div className="ai-dashboard-sources-grid">
					{documents.map((document) => (
						<UploadedDocumentCard
							key={document.id}
							document={document}
							projectId={projectId}
							projectSlug={projectSlug}
							themeSlug={themeSlug}
							projectThemes={projectThemes}
							usedSourceEffectKeys={usedSourceEffectKeys}
						/>
					))}
				</div>
			)}
		</Tabs.Panel>
	);
}

// Mirrors the Source page's checkbox card (SourceEffectCard): a checked checkbox
// means the effect is in the scan; unchecking removes the draft effect. Effects
// already converted into a real argument (convertedArgumentId set) are locked —
// the checkbox stays checked but disabled, so the argument that now depends on
// the draft can't be orphaned from here.
function UsedEffectCard({ effect, index, onRemove, removing }) {
	const converted = Boolean(effect.convertedArgumentId);
	const quote = effect.explanation || effect.sourceEffect?.text;
	const disabled = converted || removing;

	function handleToggle() {
		if (disabled) return;
		onRemove(effect);
	}

	return (
		<article className={`ai-dashboard-used-effect ${converted ? "ai-dashboard-used-effect--locked" : ""}`}>
			<div className="ai-dashboard-used-effect__line" aria-hidden="true" />
			<div className="ai-dashboard-used-effect__content">
				<div className="ai-dashboard-used-effect__top">
					<span className="ai-dashboard-used-effect__label">
						{converted ? (
							<>
								<Icon name="checkmark" size={16} />
								Verwerkt in effect
							</>
						) : (
							"Nog niet verwerkt"
						)}
					</span>
					<span className="ai-dashboard-used-effect__checkbox">
						<Checkbox
							aria-label={
								converted
									? `Gebruikt effect ${index + 1} is verwerkt in een effect en kan hier niet worden verwijderd`
									: `Gebruikt effect ${index + 1} verwijderen uit scan`
							}
							checked
							disabled={disabled}
							onChange={handleToggle}
						/>
					</span>
				</div>
				<div className="ai-dashboard-used-effect__body">
					{effect.title && (
						<Heading className="ai-dashboard-used-effect__title" level={4} size="level-5">
							{effect.title}
						</Heading>
					)}
					{quote && (
						<Paragraph className="ai-dashboard-used-effect__quote" size="small">
							“{quote}”
						</Paragraph>
					)}
				</div>
			</div>
		</article>
	);
}

function UsedEffectsPanel({ usedEffects, projectId, projectSlug }) {
	const [removingId, setRemovingId] = useState(null);
	const [deleteDraftEffect] = useMutation(DELETE_PROJECT_AI_DRAFT_EFFECT);
	const total = usedEffects.length;
	// "Verwerkt" = converted into a real effect in the scan. The tab button shows the
	// total pulled from the verkenning; this header clarifies how many are verwerkt,
	// so it reads the same as the project page's "x van y AI-effecten verwerkt".
	const convertedCount = usedEffects.filter((effect) => effect.convertedArgumentId).length;

	async function handleRemove(effect) {
		if (!projectId || !effect?.id) return;
		setRemovingId(effect.id);
		try {
			await deleteDraftEffect({
				variables: { projectId, draftEffectId: effect.id },
				refetchQueries: projectSlug ? [{ query: GET_PROJECT, variables: { slug: projectSlug } }] : [],
				awaitRefetchQueries: true,
			});
		} finally {
			setRemovingId(null);
		}
	}

	return (
		<Tabs.Panel id="tab-used-effects">
			<TabHeader
				count={total === 0 ? 0 : `${convertedCount} van ${total}`}
				label={total === 0 ? "gebruikte effecten" : "effecten verwerkt in de scan"}
				completedAt={null}
				selectable={false}
				selectedCount={0}
				allSelected={false}
				filterOpen={false}
				sortOpen={false}
				onToggleFilter={() => {}}
				onToggleSort={() => {}}
				showControls={false}
			/>
			{usedEffects.length === 0 ? (
				<Paragraph>Er zijn nog geen effecten gebruikt in dit thema.</Paragraph>
			) : (
				<div className="ai-dashboard-tab-list">
					{usedEffects.map((effect, index) => (
						<UsedEffectCard
							key={effect.id ?? `${effect.title}-${index}`}
							effect={effect}
							index={index}
							onRemove={handleRemove}
							removing={removingId === effect.id}
						/>
					))}
				</div>
			)}
		</Tabs.Panel>
	);
}

function DiscussionPointCard({ point, index }) {
	const themeMentions = point.themes?.map((theme) => `#${toThemeSlug(theme)}`).join(" ");

	return (
		<article className="ai-dashboard-discussion-point">
			<div className="ai-dashboard-discussion-point__content">
				<span className="ai-dashboard-discussion-point__label">Voorstel door AI</span>
				<Heading className="ai-dashboard-discussion-point__title" level={4} size="level-5">
					{index + 1}. {point.topic}
				</Heading>
				{point.description && (
					<Paragraph className="ai-dashboard-discussion-point__description" size="small">
						{point.description}
					</Paragraph>
				)}
				{point.themes?.length > 0 && (
					<div className="ai-dashboard-discussion-point__themes">
						<span className="ai-dashboard-discussion-point__themes-label">Thema’s:</span>
						<div className="ai-dashboard-discussion-point__mentions">
							<TextWithMention text={themeMentions} />
						</div>
					</div>
				)}
			</div>
		</article>
	);
}

export function TabPanelHeader({ description, children }) {
	return (
		<>
			{description && <Paragraph>{description}</Paragraph>}
			{children}
		</>
	);
}

function TabPanel({
	id,
	items,
	renderItem,
	label,
	headerLabel,
	description,
	completedAt,
	listClassName = "ai-dashboard-tab-list",
	pageSize,
	sortOptions = [{ value: "default", label: "Standaard" }],
	selectable = false,
	getItemKey,
	onRemoveSelected,
}) {
	const [filterOpen, setFilterOpen] = useState(false);
	const [sortOpen, setSortOpen] = useState(false);
	const [filterQuery, setFilterQuery] = useState("");
	const [sortKey, setSortKey] = useState(sortOptions[0]?.value ?? "default");
	const [selectedKeys, setSelectedKeys] = useState([]);
	const visibleItems = useMemo(() => {
		const query = normalizedText(filterQuery).trim();
		const filtered = query
			? items.filter((item) => getItemSearchText(item).includes(query))
			: items;
		return sortItems(filtered, sortKey);
	}, [filterQuery, items, sortKey]);
	const { page, setPage, totalPages, slice } = usePagination(visibleItems, pageSize);
	const visibleCount = filterQuery ? `${visibleItems.length} van ${items.length}` : items.length;
	const keyForItem = getItemKey ?? ((item, index) => item?.id ?? item?.externalId ?? item?.title ?? String(index));
	const visibleKeys = visibleItems.map((item, index) => keyForItem(item, index));
	const selectedItems = items.filter((item, index) => selectedKeys.includes(keyForItem(item, index)));
	const allVisibleSelected = visibleKeys.length > 0 && visibleKeys.every((key) => selectedKeys.includes(key));
	const hasControls = filterOpen || sortOpen;
	const filterId = `${id}-filter`;
	const sortId = `${id}-sort`;
	function toggleItem(item, index) {
		const itemKey = keyForItem(item, index);
		setSelectedKeys((current) =>
			current.includes(itemKey)
				? current.filter((key) => key !== itemKey)
				: [...current, itemKey],
		);
	}

	function toggleAllVisibleItems() {
		setSelectedKeys((current) => {
			if (allVisibleSelected) {
				return current.filter((key) => !visibleKeys.includes(key));
			}
			return [...new Set([...current, ...visibleKeys])];
		});
	}

	function removeSelectedItems() {
		onRemoveSelected?.(selectedItems);
		setSelectedKeys([]);
	}

	const header = (
		<TabHeader
			count={visibleCount}
			label={headerLabel}
			completedAt={completedAt}
			selectable={selectable}
			selectedCount={selectedItems.length}
			allSelected={allVisibleSelected}
			filterOpen={filterOpen}
			sortOpen={sortOpen}
			onSelectAll={toggleAllVisibleItems}
			onRemoveSelected={removeSelectedItems}
			onToggleFilter={() => setFilterOpen((value) => !value)}
			onToggleSort={() => setSortOpen((value) => !value)}
		/>
	);

	if (items.length === 0) {
		return (
			<Tabs.Panel id={id}>
				<TabPanelHeader description={description}>{header}</TabPanelHeader>
				<Paragraph>Geen {label.toLowerCase()} gevonden.</Paragraph>
			</Tabs.Panel>
		);
	}

	return (
		<Tabs.Panel id={id}>
			<TabPanelHeader description={description}>{header}</TabPanelHeader>
			{hasControls && (
				<div className="ai-dashboard-tab-controls">
					{filterOpen && (
						<div className="ai-dashboard-tab-control ai-dashboard-tab-control--filter">
							<label className="ai-dashboard-tab-control__label" htmlFor={filterId}>
								Filter
							</label>
							<SearchField className="ai-dashboard-tab-search" onSubmit={(e) => e.preventDefault()}>
								<SearchField.Input
									id={filterId}
									label={`Zoeken in ${label.toLowerCase()}`}
									onChange={(e) => {
										setFilterQuery(e.target.value);
										setPage(1);
									}}
									placeholder={`Zoek in ${label.toLowerCase()}`}
									value={filterQuery}
								/>
								<SearchField.Button />
							</SearchField>
						</div>
					)}
					{sortOpen && (
						<div className="ai-dashboard-tab-control">
							<label className="ai-dashboard-tab-control__label" htmlFor={sortId}>
								Sorteer op
							</label>
							<select
								className="ai-dashboard-tab-sort"
								id={sortId}
								onChange={(event) => {
									setSortKey(event.target.value);
									setPage(1);
								}}
								value={sortKey}
							>
								{sortOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</div>
					)}
				</div>
			)}
			{filterQuery && visibleItems.length === 0 && (
				<Paragraph>Geen {label.toLowerCase()} gevonden met dit filter.</Paragraph>
			)}
			<div className={listClassName}>
				{slice.map((item, i) => {
					const itemKey = keyForItem(item, i);
					return renderItem(item, i, {
						selectable,
						selected: selectedKeys.includes(itemKey),
						onSelect: () => toggleItem(item, i),
					});
				})}
			</div>
			{totalPages > 1 && (
				<ClientPagination
					className="ai-dashboard-pagination"
					page={page}
					totalPages={totalPages}
					onPageChange={setPage}
				/>
			)}
		</Tabs.Panel>
	);
}

export default function ResultsTabs({
	experts = [],
	sources = [],
	talkingPoints = [],
	uploadedDocuments = [],
	usedEffects = [],
	allUsedEffects = usedEffects,
	projectThemes = [],
	completedAt,
	projectId,
	projectSlug,
	themeSlug,
	onUploadDocument,
}) {
	const usedSourceEffectKeys = useMemo(() => {
		const keys = allUsedEffects
			.map((effect) => getSourceEffectKey(effect.sourceEffect))
			.filter(Boolean);
		return new Set(keys);
	}, [allUsedEffects]);

	return (
		<Tabs>
			<Tabs.List className="ai-dashboard-results-tabs-list">
				<Tabs.Button aria-controls="tab-experts">Experts ({experts.length})</Tabs.Button>
				<Tabs.Button aria-controls="tab-sources">Bronnen ({sources.length})</Tabs.Button>
				<Tabs.Button aria-controls="tab-talking-points">
					Consistente bevindingen ({talkingPoints.length})
				</Tabs.Button>
				<Tabs.Button aria-controls="tab-uploaded-documents">
					Eigen documenten ({uploadedDocuments.length})
				</Tabs.Button>
				<Tabs.Button
					aria-controls="tab-used-effects"
					className="ai-dashboard-results-tabs-list__right"
				>
					Gebruikte effecten ({usedEffects.length})
				</Tabs.Button>
			</Tabs.List>

			<TabPanel
				id="tab-experts"
				items={experts}
				label="Experts"
				headerLabel="potentiële experts gevonden"
				description="Dit zijn personen die zijn gekoppeld aan relevante onderwerpen van jouw brede welvaartsvraag op het OpenResearch platform."
				listClassName="ai-dashboard-experts-grid"
				pageSize={6}
				completedAt={completedAt}
				sortOptions={SORT_OPTIONS.experts}
				renderItem={(expert) => <ExpertCard key={expert.externalId ?? expert.name} expert={expert} />}
			/>

			<TabPanel
				id="tab-sources"
				items={sources}
				label="Bronnen"
				headerLabel="bronnen gevonden"
				listClassName="ai-dashboard-sources-grid"
				pageSize={6}
				completedAt={completedAt}
				sortOptions={SORT_OPTIONS.sources}
				getItemKey={getSourceKey}
				renderItem={(source) => (
					<SourceCard
						key={getSourceKey(source)}
						source={source}
						projectId={projectId}
						projectSlug={projectSlug}
						themeSlug={themeSlug}
						projectThemes={projectThemes}
						usedSourceEffectKeys={usedSourceEffectKeys}
					/>
				)}
			/>

			<TabPanel
				id="tab-talking-points"
				items={talkingPoints}
				label="Consistente bevindingen"
				headerLabel="consistente bevindingen gevonden"
				description={CONSISTENT_FINDINGS_DESCRIPTION}
				completedAt={completedAt}
				sortOptions={SORT_OPTIONS.discussionPoints}
				renderItem={(point, i) => (
					<DiscussionPointCard key={point.topic ?? i} point={point} index={i} />
				)}
			/>

			<UploadedDocumentsPanel
				documents={uploadedDocuments}
				projectId={projectId}
				projectSlug={projectSlug}
				themeSlug={themeSlug}
				projectThemes={projectThemes}
				usedSourceEffectKeys={usedSourceEffectKeys}
				onUploadDocument={onUploadDocument}
			/>

			<UsedEffectsPanel usedEffects={usedEffects} projectId={projectId} projectSlug={projectSlug} />
		</Tabs>
	);
}
