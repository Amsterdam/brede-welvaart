import { Heading } from "@amsterdam/design-system-react";

import Icon from "../../../common/Icon";

import "./index.scss";

export default function HomeCardItem({ icon, title, children }) {
	return (
		<div className="homecard-item">
			<div className="homecard-item-header">
				<Icon name={icon} />
				<Heading level={4}>{title}</Heading>
			</div>
			{children}
		</div>
	);
}
