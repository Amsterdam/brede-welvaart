import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const componentSource = readFileSync(new URL("./index.jsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./index.scss", import.meta.url), "utf8");

describe("QuestionsCard aanleiding", () => {
	it("toont de aanleiding en opties verticaal", () => {
		expect(componentSource).toContain('className="project-questions-dialog__reason"');
		expect(stylesSource).toContain("&__reason");
		expect(stylesSource).toContain("flex-direction: column");
	});

	it("beschermt ADS-checkboxes tegen de algemene dialog-inputstijl", () => {
		expect(componentSource).toContain('name="reason"');
		expect(componentSource).toContain("id={`questions-reason-${option.value}`}");
		expect(stylesSource).toContain(".ams-checkbox__input");
		expect(stylesSource).toContain("width: 0");
	});
});
