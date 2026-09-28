import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import SearchQuestionExplanation from "../SearchQuestionExplanation";

describe("SearchQuestionExplanation", () => {
	it("toont de uitleg altijd met de bijgewerkte tekst", () => {
		const html = renderToStaticMarkup(<SearchQuestionExplanation onEdit={() => {}} />);

		expect(html).toContain("Deze zoekvraag is afgeleid uit de beantwoorde vragen.");
		expect(html).toContain("Je kan de vraag ook aanpassen naar een specifiek onderdeel, onderwerp of thema.");
		expect(html).not.toContain("projectintake");
		expect(html).not.toContain("Lees meer");
	});

	it("biedt Zoekvraag aanpassen aan als toegankelijke knop", () => {
		const onEdit = vi.fn();
		const element = SearchQuestionExplanation({ onEdit });
		const paragraph = element.props.children;
		const editLink = paragraph.props.children.find?.((child) => child?.props?.children === "Zoekvraag aanpassen");
		const html = renderToStaticMarkup(element);

		expect(editLink.props.onClick).toBe(onEdit);
		expect(html).toContain(
			'<button type="button" class="ams-link ai-dashboard-inline-link">Zoekvraag aanpassen</button>'
		);
	});
});
