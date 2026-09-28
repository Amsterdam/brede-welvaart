import Icon from "../../common/Icon";

import { SliceGraph } from "../SliceGraph";

export default function PreviewThemeHeader({ theme }) {
	return (
		<div className="transformcomponent-page-content-theme-header" data-theme-id={theme.id}>
			<div className="transformcomponent-page-content-theme-header-text">
				<div className="transformcomponent-page-content-theme-header-text-title">
					<Icon name={`${theme.slug}-straight`} />
					<h2>{theme.name}</h2>
				</div>
				<span>{theme.description}</span>
			</div>
			<SliceGraph theme={theme} />
		</div>
	);
}
