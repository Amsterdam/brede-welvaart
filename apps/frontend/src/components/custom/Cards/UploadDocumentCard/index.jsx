import { useEffect, useRef, useState } from "react";
import { useApolloClient } from "@apollo/client/react";
import { Alert, Dialog, ErrorMessage, Field, FileInput, Hint, Label, Paragraph } from "@amsterdam/design-system-react";
import { Button as UIButton } from "@shared/ui";
import { useAuth } from "@shared/ui/context/AuthContext";

import { GET_PROJECT } from "../../../../graphql/queries";

import "./index.scss";

const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;
const DOCUMENT_ACCEPT_TYPES = [
	".pdf",
	".doc",
	".docx",
	".txt",
	".rtf",
	"application/pdf",
	"application/msword",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"text/plain",
	"application/rtf",
].join(",");

function getFileNameWithoutExtension(fileName) {
	return fileName.replace(/\.[^.]+$/, "");
}

async function getUploadErrorMessage(response) {
	try {
		const body = await response.json();
		return body?.errors?.[0]?.message || "Het document kon niet worden geüpload.";
	} catch {
		return "Het document kon niet worden geüpload.";
	}
}

export default function UploadDocumentCard({ close, project, theme }) {
	const dialogRef = useRef(null);
	const client = useApolloClient();
	const { getAccessToken } = useAuth();

	const [file, setFile] = useState(null);
	const [localError, setLocalError] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	useEffect(() => {
		dialogRef.current?.showModal();
	}, []);

	function handleFileChange(event) {
		const selectedFile = event.target.files?.[0] ?? null;
		setLocalError("");
		setError("");
		setFile(selectedFile);
	}

	async function handleSubmit() {
		setLocalError("");
		setError("");

		if (!file) {
			setLocalError("Kies een bestand.");
			return;
		}
		if (file.size > MAX_UPLOAD_SIZE_BYTES) {
			setLocalError("Het bestand mag maximaal 100 MB zijn.");
			return;
		}
		setLoading(true);
		try {
			const token = await getAccessToken();
			if (!token) {
				throw new Error("Log opnieuw in om je document te uploaden.");
			}

			const formData = new FormData();
			formData.set("themeSlug", theme.slug);
			formData.set("name", getFileNameWithoutExtension(file.name));
			formData.set("file", file, file.name);

			const response = await fetch(`${import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"}/projects/${project.id}/upload-document`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
				},
				body: formData,
			});

			if (!response.ok) {
				throw new Error(await getUploadErrorMessage(response));
			}

			await client.refetchQueries({ include: [GET_PROJECT] });
			close();
		} catch (uploadError) {
			setError(uploadError instanceof Error ? uploadError.message : "Het document kon niet worden geüpload.");
		} finally {
			setLoading(false);
		}
	}

	const Footer = (
		<>
			<UIButton variant="primary" disabled={loading} onClick={handleSubmit}>
				{loading ? "Bezig met uploaden..." : "Doorgaan"}
			</UIButton>
			<UIButton variant="secondary" disabled={loading} onClick={close}>
				Stoppen
			</UIButton>
		</>
	);

	return (
		<Dialog
			ref={dialogRef}
			heading="Upload je eigen document"
			closeButtonLabel="Sluiten"
			footer={Footer}
			onClose={close}
			className="upload-document-dialog"
		>
			<div className="upload-document-card">
				<Alert heading="Let op: geen persoonsgegevens" headingLevel={2} severity="warning">
					<Paragraph>
						Upload geen documenten met persoonsgegevens, zoals namen, adressen of
						burgerservicenummers. Verwijder deze gegevens eerst uit het document.
					</Paragraph>
				</Alert>

				{(localError || error) && (
					<Alert heading="Niet gelukt" headingLevel={2} severity="error">
						<Paragraph>{localError || error}</Paragraph>
					</Alert>
				)}

				<Field invalid={Boolean(localError && !file)}>
					<Label htmlFor="upload-document-file">Document</Label>
					<FileInput
						accept={DOCUMENT_ACCEPT_TYPES}
						aria-describedby="upload-document-file-hint"
						id="upload-document-file"
						onChange={handleFileChange}
					/>
					<Hint id="upload-document-file-hint">Upload een document van maximaal 100 MB.</Hint>
					{localError && !file && (
						<ErrorMessage id="upload-document-file-error" prefix="Fout">
							{localError}
						</ErrorMessage>
					)}
				</Field>
			</div>
		</Dialog>
	);
}
