import { useState, useRef, useEffect } from "react";
import TextareaAutosize from "react-textarea-autosize";
import _ from "lodash";

import { useMutation } from "@apollo/client/react";
import { GET_PROJECT, GET_PROJECTS } from "../../../../graphql/queries";
import { DELETE_PROJECT, DUPLICATE_PROJECT, UPDATE_PROJECT } from "../../../../graphql/mutations";
import { getStatusIcon, getStatusOption } from "../../../../utils/projectValues";
import { ProjectStatus } from "@shared/types";

import { Button as UIButton } from "@shared/ui";
import { Paragraph, TextInput, Alert, Dialog } from "@amsterdam/design-system-react";

import Icon from "../../../common/Icon";

import "./index.scss";

export default function ProjectSettingsCard({ close, project }) {
	const dialogRef = useRef(null);
	const [cardType, setCardType] = useState("settings");
	const [name, setName] = useState(project.name);
	const [description, setDescription] = useState(project.description);
	const [status, setStatus] = useState(project.status);
	const [errorMessage, setErrorMessage] = useState("");

	const statusOptions = Object.values(ProjectStatus);

	const [updateProject, { loading: updateLoading }] = useMutation(UPDATE_PROJECT, {
		refetchQueries: [GET_PROJECT],
	});
	const [deleteProject, { loading: deleteLoading }] = useMutation(DELETE_PROJECT, {
		refetchQueries: [GET_PROJECTS],
	});
	const [duplicateProject, { loading: duplicateLoading }] = useMutation(DUPLICATE_PROJECT, {
		refetchQueries: [GET_PROJECTS],
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
					input: {
						name: name,
						description: description,
						status: status,
					},
				},
			});
			close();
		} catch (error) {
			setErrorMessage("Er is een fout opgetreden bij het opslaan van het project.");
		}
	};

	const handleDelete = async () => {
		setErrorMessage("");
		try {
			await deleteProject({
				variables: {
					deleteProjectId: project.id,
				},
			});
			close();
		} catch (error) {
			setErrorMessage("Er is een fout opgetreden bij het verwijderen van het project.");
		}
	};

	const handleDuplicate = async () => {
		setErrorMessage("");
		try {
			await duplicateProject({
				variables: {
					duplicateProjectId: project.id,
				},
			});
			close();
		} catch (error) {
			setErrorMessage("Er is een fout opgetreden bij het dupliceren van het project.");
		}
	};

	const headingMap = {
		settings: "Instellingen",
		name: "Naam bewerken",
		description: "Beschrijving bewerken",
		status: "Status bewerken",
		delete: "Weet je het zeker?",
	};

	const getFooter = () => {
		switch (cardType) {
			case "settings":
				return (
					<>
						<UIButton
							variant="secondary"
							onClick={() => handleDuplicate()}
							disabled={duplicateLoading}
							style={{ marginRight: "16px" }}
						>
							{duplicateLoading ? "Dupliceren..." : "Dupliceer project"}
						</UIButton>
						<UIButton
							variant="tertiary"
							onClick={() => setCardType("delete")}
							style={{ marginRight: "auto" }}
						>
							Verwijder project
						</UIButton>
					</>
				);
			case "delete":
				return (
					<>
						<UIButton disabled={deleteLoading} variant="primary" onClick={() => handleDelete()}>
							{deleteLoading ? "Verwijderen..." : "Verwijder project"}
						</UIButton>
						<UIButton variant="tertiary" onClick={() => close()}>
							Annuleer
						</UIButton>
					</>
				);
			case "name":
				return (
					<>
						<UIButton variant="tertiary" onClick={() => close()}>
							Annuleren
						</UIButton>
						<UIButton
							disabled={!name.trim() || updateLoading}
							variant="primary"
							onClick={() => handleSave()}
						>
							{updateLoading ? "Opslaan..." : "Opslaan"}
						</UIButton>
					</>
				);
			case "description":
				return (
					<>
						<UIButton variant="tertiary" onClick={() => close()}>
							Annuleren
						</UIButton>
						<UIButton
							disabled={!description.trim() || updateLoading}
							variant="primary"
							onClick={() => handleSave()}
						>
							{updateLoading ? "Opslaan..." : "Opslaan"}
						</UIButton>
					</>
				);
			case "status":
				return (
					<>
						<UIButton variant="tertiary" onClick={() => close()}>
							Annuleren
						</UIButton>
						<UIButton disabled={updateLoading} variant="primary" onClick={() => handleSave()}>
							{updateLoading ? "Opslaan..." : "Opslaan"}
						</UIButton>
					</>
				);
			default:
				return null;
		}
	};

	const getContent = () => {
		switch (cardType) {
			case "settings":
				return (
					<>
						<div
							className="card-content-project-settings-item"
							onClick={() => setCardType("name")}
						>
							<div className="card-content-project-settings-item-text">
								<span>Naam project</span>
								<span>{project.name}</span>
							</div>
							<Icon name="chevron-right" />
						</div>
						<div
							className="card-content-project-settings-item"
							onClick={() => setCardType("description")}
						>
							<div className="card-content-project-settings-item-text">
								<span>Beschrijving</span>
								<span>{project.description}</span>
							</div>
							<Icon name="chevron-right" />
						</div>
						<div
							className="card-content-project-settings-item"
							onClick={() => setCardType("status")}
						>
							<div className="card-content-project-settings-item-text">
								<span>Status</span>
								<div className={`project-status project-status-${project.status}`}>
									<Icon name={getStatusIcon(project.status)} />
									<span>{getStatusOption(project.status)}</span>
								</div>
							</div>
							<Icon name="chevron-right" />
						</div>
					</>
				);
			case "name":
				return <TextInput value={name} onChange={(e) => setName(e.target.value)} />;
			case "description":
				return (
					<div className="textarea-div">
						<TextareaAutosize
							className="textarea"
							minRows={4}
							maxLength={200}
							value={description}
							onChange={(e) => {
								if (e.target.value.length > 200) return;
								setDescription(e.target.value);
							}}
						/>
						<span className="textarea-chars">{description.length} / 200 karakters</span>
					</div>
				);
			case "status":
				return (
					<div className="card-content-project-settings-set-status">
						{statusOptions.map((statusOption, sIndex) => {
							if (statusOption === "ARCHIVED") return null;
							return (
								<div
									className={`project-status ${statusOption === status ? `project-status-${statusOption}` : ""}`}
									onClick={() => setStatus(statusOption)}
									key={sIndex}
								>
									<Icon name={getStatusIcon(statusOption)} />
									<span>{getStatusOption(statusOption)}</span>
								</div>
							);
						})}
					</div>
				);
			case "delete":
				return (
					<Paragraph>
						Weet je zeker dat je het project "<b>{project.name}</b>" wilt verwijderen? Wanneer je het
						project verwijdert, kun je de content niet meer terughalen.
					</Paragraph>
				);
			default:
				return null;
		}
	};

	return (
		<Dialog
			ref={dialogRef}
			heading={headingMap[cardType] || "Instellingen"}
			closeButtonLabel="Sluiten"
			footer={getFooter()}
			onClose={close}
		>
			{errorMessage && (
				<Alert severity="error" style={{ marginBottom: "16px" }}>
					<Paragraph>{errorMessage}</Paragraph>
				</Alert>
			)}
			{getContent()}
		</Dialog>
	);
}
