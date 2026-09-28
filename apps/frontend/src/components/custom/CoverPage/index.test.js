import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const coverSource = readFileSync(new URL("./index.jsx", import.meta.url), "utf8");

describe("PDF cover page", () => {
	it("shows the project intake answers", () => {
		expect(coverSource).toContain("project.scanGoal");
		expect(coverSource).toContain("project.impactMotivation");
		expect(coverSource).toContain("project.reasonOther");
		expect(coverSource).toContain("project.scope");
	});

	it("does not repeat cover text when it is the fallback for an empty impact motivation", () => {
		expect(coverSource).toContain(
			"project.impactMotivation && project.coverText && project.coverText !== project.impactMotivation",
		);
	});

	it("contains the Figma cover sections and accurate page guide", () => {
		for (const heading of ["Doel en context", "Aanleiding", "Afbakening", "Methodologie", "Leeswijzer"]) {
			expect(coverSource).toContain(`<h3>${heading}</h3>`);
		}
		expect(coverSource).toContain("Totaaloverzicht (pagina 2)");
		expect(coverSource).toContain("Effectenoverzicht (pagina 3)");
	});
});
