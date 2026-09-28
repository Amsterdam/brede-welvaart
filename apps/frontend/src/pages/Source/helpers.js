export function decodeSourceId(sourceId) {
	try {
		return decodeURIComponent(sourceId ?? "");
	} catch {
		return sourceId;
	}
}

export function getOpenResearchId(value) {
	const text = String(value ?? "");
	const docIdMatch = text.match(/openresearch:(\d+)/i);
	const urlMatch = text.match(/\/page\/(\d+)/i);
	const numericMatch = text.match(/^\d+$/);
	return docIdMatch?.[1] ?? urlMatch?.[1] ?? numericMatch?.[0] ?? null;
}

// Public OpenResearch article URL for a source id ("openresearch:136432" or "136432").
// Returns null for non-OpenResearch sources (e.g. uploaded documents), which have no
// external page. Reconstructed client-side so the off-domain URL never rides in a
// GraphQL request body (S-ADS WAF RFI rule).
export function getOpenResearchUrl(value) {
	const id = getOpenResearchId(value);
	return id ? `https://openresearch.amsterdam/nl/page/${id}` : null;
}

function normalizeSourceIdentifier(value) {
	if (!value) return null;
	const decoded = decodeSourceId(String(value));
	return decoded.trim().replace(/\/$/, "").toLowerCase();
}

export function sourceMatchesId(source, sourceId) {
	const metadata = source.metadata ?? {};
	const values = [
		source.externalId,
		source.doc_id,
		source.docId,
		source.url,
		source.title,
		metadata.doc_id,
		metadata.externalId,
		metadata.openresearch_id,
		metadata.openResearchId,
		metadata.url,
	];
	const normalizedTarget = normalizeSourceIdentifier(sourceId);
	const targetOpenResearchId = getOpenResearchId(sourceId);

	return values.some((value) => {
		const normalizedValue = normalizeSourceIdentifier(value);
		if (normalizedValue && normalizedValue === normalizedTarget) return true;

		const valueOpenResearchId = getOpenResearchId(value);
		return Boolean(
			targetOpenResearchId &&
				valueOpenResearchId &&
				targetOpenResearchId === valueOpenResearchId,
		);
	});
}

const HTML_ENTITIES = {
	"&amp;": "&",
	"&lt;": "<",
	"&gt;": ">",
	"&quot;": '"',
	"&#39;": "'",
	"&apos;": "'",
	"&nbsp;": " ",
};

// OpenResearch descriptions arrive as HTML fragments (e.g. `<br />` separators and
// entities). Render them as plain text: turn breaks into spaces, drop remaining tags,
// decode common entities, and collapse whitespace. Returns the input unchanged when
// there's no markup. Kept DOM-free so it runs the same in the browser and in tests.
export function stripHtml(value) {
	if (value == null) return value;
	const text = String(value);
	if (!/[<&]/.test(text)) return text;
	return text
		.replace(/<[^>]*>/g, " ")
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&[a-z]+;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity)
		.replace(/\s+/g, " ")
		.trim();
}

export function parseMetadata(metadata) {
	if (!metadata) return {};
	if (typeof metadata === "string") {
		try {
			return JSON.parse(metadata);
		} catch {
			return {};
		}
	}
	return metadata;
}

// OpenResearch metadata is free-form: a field that's a clean string in seeded/local
// data can be a nested object (e.g. an author `{ name, affiliation }`) or an array of
// them on prod. Pull a human-readable string out of those shapes instead of letting
// String() render a useless "[object Object]".
function coerceMetadataText(value) {
	if (value == null) return null;
	if (typeof value === "string") return value.trim() || null;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) {
		const parts = value.map(coerceMetadataText).filter(Boolean);
		return parts.length ? parts.join(", ") : null;
	}
	if (typeof value === "object") {
		for (const key of ["name", "label", "title", "value", "displayName", "fullName", "text"]) {
			const nested = coerceMetadataText(value[key]);
			if (nested) return nested;
		}
		return null;
	}
	return null;
}

export function getMetadataValue(metadata, keys) {
	for (const key of keys) {
		const text = coerceMetadataText(metadata?.[key]);
		if (text) return text;
	}
	return null;
}

export function getMetadataList(metadata, keys) {
	for (const key of keys) {
		const value = metadata?.[key];
		if (value == null) continue;
		if (Array.isArray(value)) {
			const items = value.map(coerceMetadataText).filter(Boolean);
			if (items.length) return items;
			continue;
		}
		if (typeof value === "string") {
			const items = value.split(",").map((item) => item.trim()).filter(Boolean);
			if (items.length) return items;
			continue;
		}
		const text = coerceMetadataText(value);
		if (text) return [text];
	}
	return [];
}

export function formatSourceDate(date) {
	if (!date) return "Open Research";
	const d = new Date(date);
	if (isNaN(d.getTime())) return "Open Research";
	return d.toLocaleDateString("nl-NL", {
		day: "numeric",
		month: "long",
		year: "numeric",
	});
}

export function formatUploadDate(date) {
	const d = new Date(date);
	if (isNaN(d.getTime())) return "Geüpload";
	return `Geüpload op ${d.toLocaleDateString("nl-NL", {
		day: "numeric",
		month: "long",
		year: "numeric",
	})}`;
}
