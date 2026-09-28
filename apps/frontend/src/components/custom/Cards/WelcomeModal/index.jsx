import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { Dialog, Link, Paragraph } from "@amsterdam/design-system-react";
import { Button as UIButton } from "@shared/ui";

import "./index.scss";

// Shown once on a user's first visit to the home page. The "welcome-modal"
// dismiss flag (localStorage, handled by PopupContext) keeps it from returning.
export default function WelcomeModal({ close }) {
	const dialogRef = useRef(null);
	const navigate = useNavigate();

	useEffect(() => {
		dialogRef.current?.showModal();
	}, []);

	// Any close permanently dismisses, so the modal is truly first-visit only.
	const dismiss = () => close(true);

	const openAbout = () => {
		dismiss();
		navigate("/about");
	};

	const Footer = (
		<>
			<UIButton variant="tertiary" onClick={dismiss}>
				Misschien later
			</UIButton>
			<UIButton variant="primary" onClick={openAbout}>
				Bekijk de uitleg
			</UIButton>
		</>
	);

	return (
		<Dialog
			ref={dialogRef}
			heading="Welkom bij de Brede Welvaart Scan"
			closeButtonLabel="Sluiten"
			footer={Footer}
			onClose={dismiss}
		>
			<Paragraph>
				Wil je weten waarom de Brede Welvaart Scan is ontwikkeld en hoe je hem gebruikt als
				raadsinstrument? Op de uitlegpagina lees je meer over de scan en hoe je hem invult.
			</Paragraph>
			<div className="welcome-modal-links">
				<Link href="#/about" onClick={dismiss}>
					Lees meer over de Brede Welvaart Scan
				</Link>
				<Link href="pdf-guide.png" target="_blank" rel="noreferrer">
					Bekijk de pdf-handleiding
				</Link>
			</div>
		</Dialog>
	);
}
