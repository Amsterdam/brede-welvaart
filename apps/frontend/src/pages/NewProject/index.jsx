import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@apollo/client/react";

import {
	Alert,
	Checkbox,
	ErrorMessage,
	Field,
	FieldSet,
	Heading,
	Label,
	Link,
	Paragraph,
	Radio,
	TextArea,
	TextInput,
} from "@amsterdam/design-system-react";
import { Button as UIButton, Spinner } from "@shared/ui";

import Icon from "../../components/common/Icon";
import { GET_PROJECT, GET_PROJECTS } from "../../graphql/queries";
import { CREATE_PROJECT, UPDATE_PROJECT } from "../../graphql/mutations";
import { useFormErrors } from "../../hooks/useFormErrors";

import "./index.scss";

const DRAFT_NAME = "Nieuwe bredewelvaartscan";
const DRAFT_DESCRIPTION = "Projectintake nog niet afgerond.";
const DESCRIPTION_MAX_LENGTH = 740;

const reasonOptions = [
	{ label: "Raadsbrief", value: "COUNCIL_LETTER" },
	{ label: "Nieuw beleid", value: "NEW_POLICY" },
	{ label: "Project voorstel", value: "PROJECT_PROPOSAL" },
	{ label: "Anders, namelijk:", value: "OTHER" },
];

const templateOptions = [
	{ label: "Scan v1.1 (nieuwe thema's)", value: "V1_1" },
	{ label: "Scan v1.0 (oorspronkelijke thema's)", value: "DEFAULT" },
];

const emptyForm = {
	projectName: "",
	reason: [],
	reasonOther: "",
	scanGoal: "",
	impactMotivation: "",
	scope: "",
	template: "V1_1",
};

const getGeneratedName = (scanGoal) => {
	const value = scanGoal.trim();
	return value ? value.slice(0, 80) : DRAFT_NAME;
};

const getGeneratedDescription = (scanGoal) => {
	const value = scanGoal.trim();
	return value ? value.slice(0, DESCRIPTION_MAX_LENGTH) : DRAFT_DESCRIPTION;
};

