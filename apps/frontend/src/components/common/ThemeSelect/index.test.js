import { describe, expect, it } from "vitest";

import { getShortThemeDescription } from "./description";

describe("getShortThemeDescription", () => {
	it("uses the first sentence from the theme definition", () => {
		expect(getShortThemeDescription("Menselijk kapitaal gaat over kennis en vaardigheden. Meer uitleg.")).toBe(
			"Menselijk kapitaal gaat over kennis en vaardigheden."
		);
	});

	it("keeps a definition without sentence-ending punctuation", () => {
		expect(getShortThemeDescription("Korte uitleg")).toBe("Korte uitleg");
	});
});
