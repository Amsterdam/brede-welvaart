import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import moment from "moment";
import { Spinner } from "@shared/ui";

import { useQuery } from "@apollo/client/react";
import { GET_PROJECTS } from "../../graphql/queries";

import { getStatusIcon, getStatusOption } from "../../utils/projectValues";
import { getProjectEditorPath } from "../../utils/projectIntake";
import { usePopup } from "@shared/ui/context/PopupContext";
import { useAuth } from "@shared/ui/context/AuthContext";

import { Heading, Paragraph, Alert, SearchField } from "@amsterdam/design-system-react";

import Icon from "../../components/common/Icon";
import Preview from "../../components/custom/CircularGraph/Preview";
import ProjectSettingsCard from "../../components/custom/Cards/ProjectSettingsCard";
import WelcomeModal from "../../components/custom/Cards/WelcomeModal";

import "./index.scss";

export default function Home() {
	const navigate = useNavigate();
	const { showCard } = usePopup();

	const { userFullName } = useAuth();

	// First-visit welcome modal; PopupContext skips it once dismissed.
	useEffect(() => {
		showCard(WelcomeModal, "welcome-modal");
	}, [showCard]);

	let firstName = "";
	if (userFullName) {
		// userFullName is in the format "{last}, {first}"
		const parts = userFullName.split(",");
		if (parts.length === 2) {
			firstName = parts[1].trim();
		} else {
			firstName = userFullName; // fallback if format is unexpected
		}
	}

	const [searchQuery, setSearchQuery] = useState("");
	const searchInputRef = useRef(null);

	// "/" focuses the project search, unless the user is already typing in a field.
	useEffect(() => {
		const handleKeyDown = (event) => {
			if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target;
			const isTyping =
				target?.tagName === "INPUT" ||
				target?.tagName === "TEXTAREA" ||
				target?.isContentEditable;
			if (isTyping) return;
			event.preventDefault();
			searchInputRef.current?.focus();
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	const { loading, error, data } = useQuery(GET_PROJECTS);
	if (loading) {
		return <Spinner fullPage={true} />;
	}
	if (error) {
		return (
			<div className="home">
				<div className="home-left">
					<div className="home-left-text">
						<Alert heading="Niet gelukt" headingLevel={2} severity="error">
							<Paragraph>Fout tijdens het laden van projecten.</Paragraph>
						</Alert>
					</div>
				</div>
			</div>
		);
	}

	const filteredProjects = data?.projects?.filter((project) =>
		project.name.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const clickProject = (project) => {
		navigate(getProjectEditorPath(project));
	};

	return (
		<div className="home">
			<div className="home-left">
				<div className="home-left-text">
					<Heading level={2}>Welkom {firstName} bij de Brede Welvaart Scan</Heading>
					<Paragraph size="regular">
						Hier kun je opgeslagen projecten terug vinden en een nieuw project starten. Is dit je eerste
						keer? Bekijk hier dan de welkoms-video die handige tips laat zien over hoe je de digitale tool
						kunt gebruiken.
					</Paragraph>
				</div>
				<div className="home-left-projects">
					<SearchField onSubmit={(e) => e.preventDefault()}>
						<SearchField.Input
							label="Zoeken op projectnaam"
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Zoek op projectnaam (typ / om te zoeken)"
							ref={searchInputRef}
							value={searchQuery}
						/>
						<SearchField.Button />
					</SearchField>
					<table>
						<thead>
							<tr>
								<th>Project</th>
								<th></th>
								<th>Status</th>
								<th>Datum</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{filteredProjects?.map((project) => {
								return (
									<tr key={project.id}>
										<td className="project-details" onClick={() => clickProject(project)}>
											<Preview previewData={project.previewData} />
											<span>{project.name}</span>
										</td>
										<td onClick={() => clickProject(project)}></td>
										<td onClick={() => clickProject(project)}>
											<div className={`project-status project-status-${project.status}`}>
												<Icon name={getStatusIcon(project.status)} />
												<span>{getStatusOption(project.status)}</span>
											</div>
										</td>
										<td onClick={() => clickProject(project)}>
											{moment(project.updatedAt).format("DD MMM YYYY")}
										</td>
										<td
											className="project-settings"
											onClick={() => showCard(ProjectSettingsCard, "", () => {}, { project })}
										>
											<Icon name="cogwheel-gray" />
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
