import { describe, expect, it } from "vitest";
import {
	buildOpenResearchEffects,
	buildUploadedDocumentEffects,
	formatAiProposal,
	getSourceEffectKey,
} from "../effects";

describe("buildOpenResearchEffects", () => {
	const base = { sourceKind: "OPEN_RESEARCH", sourceId: "openresearch:42" };

	it("maps verbatim statements to numbered effect cards", () => {
		const effects = buildOpenResearchEffects({
			...base,
			statements: [
				{ text: "Eerste effect.", page: 3 },
				{ text: "Tweede effect.", page: 7 },
			],
		});

		expect(effects).toHaveLength(2);
		expect(effects[0]).toMatchObject({ effectId: "effect-1", page: 3, text: "Eerste effect." });
		expect(effects[1]).toMatchObject({ effectId: "effect-2", page: 7, text: "Tweede effect." });
	});

	it("attaches a themeless sourceEffect identity to each card", () => {
		const [effect] = buildOpenResearchEffects({ ...base, statements: [{ text: "Effect.", page: 5 }] });

		expect(effect.sourceEffect).toEqual({
			sourceKind: "OPEN_RESEARCH",
			sourceId: "openresearch:42",
			effectId: "effect-1",
			page: 5,
			text: "Effect.",
		});
		// Statements are themeless — the theme is chosen when a draft becomes an argument.
		expect(effect.sourceEffect).not.toHaveProperty("themeSlug");
	});

	it("coerces a non-numeric page to null", () => {
		const [effect] = buildOpenResearchEffects({ ...base, statements: [{ text: "Effect.", page: "3" }] });
		expect(effect.page).toBeNull();
		expect(effect.sourceEffect.page).toBeNull();
	});

	it("drops statements without usable text", () => {
		const effects = buildOpenResearchEffects({
			...base,
			statements: [{ text: "Echt effect.", page: 1 }, { text: "", page: 2 }, { page: 3 }],
		});
		expect(effects).toHaveLength(1);
		expect(effects[0].text).toBe("Echt effect.");
	});

	it("leaves sourceEffect null when source identity is incomplete", () => {
		const withoutId = buildOpenResearchEffects({
			sourceKind: "OPEN_RESEARCH",
			sourceId: null,
			statements: [{ text: "Effect.", page: 1 }],
		});
		expect(withoutId[0].sourceEffect).toBeNull();
	});

	it("returns an empty list for missing statements", () => {
		expect(buildOpenResearchEffects({ ...base, statements: null })).toEqual([]);
		expect(buildOpenResearchEffects({ ...base, statements: undefined })).toEqual([]);
		expect(buildOpenResearchEffects({ ...base, statements: [] })).toEqual([]);
	});
});

describe("buildUploadedDocumentEffects", () => {
	it("maps aiStatements to statement cards tagged as an uploaded document", () => {
		const effects = buildUploadedDocumentEffects({
			document: { id: "doc-1", aiStatements: [{ text: "Uit het PDF.", page: 12 }] },
		});

		expect(effects).toHaveLength(1);
		expect(effects[0]).toMatchObject({ effectId: "statement-1", page: 12, text: "Uit het PDF." });
		expect(effects[0].sourceEffect).toEqual({
			sourceKind: "UPLOADED_DOCUMENT",
			sourceId: "doc-1",
			effectId: "statement-1",
			page: 12,
			text: "Uit het PDF.",
		});
	});

	it("defaults a missing page to null", () => {
		const [effect] = buildUploadedDocumentEffects({
			document: { id: "doc-1", aiStatements: [{ text: "Zonder pagina." }] },
		});
		expect(effect.page).toBeNull();
	});

	it("drops statements without text", () => {
		const effects = buildUploadedDocumentEffects({
			document: { id: "doc-1", aiStatements: [{ text: "Ok.", page: 1 }, { text: "", page: 2 }] },
		});
		expect(effects).toHaveLength(1);
	});

	it("returns an empty list when the document or its id is missing", () => {
		expect(buildUploadedDocumentEffects({ document: null })).toEqual([]);
		expect(buildUploadedDocumentEffects({ document: {} })).toEqual([]);
		expect(buildUploadedDocumentEffects({ document: { id: "doc-1" } })).toEqual([]);
	});
});

describe("getSourceEffectKey", () => {
	it("builds a theme-independent identity from kind, source and effect", () => {
		expect(
			getSourceEffectKey({ sourceKind: "OPEN_RESEARCH", sourceId: "openresearch:42", effectId: "effect-1" })
		).toBe("OPEN_RESEARCH:openresearch:42:effect-1");
	});

	it("prefers an explicit key when present", () => {
		expect(getSourceEffectKey({ key: "explicit", sourceKind: "OPEN_RESEARCH" })).toBe("explicit");
	});

	it("ignores themeSlug so drafts and arguments match regardless of chosen theme", () => {
		const withoutTheme = getSourceEffectKey({
			sourceKind: "OPEN_RESEARCH",
			sourceId: "openresearch:42",
			effectId: "effect-1",
		});
		const withTheme = getSourceEffectKey({
			sourceKind: "OPEN_RESEARCH",
			sourceId: "openresearch:42",
			effectId: "effect-1",
			themeSlug: "gezondheid",
		});
		expect(withTheme).toBe(withoutTheme);
	});

	it("returns null for a missing sourceEffect", () => {
		expect(getSourceEffectKey(null)).toBeNull();
		expect(getSourceEffectKey(undefined)).toBeNull();
	});
});

describe("formatAiProposal", () => {
	it("uses the je form for an effect with a page number", () => {
		expect(formatAiProposal({ text: "Een effect.", page: 8 }, "Rapport X")).toBe(
			'Op pagina 8 van Rapport X vind je een mogelijk effect:\n“Een effect.”'
		);
	});

	it("uses the je form for an effect without a page number", () => {
		expect(formatAiProposal({ text: "Een effect.", page: null }, "Rapport X")).toBe(
			'In Rapport X vind je een mogelijk effect:\n“Een effect.”'
		);
	});
});