export default function NewProject() {
	const { projectSlug } = useParams();
	const navigate = useNavigate();
	const isResumeFlow = Boolean(projectSlug);

	const [step, setStep] = useState(1);
	const [projectId, setProjectId] = useState(null);
	const [form, setForm] = useState(emptyForm);
	const [localErrors, setLocalErrors] = useState({});

	const headingRef = useRef(null);
	const fieldRefs = {
		projectName: useRef(null),
		reason: useRef(null),
		reasonOther: useRef(null),
		scanGoal: useRef(null),
		impactMotivation: useRef(null),
		scope: useRef(null),
	};

	const { data, loading, error } = useQuery(GET_PROJECT, {
		variables: { slug: projectSlug },
		fetchPolicy: "cache-first",
		skip: !isResumeFlow,
	});

	const [createProject, { error: createProjectError, loading: createLoading }] = useMutation(CREATE_PROJECT, {
		refetchQueries: [GET_PROJECTS],
	});
	const [updateProject, { error: updateProjectError, loading: updateLoading }] = useMutation(UPDATE_PROJECT, {
		refetchQueries: [GET_PROJECTS],
	});
	const backendErrors = useFormErrors(createProjectError, updateProjectError);

	const isSaving = createLoading || updateLoading;
	const activeProject = data?.project;

	useEffect(() => {
		if (!activeProject) return;

		setProjectId(activeProject.id);
		setForm((current) => ({
			...current,
			projectName: activeProject.name && activeProject.name !== DRAFT_NAME ? activeProject.name : "",
			reason: activeProject.reason || [],
			reasonOther: activeProject.reasonOther || "",
			scanGoal: activeProject.scanGoal || "",
			impactMotivation: activeProject.impactMotivation || "",
			scope: activeProject.scope || "",
		}));
	}, [activeProject]);

	useEffect(() => {
		headingRef.current?.focus();
	}, [step]);

	const fieldErrors = useMemo(
		() => ({
			...backendErrors.fieldErrors,
			...localErrors,
		}),
		[backendErrors.fieldErrors, localErrors]
	);

	const hasError = (fieldName) => Boolean(fieldErrors[fieldName]);
	const getError = (fieldName) => fieldErrors[fieldName] || null;

	const updateField = (fieldName, value) => {
		setForm((current) => ({ ...current, [fieldName]: value }));
		setLocalErrors((current) => {
			const { [fieldName]: _cleared, general: _general, ...rest } = current;
			return rest;
		});
	};

	const toggleReason = (value) => {
		const nextReason = form.reason.includes(value)
			? form.reason.filter((reason) => reason !== value)
			: [...form.reason, value];
		updateField("reason", nextReason);

		if (!nextReason.includes("OTHER")) {
			updateField("reasonOther", "");
		}
	};

	const focusFirstError = (errors) => {
		const firstField = ["projectName", "reason", "reasonOther", "scanGoal", "impactMotivation", "scope"].find(
			(fieldName) => errors[fieldName]
		);
		if (firstField) {
			fieldRefs[firstField].current?.focus();
		}
	};

	const validateFields = (fieldNames) => {
		const errors = {};

		if (fieldNames.includes("projectName") && !form.projectName.trim()) {
			errors.projectName = "Vul de naam van je project in.";
		}

		if (fieldNames.includes("reason") && form.reason.length === 0) {
			errors.reason = "Selecteer minimaal een aanleiding voor de scan.";
		}

		if (fieldNames.includes("reasonOther") && form.reason.includes("OTHER") && !form.reasonOther.trim()) {
			errors.reasonOther = 'Vul een toelichting in bij "Anders, namelijk".';
		}

		if (fieldNames.includes("scanGoal") && !form.scanGoal.trim()) {
			errors.scanGoal = "Vul het onderwerp van de brede welvaartscan in.";
		}

		if (fieldNames.includes("impactMotivation") && !form.impactMotivation.trim()) {
			errors.impactMotivation = "Vul het doel van de scan in.";
		}

		if (fieldNames.includes("scope") && !form.scope.trim()) {
			errors.scope = "Vul de afbakening van de scan in.";
		}

		setLocalErrors(errors);
		if (Object.keys(errors).length) {
			focusFirstError(errors);
			return false;
		}

		return true;
	};

	const getStepValidationFields = () => {
		if (step === 1) return ["projectName", "reason", "reasonOther"];
		if (step === 2) return ["scanGoal"];
		if (step === 3) return ["impactMotivation"];
		return ["scope"];
	};

	const buildInput = ({ completeIntake = false } = {}) => {
		const input = {
			name: form.projectName.trim() || getGeneratedName(form.scanGoal),
			description: getGeneratedDescription(form.scanGoal),
			reason: form.reason,
			status: "DRAFT",
			completeIntake,
		};

		// Themes are copied from the template at creation; it cannot change afterwards.
		if (!projectId) {
			input.template = form.template;
		}

		if (form.reason.includes("OTHER")) {
			input.reasonOther = form.reasonOther;
		}
		if (form.scanGoal.trim() || projectId) {
			input.scanGoal = form.scanGoal;
		}
		if (form.impactMotivation.trim() || projectId) {
			input.impactMotivation = form.impactMotivation;
		}
		if (form.scope.trim() || projectId) {
			input.scope = form.scope;
		}

		return input;
	};

	const persistProject = async ({ completeIntake = false } = {}) => {
		backendErrors.clearErrors();
		const input = buildInput({ completeIntake });

		if (projectId) {
			const result = await updateProject({
				variables: {
					updateProjectId: projectId,
					input,
				},
			});
			return result.data.updateProject;
		}

		const result = await createProject({
			variables: {
				input,
			},
		});
		const project = result.data.createProject;
		setProjectId(project.id);
		return project;
	};

	const handleNext = () => {
		backendErrors.clearErrors();
		if (!validateFields(getStepValidationFields())) return;
		setStep((current) => Math.min(current + 1, 4));
	};

	const handleSaveDraft = async () => {
		try {
			await persistProject({ completeIntake: false });
			navigate("/");
		} catch (error) {
			console.error("Error saving project intake draft:", error);
		}
	};

	const handleComplete = async () => {
		const requiredFields = ["projectName", "reason", "reasonOther", "scanGoal", "impactMotivation", "scope"];
		if (!validateFields(requiredFields)) return;

		try {
			const project = await persistProject({ completeIntake: true });
			navigate(`/project/${project.slug}`, { state: { productTourPhase: "project" } });
		} catch (error) {
			console.error("Error completing project intake:", error);
		}
	};

	// Header control closes the intake (distinct from the in-step "Vorige").
	// Step 1 isn't auto-saved, so guard against silently dropping input there.
	const handleHeaderClose = (event) => {
		event.preventDefault();
		const hasUnsavedStepOne =
			step === 1 && (form.projectName.trim() !== "" || form.reason.length > 0 || form.reasonOther.trim() !== "");
		if (
			hasUnsavedStepOne &&
			!window.confirm(
				"Je hebt nog niet alles opgeslagen. Weet je zeker dat je wilt sluiten? Je antwoorden gaan dan verloren."
			)
		) {
			return;
		}
		navigate("/");
	};

	const generalError = fieldErrors.general;

	if (loading) {
		return <Spinner fullPage={true} />;
	}

	if (error) {
		return (
			<div className="new-project">
				<Alert heading="Niet gelukt" headingLevel={2} severity="error">
					<Paragraph>Fout tijdens het laden van het project.</Paragraph>
				</Alert>
			</div>
		);
	}

	return (
		<div className="new-project">
			<header className="new-project-header" aria-label="Nieuw project">
				<div className="new-project-header-title">Nieuw Project</div>
				<div className="new-project-header-back">
					<Link
						href="#sluiten"
						onClick={handleHeaderClose}
						className="new-project-back-link"
						aria-label="Intake sluiten en teruggaan naar het overzicht"
					>
						<Icon name="cross-blue" size={16} />
						<span>Sluiten</span>
					</Link>
				</div>
			</header>

			<main className="new-project-main">
				<div className="new-project-column">
					{generalError && (
						<Alert heading="Niet gelukt" headingLevel={2} severity="error" className="new-project-error">
							<Paragraph>{generalError}</Paragraph>
						</Alert>
					)}

					<Paragraph className="new-project-step-indicator" size="small">
						Stap {step} van 4
					</Paragraph>

					{step === 1 && (
						<section className="new-project-step" aria-labelledby="new-project-step-heading">
							<Heading id="new-project-step-heading" level={1} ref={headingRef} tabIndex="-1">
								Nieuw project
							</Heading>

							<div className="new-project-intro">
								<Heading level={2} size="level-5">
									Voordat je met de scan start
								</Heading>
								<Paragraph>
									We stellen je straks een paar vragen over de aanleiding en het doel van de brede
									welvaartsscan die je wilt maken. Deze vragen helpen om de brede welvaartsscan
									doelgericht en effectief in te vullen. Beantwoord ze daarom zorgvuldig, zodat de
									scan optimaal kan bijdragen aan beleid en besluitvorming.
								</Paragraph>
							</div>

							<div className="new-project-intro">
								<Heading level={2} size="level-5">
									Openresearch.amsterdam
								</Heading>
								<Paragraph>
									Als je dat wilt, gebruiken we deze informatie om je te helpen. We zoeken dan
									relevante informatie voor je op via Openresearch.amsterdam.nl. Ook gebruiken we deze
									informatie voor het voorblad van de scan, zodat er een duidelijke introductie en
									leeswijzer bij zit.
								</Paragraph>
							</div>

							<Field invalid={hasError("projectName")} className="new-project-name-field">
								<Label htmlFor="projectName">Wat is de naam van je project?</Label>
								<TextInput
									aria-describedby={hasError("projectName") ? "projectName-error" : undefined}
									id="projectName"
									invalid={hasError("projectName")}
									onChange={(event) => updateField("projectName", event.target.value)}
									ref={fieldRefs.projectName}
									value={form.projectName}
								/>
								{hasError("projectName") && (
									<ErrorMessage id="projectName-error" prefix="Fout">
										{getError("projectName")}
									</ErrorMessage>
								)}
							</Field>

							<FieldSet
								className="new-project-reason-fieldset"
								legend="Wat is de aanleiding voor het invullen van de scan?"
								invalid={hasError("reason") || hasError("reasonOther")}
							>
								<div className="new-project-checkboxes" ref={fieldRefs.reason} tabIndex="-1">
									{reasonOptions.map((option) => (
										<Checkbox
											key={option.value}
											checked={form.reason.includes(option.value)}
											id={`reason-${option.value}`}
											invalid={hasError("reason")}
											name="reason"
											onChange={() => toggleReason(option.value)}
											value={option.value}
										>
											{option.label}
										</Checkbox>
									))}
								</div>
								{hasError("reason") && (
									<ErrorMessage id="reason-error" prefix="Fout">
										{getError("reason")}
									</ErrorMessage>
								)}
							</FieldSet>

							{form.reason.includes("OTHER") && (
								<Field invalid={hasError("reasonOther")}>
									<Label htmlFor="reasonOther">Toelichting bij Anders, namelijk</Label>
									<TextInput
										aria-describedby={hasError("reasonOther") ? "reasonOther-error" : undefined}
										id="reasonOther"
										invalid={hasError("reasonOther")}
										onChange={(event) => updateField("reasonOther", event.target.value)}
										ref={fieldRefs.reasonOther}
										value={form.reasonOther}
									/>
									{hasError("reasonOther") && (
										<ErrorMessage id="reasonOther-error" prefix="Fout">
											{getError("reasonOther")}
										</ErrorMessage>
									)}
								</Field>
							)}

							{!isResumeFlow && !projectId && (
								<FieldSet
									className="new-project-template-fieldset"
									legend="Welke versie van de scan wil je gebruiken?"
								>
									<Paragraph id="template-hint" size="small">
										Scan v1.1 heeft de nieuwste thema&apos;s en definities.
									</Paragraph>
									<div className="new-project-radios">
										{templateOptions.map((option) => (
											<Radio
												key={option.value}
												aria-describedby="template-hint"
												checked={form.template === option.value}
												id={`template-${option.value}`}
												name="template"
												onChange={() => updateField("template", option.value)}
												value={option.value}
											>
												{option.label}
											</Radio>
										))}
									</div>
								</FieldSet>
							)}

							<UIButton disabled={isSaving} onClick={handleNext} variant="primary">
								Volgende stap
							</UIButton>
						</section>
					)}

					{step > 1 && (
						<section
							className="new-project-step new-project-step-question"
							aria-labelledby="new-project-step-heading"
						>
							<Link
								href="#vorige"
								onClick={(event) => {
									event.preventDefault();
									setStep((current) => Math.max(current - 1, 1));
								}}
								className="new-project-previous-link"
								aria-label="Naar de vorige vraag"
							>
								<Icon name="chevron-left" size={16} />
								<span>Vorige</span>
							</Link>

							{step === 2 && (
								<QuestionStep
									error={getError("scanGoal")}
									hasError={hasError("scanGoal")}
									headingRef={headingRef}
									helperText="Over welke problematiek, vraagstuk, beleidsvoorstel of situatie wil je het effect op brede welvaart weten?"
									exampleText={[
										"Voorbeelden kunnen zijn: Een evaluatie van het investeringsbeleid en de brede welvaartsaspecten. Dit gaat dan om ongeveer 100 bedrijven met gemiddeld 40 werknemers waarvan grotendeels hoogopgeleide expats.",
										"Een ander voorbeeld is de impact van de huidige bezoekerseconomie op de wallen en het ophalen van de problematiek. Aspecten die veel voorkomen zijn grote drukte, 's avonds onrust, maatschappelijke winkels verdwijnen voor winkels gericht op bezoekers.",
									]}
									id="scanGoal"
									inputRef={fieldRefs.scanGoal}
									label="Wat is het onderwerp van de brede welvaartscan?"
									onChange={(value) => updateField("scanGoal", value)}
									onSubmit={handleNext}
									value={form.scanGoal}
								/>
							)}

							{step === 3 && (
								<QuestionStep
									error={getError("impactMotivation")}
									hasError={hasError("impactMotivation")}
									headingRef={headingRef}
									helperText="Denk bijvoorbeeld aan het bieden van een breder perspectief, het inzichtelijk maken van alle effecten of het beoordelen van de impact van nieuw beleid. Hier kun je ook specifieke onderdelen van je vraagstuk beschrijven."
									exampleText='Bijvoorbeeld: "Ik probeer inzichtelijk te maken welke functies een buurthuis heeft om daarmee te bepalen welke gemeentelijke afdelingen ik verder kan aanhaken." Of: "Ik verken de uitbreiding van een bedrijventerrein en wil inzicht krijgen in de gevolgen voor werkgelegenheid, verkeersdrukte, natuur en gezondheid van omwonenden."'
									id="impactMotivation"
									inputRef={fieldRefs.impactMotivation}
									label="Wat is het doel van de scan?"
									onChange={(value) => updateField("impactMotivation", value)}
									onSubmit={handleNext}
									value={form.impactMotivation}
								/>
							)}

							{step === 4 && (
								<QuestionStep
									error={getError("scope")}
									hasError={hasError("scope")}
									headingRef={headingRef}
									helperText="Zijn er bijvoorbeeld thema's die je wilt uitsluiten? Of wil je je juist op iets specifieks richten? Wil je maar een aspect van de problematiek onderzoeken?"
									exampleText='Bijvoorbeeld: "Richt je op de bredewelvaartsaspecten die invloed hebben op de Amsterdamse bewoners of de Nederlandse bezoekers." Of: "Onderdelen die buiten scope zijn voor deze scan, zijn technische uitvoeringsdetails, effecten van landelijke regelgeving en autonome ontwikkelingen die losstaan van dit beleidsvoorstel."'
									id="scope"
									inputRef={fieldRefs.scope}
									label="Zijn er afbakeningen die meegenomen moeten worden?"
									onChange={(value) => updateField("scope", value)}
									onSubmit={handleComplete}
									value={form.scope}
								/>
							)}

							<UIButton
								disabled={isSaving}
								onClick={step === 4 ? handleComplete : handleNext}
								variant="primary"
							>
								{isSaving ? "Bezig met opslaan..." : step === 4 ? "Project aanmaken" : "Volgende vraag"}
							</UIButton>

							<Link
								href="#opslaan"
								onClick={(event) => {
									event.preventDefault();
									if (!isSaving) {
										handleSaveDraft();
									}
								}}
							>
								Opslaan en later verder
							</Link>
						</section>
					)}
				</div>
			</main>
		</div>
	);
}

