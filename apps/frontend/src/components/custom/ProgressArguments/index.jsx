import _ from "lodash";

import "./index.scss";

export default function ProgressArguments({ theme }) {
	if (theme.arguments.length === 0) return;
	return (
		<div className="progress-arguments">
			{_.orderBy(theme.arguments, ["sentiment"], "desc").map((arg, argIndex) => {
				return (
					<div
						key={argIndex}
						className={`progress-arguments-item progress-arguments-item-${
							arg.sentiment === "NEGATIVE" ? "red" : arg.sentiment === "POSITIVE" ? "green" : "blue"
						}`}
					/>
				);
			})}
		</div>
	);
}
