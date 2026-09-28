import { Heading, Paragraph } from "@amsterdam/design-system-react";

import Icon from "../../components/common/Icon";

import "./index.scss";

export default function UnsupportedScreen() {
	return (
		<div className="unsupported-screen">
			<div className="unsupported-screen-header">
				<Icon name={"logo-blue"} />
				<Heading level={1}>Brede Welvaart Scan</Heading>
			</div>
			<div className="unsupported-screen-content">
				<Icon name={"unsupported-screen"} />
				<div className="unsupported-screen-content-text">
					<Heading level={3}>Schermformaat nog niet ondersteund</Heading>
					<Paragraph>
						Op dit moment wordt het schermformaat dat je gebruikt niet ondersteund voor de pilot. Gebruik
						een scherm breder dan 1250px.
					</Paragraph>
				</div>
			</div>
			<div className="unsupported-screen-footer">
				<a href={`mailto:${import.meta.env.VITE_CONTACT_EMAIL || "innovatie@amsterdam.nl"}`}>Bij vragen neem contact met ons op</a>
			</div>
		</div>
	);
}
