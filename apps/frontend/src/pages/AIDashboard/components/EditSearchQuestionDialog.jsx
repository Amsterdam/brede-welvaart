import { useEffect, useRef, useState } from "react";
import { useMutation } from "@apollo/client/react";
import { Alert, Button, Dialog, Field, Label, Paragraph, TextArea } from "@amsterdam/design-system-react";

import { START_PROJECT_AI_ANALYSIS } from "../../../graphql/mutations";
import { GET_PROJECT_AI_ANALYSIS } from "../../../graphql/queries";

// Rendered inside the PopupManager overlay, same pattern as EditArgumentCard.
// Props: close (injected by showCard), projectId, currentQuestion
export default function EditSearchQuestionDialog({ close, projectId, currentQuestion }) {
	const dialogRef = useRef(null);
	const [question, setQuestion] = useState(currentQuestion ?? "");

	const [startAnalysis, { loading, error }] = useMutation(START_PROJECT_AI_ANALYSIS, {
		refetchQueries: [
			{
				query: GET_PROJECT_AI_ANALYSIS,
				variables: { projectId },
			},
		],
		awaitRefetchQueries: true,
	});

	useEffect(() => {
		dialogRef.current?.showModal();
	}, []);

	async function handleSubmit() {
		try {
			await startAnalysis({
				variables: { projectId, searchQuestion: question.trim() || undefined },
			});
			close();
		} catch {
			// Keep the dialog open so the error message remains visible.
		}
	}

	return (
		<Dialog
			ref={dialogRef}
			heading="Zoekvraag aanpassen"
			closeButtonLabel="Sluiten"
			onClose={close}
			className="ai-dashboard-search-dialog"
			footer={
				<>
					<Button
						variant="primary"
						onClick={handleSubmit}
						disabled={loading || !question.trim()}
					>
						{loading ? "Verkenning starten…" : "Verkenning opnieuw starten"}
					</Button>
					<Button variant="secondary" onClick={close} disabled={loading}>
						Annuleren
					</Button>
				</>
			}
		>
			<Paragraph>
				Pas de zoekvraag aan. Daarna starten we de AI-verkenning opnieuw. Je kunt bijvoorbeeld inzoomen op
				een specifiek effect, onderwerp of thema.
			</Paragraph>
			{error && (
				<Alert heading="Niet gelukt" headingLevel={2} severity="error">
					<Paragraph>De verkenning kon niet opnieuw worden gestart.</Paragraph>
				</Alert>
			)}
			<Field>
				<Label htmlFor="search-question-input">Zoekvraag</Label>
				<TextArea
					id="search-question-input"
					value={question}
					onChange={(e) => setQuestion(e.target.value)}
					rows={4}
				/>
			</Field>
		</Dialog>
	);
}
