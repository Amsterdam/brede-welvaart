import Icon from "../../common/Icon";

import "./index.scss";

export default function ListNoArguments({ theme, preview = false }) {
	return (
		<div className="theme-arguments-list">
			<div className={`theme-arguments-list-item ${preview && "theme-arguments-list-item-preview"}`}>
				<div className={"theme-arguments-list-item-indicator theme-arguments-list-item-indicator-gray"}>
					<Icon name={"cross-white"} />
				</div>
				<div className="theme-arguments-list-item-content">
					<div className="theme-arguments-list-item-content-text">
						<span className="theme-arguments-list-item-content-text-explanation">
							Niet meegenomen: Het thema {theme.name} is niet meegenomen in deze scan.
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
