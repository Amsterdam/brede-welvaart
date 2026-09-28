import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const sidebarSource = readFileSync(resolve(currentDir, "../index.jsx"), "utf8");

describe("Sidebar new project navigation", () => {
	it("opens the intake wizard instead of the legacy create-project modal", () => {
		expect(sidebarSource).toContain('navigate("/project/new")');
		expect(sidebarSource).not.toContain("CreateProjectCard");
		expect(sidebarSource).not.toContain("showCreateProjectCard");
	});
});
