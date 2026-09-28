import { useQuery } from "@apollo/client/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { Paragraph, Alert } from "@amsterdam/design-system-react";

import { Button as UIButton, Spinner } from "@shared/ui";
import { useAuth } from "@shared/ui/context/AuthContext";
import { usePopup } from "@shared/ui/context/PopupContext";

import Icon from "../../components/common/Icon";
import { GET_PROJECT } from "../../graphql/queries";

import "./index.scss";

export default function Header() {
	const { projectSlug } = useParams();
	const { getAccessToken } = useAuth();
	const [isDownloading, setIsDownloading] = useState(false);
	const [errorMessage, setErrorMessage] = useState(null);
	const [copyLinkLabel, setCopyLinkLabel] = useState();

	const { data, loading, error } = useQuery(GET_PROJECT, {
		variables: { slug: projectSlug },
		fetchPolicy: "cache-first",
		skip: !projectSlug,
	});

	const copyShareLinkToClipboard = () => {
		const shareLink = `${window.location.origin}/#/share/link/${data.project.shareLink}`;
		navigator.clipboard
			.writeText(shareLink)
			.then(() => {
				console.warn("Link gekopieerd naar klembord:", shareLink);
				setCopyLinkLabel("Link gekopieerd!");

				window.setTimeout(() => {
					setCopyLinkLabel();
				}, 5000);
			})
			.catch((err) => {
				console.error("Fout bij het kopiëren van de link:", err);
			});
	};

	const downloadPDF = async () => {
		try {
			setIsDownloading(true);
			const requestOptions = {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${await getAccessToken()}`,
				},
			};
			const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/pdf/${projectSlug}`, requestOptions);
			if (!response.ok) {
				throw new Error((await response.json().message) || "Fout bij het ophalen van de PDF");
			}
			const blob = await response.blob();
			const url = window.URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `${projectSlug}.pdf`;
			link.click();
		} catch (error) {
			console.error("Fout bij het downloaden van de PDF:", error);
			setErrorMessage("Er is een fout opgetreden bij het downloaden van de PDF.");
		} finally {
			setIsDownloading(false);
			window.setTimeout(() => {
				setErrorMessage(null);
			}, 5000);
		}
	};

	if (!projectSlug || loading || error) {
		return;
	}

	return (
		<div className="header">
			{errorMessage && (
				<Alert severity="error" style={{ marginBottom: "16px" }}>
					<Paragraph>{errorMessage}</Paragraph>
				</Alert>
			)}
			<span>{data.project.name}</span>
			<div className="header-buttons">
				<UIButton variant="primary" onClick={copyShareLinkToClipboard}>
					{!copyLinkLabel && <Icon name={"link-white"} />}
					{copyLinkLabel || "Kopieer link"}
				</UIButton>
				<UIButton variant="secondary" onClick={downloadPDF}>
					{isDownloading ? <Spinner /> : <Icon name={"download"} />}
					Exporteer PDF
				</UIButton>
			</div>
		</div>
	);
}
