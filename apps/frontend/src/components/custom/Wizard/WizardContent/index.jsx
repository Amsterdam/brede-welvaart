import { useNavigate, useParams } from "react-router-dom";

import Icon from "../../../common/Icon";

import Themes from "./Themes";
import ThemeOverview from "./ThemeOverview";

export default function WizardContent({ project }) {
	const { projectSlug, themeSlug } = useParams();

	return (
		<div className="wizard-content-editor-content">
			{themeSlug ? <ThemeOverview project={project} /> : <Themes project={project} />}
		</div>
	);
}
