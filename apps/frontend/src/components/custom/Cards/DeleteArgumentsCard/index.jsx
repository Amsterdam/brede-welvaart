import { useState, useEffect, useRef } from "react";

import { useMutation } from "@apollo/client/react";
import { GET_PROJECT } from "../../../../graphql/queries";
import { DELETE_ARGUMENTS } from "../../../../graphql/mutations";

import { Button as UIButton } from "@shared/ui";
import { Alert, Dialog, Paragraph } from "@amsterdam/design-system-react";

import "./index.scss";

export default function DeleteArgumentsCard({ close, project, argsToDelete, setArgsToDelete }) {
	const dialogRef = useRef(null);
	const [errorMessage, setErrorMessage] = useState("");

	const [deleteArgument, { error: deleteArgumentError }] = useMutation(DELETE_ARGUMENTS, {
		refetchQueries: [GET_PROJECT],
	});

	useEffect(() => {
		dialogRef.current?.showModal();
	}, []);

	useEffect(() => {
		if (deleteArgumentError) {
			console.error("Fout bij het verwijderen van effecten:", deleteArgumentError.message);
			setErrorMessage("Er is een fout opgetreden bij het verwijderen van effecten.");
		}
	}, [deleteArgumentError]);

	const handleDelete = async () => {
		try {
			await deleteArgument({
				variables: {
					projectId: project.id,
					argumentIds: argsToDelete,
				},
			});
			setArgsToDelete([]);
			close();
		} catch (error) {
			setErrorMessage("Er is een fout opgetreden bij het verwijderen van effecten.");
		}
	};

	const Footer = (
		<>
			<UIButton variant="primary" onClick={async () => handleDelete()}>
				Verwijderen
			</UIButton>
			<UIButton
				variant="tertiary"
				onClick={() => {
					close();
				}}
			>
				Annuleren
			</UIButton>
		</>
	);

	return (
		<Dialog
			ref={dialogRef}
			heading="Weet je het zeker?"
			closeButtonLabel="Sluiten"
			footer={Footer}
			onClose={close}
		>
			{errorMessage && (
				<Alert severity="error" style={{ marginBottom: "16px" }}>
					<Paragraph>{errorMessage}</Paragraph>
				</Alert>
			)}
			<Paragraph>
				Weet je zeker dat je alle effecten wilt verwijderen? Wanneer je verwijdert, kun je de content niet
				meer terughalen.
			</Paragraph>
		</Dialog>
	);
}
