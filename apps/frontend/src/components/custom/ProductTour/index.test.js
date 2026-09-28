import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const tourSource = readFileSync(new URL("./index.jsx", import.meta.url), "utf8");
const newProjectSource = readFileSync(new URL("../../../pages/NewProject/index.jsx", import.meta.url), "utf8");
const sourcePageSource = readFileSync(new URL("../../../pages/Source/index.jsx", import.meta.url), "utf8");

describe("product page tour journey", () => {
	it("uses the package's public JavaScript and stylesheet entrypoints", () => {
		expect(tourSource).toContain('from "@sjmc11/tourguidejs"');
		expect(tourSource).toContain('import "@sjmc11/tourguidejs/dist/css/tour.min.css"');
		expect(tourSource).not.toContain("@sjmc11/tourguidejs/src/");
	});

	it("starts the introduction after completing a new project", () => {
		expect(newProjectSource).toContain('productTourPhase: "project"');
		expect(tourSource).toContain('project: "product-page-introduction"');
		expect(tourSource).toContain("target: \"[data-tour='ai-exploration']\"");
		expect(tourSource).toContain("target: \"[data-tour='product-actions']\"");
		expect(tourSource).toContain("target: \"[data-tour='topic-list']\"");
	});

	it("continues at the AI effects group from the success alert", () => {
		expect(sourcePageSource).toContain('productTourPhase: "aiEffects"');
		expect(sourcePageSource).toContain("Terug naar de productpagina");
		expect(tourSource).toContain('aiEffects: "product-page-ai-effects"');
		expect(tourSource).toContain("target: \"[data-tour='ai-effects-toggle']\"");
		expect(tourSource).toContain("target: \"[data-tour='ai-effects-list']\"");
	});

	it("uses Dutch tour content, controls and accessible dialog labels", () => {
		expect(tourSource).toContain('title: "Verkennen met AI"');
		expect(tourSource).toContain('title: "Bekijk de AI-effecten"');
		expect(tourSource).toContain('nextLabel: "Volgende"');
		expect(tourSource).toContain('prevLabel: "Vorige"');
		expect(tourSource).toContain('finishLabel: "Klaar"');
		expect(tourSource).toContain('aria-label", "Rondleiding sluiten"');
	});
});
