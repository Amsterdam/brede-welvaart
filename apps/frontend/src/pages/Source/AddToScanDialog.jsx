import { useEffect, useRef, useState } from "react";
import { Alert, Button, Dialog, Paragraph } from "@amsterdam/design-system-react";

// Rendered via the PopupManager (showCard), same pattern as EditSearchQuestionDialog.
// Confirms adding the selected AI results to the scan as project-level drafts. The
// theme is chosen later, when a draft is converted into an effect.
// Props (besides `close`, injected by showCard):
//   count            number of selected results
//   onConfirm()      async; resolves on success, throws on failure
export default function AddToScanDialog({ close, count, onConfirm }) {
	const dialogRef = useRef(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		dialogRef.current?.showModal();
	}, []);

	async function handleConfirm() {
		setError("");
		setLoading(true);
		try {
			await onConfirm();
			close();
		} catch {
			setError("De resultaten konden niet worden toegevoegd. Probeer het opnieuw.");
			setLoading(false);
		}
	}

	const countLabel = count === 1 ? "1 resultaat" : `${count} resultaten`;

	return (
		<Dialog
			ref={dialogRef}
			heading="Resultaten naar de scan"
			closeButtonLabel="Sluiten"
			onClose={close}
			footer={
				<>
					<Button variant="primary" onClick={handleConfirm} disabled={loading}>
						{loading ? "Bezig met toevoegen…" : "Toevoegen aan scan"}
					</Button>
					<Button variant="secondary" onClick={close} disabled={loading}>
						Annuleren
					</Button>
				</>
			}
		>
			<Paragraph>
				Je zet {countLabel} klaar in de scan. Je kiest per effect onder welk thema het komt
				wanneer je het effect uitwerkt.
			</Paragraph>

			{error && (
				<Alert heading="Niet gelukt" headingLevel={2} severity="error">
					<Paragraph>{error}</Paragraph>
				</Alert>
			)}
		</Dialog>
	);
}
