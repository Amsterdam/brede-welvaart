import { EXAMPLE_SEED_SCANS } from "@shared/types";
import { CREATE_PROJECT } from "../graphql/mutations";
import { GET_PROJECTS } from "../graphql/queries";

const isDev = process.env.NODE_ENV === "development";

// Creates the shared example scans through the authenticated Apollo client, so
// they're owned by the logged-in SSO user. Idempotent: it loads the existing
// scans first and skips any seed whose name is already present, then refetches the
// project list once at the end (instead of after every mutation).
async function seedDevScans(client) {
	let existingNames;
	try {
		const { data } = await client.query({ query: GET_PROJECTS, fetchPolicy: "network-only" });
		existingNames = new Set((data?.projects ?? []).map((project) => project.name));
	} catch (error) {
		console.error("❌ Could not load existing scans; aborting to avoid duplicates:", error);
		return [];
	}

	const pending = EXAMPLE_SEED_SCANS.filter((scan) => !existingNames.has(scan.name));
	const skipped = EXAMPLE_SEED_SCANS.length - pending.length;
	if (skipped > 0) {
		console.info(`↪︎ Skipping ${skipped} scan(s) that already exist.`);
	}

	const created = [];
	for (const input of pending) {
		try {
			const { data } = await client.mutate({ mutation: CREATE_PROJECT, variables: { input } });
			created.push(data.createProject);
			console.info(`✅ Created scan: ${input.name} (slug: ${data.createProject.slug})`);
		} catch (error) {
			console.error(`❌ Failed to create scan "${input.name}":`, error);
		}
	}

	if (created.length > 0) {
		await client.refetchQueries({ include: [GET_PROJECTS] });
	}
	console.info(`Done. ${created.length} scan(s) created, ${skipped} skipped.`);
	return created;
}

// Attaches window.seedDev() in every environment so it can be run from the prod
// console too (creation stays SSO- and facilitator-gated server-side). The
// discoverability hint is only logged in development to avoid noise for normal users.
export function registerSeedDev(client) {
	window.seedDev = () => seedDevScans(client);
	if (isDev) {
		console.info("🌱 seedDev() ready — run seedDev() in the console to create example scans.");
	}
}
