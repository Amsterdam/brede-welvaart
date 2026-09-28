import { readFile } from "node:fs/promises";

import less from "less";
import { describe, expect, it } from "vitest";

describe("TextAreaWithMention styles", () => {
	it("keeps the theme suggestion dropdown visible outside the text area", async () => {
		const source = await readFile(new URL("./index.less", import.meta.url), "utf8");
		const { css } = await less.render(source);

		expect(css).toMatch(/\.rc-mentions\s*{[^}]*overflow:\s*visible;/s);
		expect(css).toMatch(/\.rc-mentions-dropdown\s*{[^}]*position:\s*absolute;/s);
	});
});
