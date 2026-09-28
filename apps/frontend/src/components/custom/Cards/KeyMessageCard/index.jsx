import { useState, useEffect, useRef } from "react";
import TextareaAutosize from "react-textarea-autosize";
import _ from "lodash";

import { useMutation } from "@apollo/client/react";
import { GET_PROJECT } from "../../../../graphql/queries";
import { GENERATE_PROJECT_KEY_MESSAGE, UPDATE_PROJECT } from "../../../../graphql/mutations";
import {
	getLocationOption,
	getSentimentOption,
	getSourceTypeOption,
	getTimeOption,
	locationOptions,
	timeOptions,
} from "../../../../utils/argumentValues";
import {
	ArgumentImportance,
	ArgumentLocation,
	ArgumentSentiment,
	ArgumentSourceType,
	ArgumentTimeFrame,
} from "@shared/types";

import { Button as UIButton } from "@shared/ui";
import { Dialog } from "@amsterdam/design-system-react";

import Icon from "../../../common/Icon";

import TextAreaWithMention from "../../Mention/TextAreaWithMention";

import "./index.scss";
import TextWithMention from "../../Mention/TextWithMention";
import { readGeneratedKeyMessage } from "./keyMessageResult";

export default function KeyMessageCard({ close, project }) {
	const dialogRef = useRef(null);
	const [message, setMessage] = useState(project.keyMessage || "• ");
	const [generationError, setGenerationError] = useState("");

	const [updateProject, { error: updateProjectError }] = useMutation(UPDATE_PROJECT, {
		refetchQueries: [GET_PROJECT],
	});
	const [generateKeyMessage, { loading: isGenerating }] = useMutation(GENERATE_PROJECT_KEY_MESSAGE);

	useEffect(() => {
		dialogRef.current?.showModal();
	}, []);

	useEffect(() => {
		if (updateProjectError) {
			console.error("Fout bij het aanpassen van het project:", updateProjectError.message);
		}
	}, [updateProjectError]);

	const handleChange = (e) => {
		const newValue = e;
		// Detect added character
		if (newValue.length > message.length && newValue.endsWith("\n")) {
			const lines = newValue.split("\n");
			const lastLine = lines[lines.length - 2]; // get line before the new one
			if (lastLine?.trim() === "•") {
				// Don't allow a new empty bullet line
				return;
			}
			// Add bullet to the new line
			setMessage(newValue + "• ");
		} else {
			setMessage(newValue);
		}
	};

	const handleSave = () => {
		updateProject({
			variables: {
				updateProjectId: project.id,
				input: {
					keyMessage: message,
				},
			},
		}).then(() => close());
	};

	const handleGenerate = async () => {
		setGenerationError("");
		try {
			const { data } = await generateKeyMessage({ variables: { projectId: project.id } });
			setMessage(readGeneratedKeyMessage(data));
		} catch (error) {
			console.error("Fout bij het maken van de kernboodschap:", error);
			setGenerationError("De kernboodschap is niet gemaakt. Probeer het later opnieuw.");
		}
	};

	const Footer = (
		<>
			<UIButton variant="tertiary" onClick={() => setMessage("• ")}>
				Alles wissen
			</UIButton>
			<UIButton disabled={!message} variant="primary" onClick={() => handleSave()}>
				Opslaan
			</UIButton>
		</>
	);

	return (
		<Dialog
			ref={dialogRef}
			heading="Kernboodschap schrijven"
			closeButtonLabel="Sluiten"
			footer={Footer}
			onClose={close}
			className="card-dialog-large"
		>
			<div className="card-content-key-message-ai-action">
				<UIButton variant="ai" onClick={handleGenerate} disabled={isGenerating}>
					{isGenerating ? "Concept maken..." : "Maak AI-concept"}
				</UIButton>
				<span>Je kunt het concept daarna aanpassen en opslaan.</span>
			</div>
			{generationError && (
				<div className="card-content-key-message-error" role="alert" id="key-message-generation-error">
					{generationError}
				</div>
			)}
			<div className="card-content-key-message-info">
				<span className="card-content-key-message-info-text">
					De kernboodschap wordt getoond op pagina 1. Hierin vat je eigenlijk de kern van het document
					samen. Hiervoor is een maximaal aantal karakters en je kunt thema's toevoegen door # en de naam
					van het thema te schrijven.
				</span>
				<div className="card-content-key-message-info-example">
					<span>Voorbeeld</span>
					<ul>
						<li>
							<TextWithMention
								text={
									"Windturbine ontwikkeling leidt tot een meer veerkrachtig en duurzaam energiesysteem. #natuurlijk-kapitaal"
								}
							/>
						</li>
						<li>
							<TextWithMention
								text={
									"Echter, mogelijke negatieve effecten op #natuurlijk-kapitaal (verstoring habitat en ecosystemen, verlies van biodiversiteit), #gezondheid . (slagschaduw en geluid) en #wonen (waardevermindering en beperking mogelijkheden woningbouw)."
								}
							/>
						</li>
					</ul>
				</div>
			</div>
			<div className="textarea-div">
				<TextAreaWithMention
					themes={project.themes}
					text={message}
					handleChange={handleChange}
					aria-describedby={generationError ? "key-message-generation-error" : undefined}
				/>
			</div>
		</Dialog>
	);
}
