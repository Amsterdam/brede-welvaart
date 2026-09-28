import { describe, expect, it } from "vitest";

import { readGeneratedKeyMessage } from "./keyMessageResult";

describe("readGeneratedKeyMessage", () => {
	it("returns the editable concept text", () => {
		expect(readGeneratedKeyMessage({ generateProjectKeyMessage: "• Concept" })).toBe("• Concept");
	});

	it("rejects an empty response so the current text can remain intact", () => {
		expect(() => readGeneratedKeyMessage({ generateProjectKeyMessage: " " })).toThrow();
	});
});
