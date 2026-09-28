import { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";

import { useMutation } from "@apollo/client/react";
import { USE_SHARE_LINK } from "../../graphql/mutations";
import { Alert, Paragraph, Heading } from "@amsterdam/design-system-react";

import "./index.scss";

const ERROR_MESSAGES = {
	INVALID_LINK: "Deze deel-link is ongeldig of verlopen",
	MISMATCH: "De deel-link komt niet overeen met het authenticatietoken",
	NETWORK: "Kan de deel-link niet verwerken. Probeer het opnieuw",
	UNKNOWN: "Er is een onverwachte fout opgetreden. Probeer het opnieuw",
};

export default function ShareLinkEntrypoint() {
	const { shareLink } = useParams();
	const navigate = useNavigate();
	const [useShareLink] = useMutation(USE_SHARE_LINK);
	const [notFound, setNotFound] = useState(false);

	useEffect(() => {
		if (!shareLink) {
			setNotFound(true);
			return;
		}

		useShareLink({ variables: { shareLink } })
			.then((response) => {
				const { data } = response;
				if (data.useShareLink.slug) {
					navigate(`/share/project/${data.useShareLink.slug}`);
				} else {
					setNotFound(true);
				}
			})
			.catch((error) => {
				console.error("Fout bij het gebruik van de deel-link:", error);
				setNotFound(true);
			});
	}, [shareLink]);

	if (notFound) {
		return (
			<div className="share-link-entrypoint">
				<Alert heading="Ongeldige deel-link" headingLevel={2} severity="error">
					<Paragraph>De deel-link die je hebt opgegeven, bestaat niet of is verlopen.</Paragraph>
				</Alert>
			</div>
		);
	}

	return <div className="share-link-entrypoint">Laden...</div>;
}
