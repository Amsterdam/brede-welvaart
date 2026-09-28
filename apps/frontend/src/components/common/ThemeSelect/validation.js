export function getThemeSelectionError(required, value) {
	return required && !value ? "Kies een thema." : null;
}