function QuestionStep({
	error,
	exampleText,
	hasError,
	headingRef,
	helperText,
	id,
	inputRef,
	label,
	onChange,
	onSubmit,
	value,
}) {
	const handleKeyDown = (event) => {
		// Shift+Enter advances to the next step; plain Enter keeps inserting newlines.
		if (event.key === "Enter" && event.shiftKey) {
			event.preventDefault();
			onSubmit?.();
		}
	};

	const describedBy = [
		helperText ? `${id}-hint` : null,
		exampleText ? `${id}-example` : null,
		hasError ? `${id}-error` : null,
	]
		.filter(Boolean)
		.join(" ");

	return (
		<Field invalid={hasError} className="new-project-question">
			<Label htmlFor={id} id="new-project-step-heading" ref={headingRef} tabIndex="-1">
				{label}
			</Label>
			{helperText && (
				<Paragraph id={`${id}-hint`} size="small">
					{helperText}
				</Paragraph>
			)}
			{exampleText &&
				(Array.isArray(exampleText) ? exampleText : [exampleText]).map((example, index) => (
					<Paragraph
						className="new-project-example"
						id={index === 0 ? `${id}-example` : undefined}
						key={index}
						size="small"
					>
						{example}
					</Paragraph>
				))}
			<TextArea
				aria-describedby={describedBy || undefined}
				id={id}
				invalid={hasError}
				onChange={(event) => onChange(event.target.value)}
				onKeyDown={handleKeyDown}
				ref={inputRef}
				resize="vertical"
				rows={4}
				value={value}
			/>
			{hasError && (
				<ErrorMessage id={`${id}-error`} prefix="Fout">
					{error}
				</ErrorMessage>
			)}
		</Field>
	);
}
