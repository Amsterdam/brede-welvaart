import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const themesSource = readFileSync(new URL("./index.jsx", import.meta.url), "utf8");

describe("Projectpagina-acties", () => {
	it("opent de voorbladtekst via Voorblad aanpassen", () => {
		expect(themesSource).toContain('import CoverTextCard from "../../../Cards/CoverTextCard"');
		expect(themesSource).toContain("<span>Voorblad aanpassen</span>");
		expect(themesSource).toContain('showCard(CoverTextCard, "", () => {}, { project })');
	});

	it("opent de startvragen in een projectspecifieke dialoog", () => {
		expect(themesSource).toContain('import QuestionsCard from "../../../Cards/QuestionsCard"');
		expect(themesSource).toContain("<span>Vragen aanpassen</span>");
		expect(themesSource).toContain('showCard(QuestionsCard, "", () => {}, { project })');
		expect(themesSource).not.toContain("navigate(`/project/${project.slug}/intake`)");
	});

	it("houdt de bestaande kernboodschapdialoog", () => {
		expect(themesSource).toContain("<span>Kernboodschap toewijzen</span>");
		expect(themesSource).toContain('showCard(KeyMessageCard, "", () => {}, { project })');
	});
});
