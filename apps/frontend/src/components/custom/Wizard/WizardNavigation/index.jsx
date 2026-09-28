import { useParams } from "react-router-dom";

import ThemesBar from "./ThemesBar";
import ThemeOverviewBar from "./ThemeOverviewBar";

export default function WizardNavigation({ project }) {
	const { themeSlug } = useParams();

	return (
		<div className="wizard-content-editor-header">
			{themeSlug ? <ThemeOverviewBar project={project} /> : <ThemesBar project={project} />}
		</div>
	);
}
