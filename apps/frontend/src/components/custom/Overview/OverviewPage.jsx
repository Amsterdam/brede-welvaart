import OverviewItem from "./OverviewItem";

import "./index.scss";
import Icon from "../../common/Icon";

export default function OverviewPage({ themes }) {
	return (
		<div className="overview-wrapper">
			<div className="overview-header">
				<h2>Effectenoverzicht</h2>
				<div className="overview-header-legend">
					<span>Legenda:</span>
					<div className="overview-header-legend-item">
						<Icon name={"overview-legend-positive"} />
						<span>Positieve impact</span>
					</div>
					<div className="overview-header-legend-item">
						<Icon name={"overview-legend-neutral"} />
						<span>Neutrale impact</span>
					</div>
					<div className="overview-header-legend-item">
						<Icon name={"overview-legend-negative"} />
						<span>Negatieve impact</span>
					</div>
				</div>
			</div>
			<div className="overview-items">
				{themes.map((theme, themeIndex) => {
					return <OverviewItem theme={theme} key={themeIndex} />;
				})}
			</div>
		</div>
	);
}
