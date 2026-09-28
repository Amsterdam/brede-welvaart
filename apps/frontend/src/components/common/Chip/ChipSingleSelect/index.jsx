import Icon from "../../Icon";

import "./index.scss";

export default function ChipSingleSelect({
	click = () => {},
	color = "default",
	iconName = false,
	text,
	error = false,
}) {
	const className = `chip-single-select chip-single-select-${color}${error ? " chip-single-select-error" : ""}`;

	return (
		<div className={className} onClick={click}>
			{iconName && <Icon name={iconName} />}
			<span>{text}</span>
		</div>
	);
}
