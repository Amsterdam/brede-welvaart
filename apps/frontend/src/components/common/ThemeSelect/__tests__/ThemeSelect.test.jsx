import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ThemeSelect from "../index";
import { getThemeSelectionError } from "../validation";

const themes = [{ slug: "wonen", name: "Wonen" }];

describe("ThemeSelect", () => {
	it("toont geen standaardthema als de waarde leeg is", () => {
		const html = renderToStaticMarkup(<ThemeSelect themes={themes} value="" onChange={vi.fn()} />);

		expect(html).toContain("Selecteer thema");
		expect(html).not.toContain("theme-select__name\">Wonen");
	});

	it("koppelt de validatiefout toegankelijk aan de knop", () => {
		const html = renderToStaticMarkup(
			<ThemeSelect themes={themes} value="" onChange={vi.fn()} invalid errorId="theme-error" />
		);

		expect(html).toContain('aria-invalid="true"');
		expect(html).toContain('aria-describedby="theme-error"');
	});

	it("vereist een bewuste keuze als het themaveld verplicht is", () => {
		expect(getThemeSelectionError(true, "")).toBe("Kies een thema.");
		expect(getThemeSelectionError(true, "wonen")).toBeNull();
	});
});
