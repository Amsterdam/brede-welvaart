import { describe, expect, it } from "vitest";
import { getMetadataList, getMetadataValue, stripHtml } from "../helpers";

describe("Source metadata helpers", () => {
	it("returns plain string values", () => {
		expect(getMetadataValue({ author: "Jane Doe" }, ["author"])).toBe("Jane Doe");
	});

	it("joins array-of-string values", () => {
		expect(getMetadataValue({ authors: ["Jane", "John"] }, ["authors"])).toBe("Jane, John");
	});

	// Prod regression: OpenResearch authors arrive as objects, not strings. The old
	// String()/map(String) coercion rendered "[object Object]" (and "[O" initials).
	it("extracts a readable name from object values instead of [object Object]", () => {
		expect(getMetadataValue({ author: { name: "Jane Doe", affiliation: "UvA" } }, ["author"])).toBe("Jane Doe");
	});

	it("extracts names from an array of author objects", () => {
		const metadata = { authors: [{ name: "Jane Doe" }, { name: "John Roe" }] };
		expect(getMetadataValue(metadata, ["authors"])).toBe("Jane Doe, John Roe");
	});

	it("never returns the [object Object] string", () => {
		const metadata = { author: { unexpected: { deep: 1 } } };
		expect(getMetadataValue(metadata, ["author"])).toBeNull();
	});

	it("builds keyword lists from arrays of objects", () => {
		const metadata = { keywords: [{ label: "wonen" }, { label: "zorg" }] };
		expect(getMetadataList(metadata, ["keywords"])).toEqual(["wonen", "zorg"]);
	});

	it("splits comma-separated string keywords", () => {
		expect(getMetadataList({ tags: "wonen, zorg" }, ["keywords", "tags"])).toEqual(["wonen", "zorg"]);
	});
});

describe("stripHtml", () => {
	it("turns <br /> separators into spaces and drops tags", () => {
		const input = "Eerste regel,<br />In december 2023 is de <br />maatregel ingevoerd.";
		expect(stripHtml(input)).toBe("Eerste regel, In december 2023 is de maatregel ingevoerd.");
	});

	it("decodes entities and collapses whitespace", () => {
		expect(stripHtml("Wonen &amp; zorg")).toBe("Wonen & zorg");
	});

	it("returns plain text unchanged", () => {
		expect(stripHtml("Geen markup hier")).toBe("Geen markup hier");
	});

	it("passes through null and undefined", () => {
		expect(stripHtml(null)).toBeNull();
		expect(stripHtml(undefined)).toBeUndefined();
	});
});
