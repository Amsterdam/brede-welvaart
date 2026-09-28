import _ from "lodash";

import { getCssClass, getSentimentIcon } from "../../../utils/argumentValues";

import Icon from "../../common/Icon";
import { ArgumentImportance } from "../../../../../shared/types/src";

export default function OverviewItem({ theme }) {
	return (
		<div className="overview-items-theme">
			<div className="overview-items-theme-header">
				<Icon name={`${theme.slug}-straight`} />
				<h3>{theme.name}</h3>
			</div>
			<div className="overview-items-theme-items">
				{_.orderBy(theme.arguments, ["sentiment"], "desc").map((argument, argumentIndex) => {
					if (argument.importance !== ArgumentImportance.High) return;
					return (
						<div className="overview-items-theme-items-argument" key={argumentIndex}>
							<div
								className={`overview-items-theme-items-argument-indicator overview-items-theme-items-argument-indicator-${getCssClass(argument)}`}
							>
								<Icon name={getSentimentIcon(argument.sentiment, false, true)} />
							</div>
							<span>{argument.title}</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
