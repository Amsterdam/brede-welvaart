import { useState, useEffect, useRef } from "react";

import { useMutation } from "@apollo/client/react";
import { GET_PROJECT } from "../../../../graphql/queries";
import { DELETE_PROJECT_DOCUMENT } from "../../../../graphql/mutations";

import { Button as UIButton } from "@shared/ui";
import { Alert, Dialog, Paragraph } from "@amsterdam/design-system-react";

// Small confirm dialog for removing an uploaded document. Rendered via
// usePopup().showCard, same pattern as DeleteArgumentsCard.
// Props (besides `close`, injected by showCard): projectId, documentId, documentName
export default function DeleteDocumentCard({ close, projectId, documentId, documentName }) {
	const dialogRef = useRef(null);
	const [errorMessage, setErrorMessage] = useState("");

	const [deleteDocument, { loading }] = useMutation(DELETE_PROJECT_DOCUMENT, {
		refetchQueries: [GET_PROJECT],
	});

	useEffect(() => {
		dialogRef.current?.showModal();
	}, []);

	async function handleDelete() {
		setErrorMessage("");
		try {
			await deleteDocument({ variables: { projectId, documentId } });
			close();
		} catch {
			setErrorMessage("Het document kon niet worden verwijderd. Probeer het opnieuw.");
		}
	}

	const Footer = (
		<>
			<UIButton variant="primary" onClick={handleDelete} disabled={loading}>
				{loading ? "Bezig met verwijderen…" : "Verwijderen"}
			</UIButton>
			<UIButton variant="tertiary" onClick={() => close()} disabled={loading}>
				Annuleren
			</UIButton>
		</>
	);

	return (
		<Dialog ref={dialogRef} heading="Document verwijderen?" closeButtonLabel="Sluiten" footer={Footer} onClose={close}>
			{errorMessage && (
				<Alert severity="error" style={{ marginBottom: "16px" }}>
					<Paragraph>{errorMessage}</Paragraph>
				</Alert>
			)}
			<Paragraph>
				Weet je zeker dat je {documentName ? `“${documentName}”` : "dit document"} wilt verwijderen? Je
				kunt dit niet ongedaan maken. Effecten die je al aan de scan hebt toegevoegd, blijven staan.
			</Paragraph>
		</Dialog>
	);
}
