export default function ThemesBar({ project }) {
	const themesWithArguments = project.themes.filter((theme) => theme.arguments.length > 0);
	return (
		<>
			<span>Thema's toevoegen</span>
			<span>{themesWithArguments.length}/10</span>
		</>
	);
}
