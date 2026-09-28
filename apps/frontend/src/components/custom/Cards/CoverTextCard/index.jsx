import { useEffect, useRef, useState } from "react";
import { useMutation } from "@apollo/client/react";
import { Alert, Dialog, Field, Label, Paragraph, TextArea } from "@amsterdam/design-system-react";
import { Button as UIButton } from "@shared/ui";

import { UPDATE_PROJECT } from "../../../../graphql/mutations";
import { GET_PROJECT } from "../../../../graphql/queries";

const MAX_LENGTH = 2500;

export default function CoverTextCard({ close, project }) {
	const dialogRef = useRef(null);
	const [coverText, setCoverText] = useState(project.coverText || "");
	const [errorMessage, setErrorMessage] = useState("");
	const [updateProject, { loading }] = useMutation(UPDATE_PROJECT, {
		refetchQueries: [GET_PROJECT],
	});

	useEffect(() => {
		dialogRef.current?.showModal();
	}, []);

	const handleSave = async () => {
		setErrorMessage("");
		try {
			await updateProject({
				variables: {
					updateProjectId: project.id,
					input: { coverText },
				},
			});
			close();
		} catch {
			setErrorMessage("We konden de voorbladtekst niet opslaan. Probeer het opnieuw.");
		}
	};

	const footer = (
		<>
			<UIButton variant="tertiary" onClick={close}>
				Annuleren
			</UIButton>
			<UIButton variant="primary" disabled={loading} onClick={handleSave}>
				{loading ? "Opslaan..." : "Opslaan"}
			</UIButton>
		</>
	);

	return (
		<Dialog
			ref={dialogRef}
			heading="Voorblad aanpassen"
			closeButtonLabel="Sluiten"
			footer={footer}
			onClose={close}
			className="card-dialog-large"
		>
			{errorMessage && (
				<Alert severity="error" heading="Niet opgeslagen" headingLevel={2}>
					<Paragraph>{errorMessage}</Paragraph>
				</Alert>
			)}
			<Paragraph>
				Schrijf een korte introductie en leeswijzer. De tekst staat onder de projectnaam op het voorblad.
			</Paragraph>
			<Field>
				<Label htmlFor="cover-text">Voorbladtekst</Label>
				<TextArea
					id="cover-text"
					value={coverText}
					rows={12}
					maxLength={MAX_LENGTH}
					resize="vertical"
					onChange={(event) => setCoverText(event.target.value)}
				/>
			</Field>
			<Paragraph size="small">
				{coverText.length} van {MAX_LENGTH} tekens
			</Paragraph>
		</Dialog>
	);
}
