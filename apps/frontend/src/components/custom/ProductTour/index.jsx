import { useEffect } from "react";
import { TourGuideClient } from "@sjmc11/tourguidejs";
import "@sjmc11/tourguidejs/dist/css/tour.min.css";

import "./index.scss";

const TOUR_GROUPS = {
	project: "product-page-introduction",
	aiEffects: "product-page-ai-effects",
};

const PROJECT_STEPS = [
	{
		title: "Verkennen met AI",
		content: "Begin hier. De AI zoekt mogelijke effecten in onderzoeksbronnen en geüploade documenten.",
		target: "[data-tour='ai-exploration']",
	},
	{
		title: "Maak de productpagina compleet",
		content: "Pas hier het voorblad aan en voeg de kernboodschap toe.",
		target: "[data-tour='product-actions']",
	},
	{
		title: "Voeg effecten per thema toe",
		content: "Kies een thema om effecten toe te voegen, te bekijken of te bewerken.",
		target: "[data-tour='topic-list']",
	},
];

const AI_EFFECTS_STEPS = [
	{
		title: "Bekijk de AI-effecten",
		content: "Hier staan de AI-effecten die je hebt gekozen. Met de pijl open en sluit je de groep.",
		target: "[data-tour='ai-effects-toggle']",
	},
	{
		title: "Maak een effect van een resultaat",
		content: "Kies een AI-resultaat. Controleer het, kies een thema en voeg het toe aan de scan.",
		target: "[data-tour='ai-effects-list']",
	},
];

function improveDialogAccessibility(tour) {
	tour.dialog.setAttribute("role", "dialog");
	tour.dialog.setAttribute("aria-modal", "true");
	tour.dialog.setAttribute("aria-labelledby", "tg-dialog-title");
	tour.dialog.setAttribute("aria-describedby", "tg-dialog-body");

	const closeButton = tour.dialog.querySelector(".tg-dialog-close-btn");
	if (closeButton) {
		closeButton.setAttribute("role", "button");
		closeButton.setAttribute("tabindex", "0");
		closeButton.setAttribute("aria-label", "Rondleiding sluiten");
	}
}

export default function ProductTour({ phase }) {
	useEffect(() => {
		if (!phase) return undefined;

		const group = TOUR_GROUPS[phase];
		const steps = (phase === "aiEffects" ? AI_EFFECTS_STEPS : PROJECT_STEPS).map((step, order) => ({
			...step,
			order,
			group,
		}));
		const tour = new TourGuideClient({
			steps,
			dialogClass: "ams-product-tour",
			backdropClass: "ams-product-tour-backdrop",
			backdropColor: "rgba(32, 32, 32, 0.76)",
			targetPadding: 8,
			nextLabel: "Volgende",
			prevLabel: "Vorige",
			finishLabel: "Klaar",
			showStepDots: false,
			showStepProgress: true,
			keyboardControls: true,
			exitOnEscape: true,
			exitOnClickOutside: false,
			rememberStep: false,
			debug: false,
		});

		const startTour = window.setTimeout(() => {
			if (tour.isFinished(group)) return;
			tour.start(group).then(() => {
				improveDialogAccessibility(tour);
				tour.dialog.querySelector("#tg-dialog-next-btn")?.focus();
			});
		}, 250);

		return () => {
			window.clearTimeout(startTour);
			if (tour.isVisible) tour.exit();
			tour.dialog?.remove();
			tour.backdrop?.remove();
		};
	}, [phase]);

	return null;
}
