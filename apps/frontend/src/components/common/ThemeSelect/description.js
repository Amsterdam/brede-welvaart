export function getShortThemeDescription(description = "") {
	return (
		description
			.trim()
			.match(/^.*?[.!?](?:\s|$)/)?.[0]
			.trim() || description.trim()
	);
}
