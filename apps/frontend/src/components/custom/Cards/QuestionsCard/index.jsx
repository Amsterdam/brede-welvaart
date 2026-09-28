import { useEffect, useRef, useState } from "react";
import { useMutation } from "@apollo/client/react";
import {
	Alert,
	Checkbox,
	Dialog,
	ErrorMessage,
	Field,
	FieldSet,
	Label,
	Paragraph,
	TextArea,
	TextInput,
} from "@amsterdam/design-system-react";
import { Button as UIButton } from "@shared/ui";

import { UPDATE_PROJECT } from "../../../../graphql/mutations";
import { GET_PROJECT } from "../../../../graphql/queries";

import "./index.scss";

const reasonOptions = [
	{ label: "Raadsbrief", value: "COUNCIL_LETTER" },
	{ label: "Nieuw beleid", value: "NEW_POLICY" },
	{ label: "Projectvoorstel", value: "PROJECT_PROPOSAL" },
	{ label: "Anders", value: "OTHER" },
];

const requiredFields = ["projectName", "reason", "reasonOther", "scanGoal", "impactMotivation", "scope"];

export default function QuestionsCard({ close, project }) {
	const dialogRef = useRef(null);
	const [form, setForm] = useState({
		projectName: project.name || "",
		reason: project.reason || [],
		reasonOther: project.reasonOther || "",
		scanGoal: project.scanGoal || "",
		impactMotivation: project.impactMotivation || "",
		scope: project.scope || "",
	});
	const [errors, setErrors] = useState({});
	const [errorMessage, setErrorMessage] = useState("");
	const [updateProject, { loading }] = useMutation(UPDATE_PROJECT, {
		refetchQueries: [GET_PROJECT],
	});

	useEffect(() => {
		dialogRef.current?.showModal();
	}, []);

	const updateField = (fieldName, value) => {
		setForm((current) => ({ ...current, [fieldName]: value }));
		setErrors((current) => {
			const { [fieldName]: _removed, ...rest } = current;
			return rest;
		});
	};

	const toggleReason = (value) => {
		const reason = form.reason.includes(value)
			? form.reason.filter((item) => item !== value)
			: [...form.reason, value];
		updateField("reason", reason);
		if (!reason.includes("OTHER")) updateField("reasonOther", "");
	};

	const validate = () => {
		const nextErrors = {};
		if (!form.projectName.trim()) nextErrors.projectName = "Vul de projectnaam in.";
		if (!form.reason.length) nextErrors.reason = "Kies minimaal 1 aanleiding.";
		if (form.reason.includes("OTHER") && !form.reasonOther.trim()) {
			nextErrors.reasonOther = "Licht de andere aanleiding toe.";
		}
		if (!form.scanGoal.trim()) nextErrors.scanGoal = "Vul het onderwerp van de scan in.";
		if (!form.impactMotivation.trim()) nextErrors.impactMotivation = "Vul het doel van de scan in.";
		if (!form.scope.trim()) nextErrors.scope = "Vul de afbakening van de scan in.";
		setErrors(nextErrors);
		return requiredFields.every((fieldName) => !nextErrors[fieldName]);
	};

	const handleSave = async () => {
		setErrorMessage("");
		if (!validate()) return;

		try {
			await updateProject({
				variables: {
					updateProjectId: project.id,
					input: {
						name: form.projectName.trim(),
						reason: form.reason,
						reasonOther: form.reason.includes("OTHER") ? form.reasonOther.trim() : "",
						scanGoal: form.scanGoal.trim(),
						impactMotivation: form.impactMotivation.trim(),
						scope: form.scope.trim(),
					},
				},
			});
			close();
		} catch {
			setErrorMessage("We konden de antwoorden niet opslaan. Probeer het opnieuw.");
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
			heading="Vragen aanpassen"
			closeButtonLabel="Sluiten"
			footer={footer}
			onClose={close}
			className="card-dialog-large project-questions-dialog"
		>
			{errorMessage && (
				<Alert severity="error" heading="Niet opgeslagen" headingLevel={2}>
					<Paragraph>{errorMessage}</Paragraph>
				</Alert>
			)}
			<Paragraph>Pas de antwoorden aan die de basis vormen voor deze scan.</Paragraph>

			<div className="project-questions-dialog__fields">
				<Field invalid={Boolean(errors.projectName)}>
					<Label htmlFor="questions-project-name">Projectnaam</Label>
					<TextInput
						id="questions-project-name"
						invalid={Boolean(errors.projectName)}
						value={form.projectName}
						onChange={(event) => updateField("projectName", event.target.value)}
					/>
					{errors.projectName && <ErrorMessage prefix="Fout">{errors.projectName}</ErrorMessage>}
				</Field>

				<FieldSet
					className="project-questions-dialog__reason"
					legend="Wat is de aanleiding voor de scan?"
					invalid={Boolean(errors.reason)}
				>
					<div className="project-questions-dialog__options">
						{reasonOptions.map((option) => (
							<Checkbox
								key={option.value}
								checked={form.reason.includes(option.value)}
								id={`questions-reason-${option.value}`}
								name="reason"
								onChange={() => toggleReason(option.value)}
								value={option.value}
							>
								{option.label}
							</Checkbox>
						))}
					</div>
					{errors.reason && <ErrorMessage prefix="Fout">{errors.reason}</ErrorMessage>}
				</FieldSet>

				{form.reason.includes("OTHER") && (
					<Field invalid={Boolean(errors.reasonOther)}>
						<Label htmlFor="questions-reason-other">Andere aanleiding</Label>
						<TextInput
							id="questions-reason-other"
							invalid={Boolean(errors.reasonOther)}
							value={form.reasonOther}
							onChange={(event) => updateField("reasonOther", event.target.value)}
						/>
						{errors.reasonOther && <ErrorMessage prefix="Fout">{errors.reasonOther}</ErrorMessage>}
					</Field>
				)}

				<QuestionField
					id="questions-scan-goal"
					label="Wat is het onderwerp van de brede welvaartscan?"
					value={form.scanGoal}
					error={errors.scanGoal}
					onChange={(value) => updateField("scanGoal", value)}
				/>
				<QuestionField
					id="questions-impact-motivation"
					label="Wat is het doel van de scan?"
					value={form.impactMotivation}
					error={errors.impactMotivation}
					onChange={(value) => updateField("impactMotivation", value)}
				/>
				<QuestionField
					id="questions-scope"
					label="Welke afbakening geldt voor de scan?"
					value={form.scope}
					error={errors.scope}
					onChange={(value) => updateField("scope", value)}
				/>
			</div>
		</Dialog>
	);
}

function QuestionField({ error, id, label, onChange, value }) {
	return (
		<Field invalid={Boolean(error)}>
			<Label htmlFor={id}>{label}</Label>
			<TextArea
				id={id}
				invalid={Boolean(error)}
				resize="vertical"
				rows={4}
				value={value}
				onChange={(event) => onChange(event.target.value)}
			/>
			{error && <ErrorMessage prefix="Fout">{error}</ErrorMessage>}
		</Field>
	);
}
