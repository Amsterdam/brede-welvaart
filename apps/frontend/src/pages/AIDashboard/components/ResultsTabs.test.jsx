import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TabPanelHeader } from "./ResultsTabs";
import { SourceEffectsLabel } from "./ResultsTabs";

vi.mock("react-router-dom", async (importOriginal) => ({
	...(await importOriginal()),
	useNavigate: () => vi.fn(),
}));

describe("SourceEffectsLabel", () => {
	it("distinguishes a loading error from a valid empty result", () => {
		const failed = renderToStaticMarkup(
			<SourceEffectsLabel usedCount={0} totalCount={0} error={new Error("service unavailable")} />,
		);
		const empty = renderToStaticMarkup(
			<SourceEffectsLabel usedCount={0} totalCount={0} />,
		);

		expect(failed).toContain("Open de bron om effecten opnieuw te laden");
		expect(failed).not.toContain("Geen effecten gevonden");
		expect(empty).toContain("Geen effecten gevonden");
	});
});

describe("TabPanelHeader", () => {
	it("toont de uitleg voor de telling", () => {
		const description = "Deze bevindingen staan hier als inspiratie. Gebruik de optie 'Zoekvraag aanpassen'.";
		const markup = renderToStaticMarkup(
			<TabPanelHeader description={description}>
				<div>1 consistente bevindingen gevonden</div>
			</TabPanelHeader>
		);

		expect(markup).toContain("Deze bevindingen");
		expect(markup).toContain("Zoekvraag aanpassen");
		expect(markup.indexOf("Deze bevindingen")).toBeLessThan(markup.indexOf("1 consistente bevindingen gevonden"));
	});
});
