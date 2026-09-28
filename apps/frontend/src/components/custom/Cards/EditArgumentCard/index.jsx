import { useState, useRef, useEffect } from "react";
import TextareaAutosize from "react-textarea-autosize";
import _ from "lodash";

import { useMutation } from "@apollo/client/react";
import { GET_PROJECT } from "../../../../graphql/queries";
import { CREATE_ARGUMENT, MOVE_ARGUMENT_TO_THEME, UPDATE_ARGUMENT } from "../../../../graphql/mutations";
import {
	getLocationIcon,
	getLocationOption,
	getSentimentIcon,
	getSentimentOption,
	getSourceTypeIcon,
	getSourceTypeOption,
	getTimeIcon,
	getTimeOption,
	locationOptions,
	timeOptions,
} from "../../../../utils/argumentValues";
import { useFormErrors } from "../../../../hooks/useFormErrors";
import { ArgumentImportance, ArgumentSentiment, ArgumentSourceType } from "@shared/types";

import { Button as UIButton, Switch as UISwitch } from "@shared/ui";
import { Alert, ErrorMessage, Heading, Paragraph, TextInput } from "@amsterdam/design-system-react";

import ChipSingleSelect from "../../../common/Chip/ChipSingleSelect";
import ChipMultiSelect from "../../../common/Chip/ChipMultiSelect";
import Icon from "../../../common/Icon";
import ThemeSelect from "../../../common/ThemeSelect";
import { getThemeSelectionError } from "../../../common/ThemeSelect/validation";
import { getOpenResearchUrl } from "../../../../pages/Source/helpers";

import TextAreaWithMention from "../../Mention/TextAreaWithMention";

import "./index.scss";

// The draft's sourceEffect comes from GraphQL, so it carries Apollo's `__typename`
// and the output-only `key` field — neither is accepted by CreateArgumentSourceEffectInput.
// Strip to the input fields only (the backend recomputes `key`).
function toSourceEffectInput(sourceEffect, themeSlug) {
	if (!sourceEffect) return null;
	return {
		sourceKind: sourceEffect.sourceKind,
		sourceId: sourceEffect.sourceId,
		effectId: sourceEffect.effectId,
		themeSlug: themeSlug ?? sourceEffect.themeSlug ?? null,
		page: sourceEffect.page ?? null,
		text: sourceEffect.text ?? null,
	};
}

export default function EditArgumentCard({ close, project, theme = null, arg = {}, draftEffect = null }) {
	const dialogRef = useRef(null);
	// Let the user pick the theme both when converting an AI draft (no fixed theme)
	// and when editing an existing effect — so effects can be moved between themes.
	const showThemeSelect = !theme || Boolean(arg?.id);
	const [selectedThemeSlug, setSelectedThemeSlug] = useState(
		draftEffect ? "" : theme?.slug ?? project.themes?.[0]?.slug ?? ""
	);
	const activeTheme = project.themes?.find((t) => t.slug === selectedThemeSlug) ?? theme;
	const sourceArg = arg?.id ? arg : draftEffect || arg;
	const isExistingArgument = Boolean(arg?.id);
	// Human-in-the-loop: when converting an AI draft into a real effect, start the
	// description empty so the facilitator writes it themselves. The AI's text stays
	// visible under "Voorstel AI". Editing an existing effect keeps its description.
	const isDraftConversion = !isExistingArgument && Boolean(draftEffect);
	const [sentiment, setSentiment] = useState(sourceArg?.sentiment || "");
	const [discussionPoint, setDiscussionPoint] = useState(sourceArg?.discussionPoint || false);
	const [title, setTitle] = useState(sourceArg?.title || "");
	const [explanation, setExplanation] = useState(isDraftConversion ? "" : sourceArg?.explanation || "");
	const [timeFrame, setTimeFrame] = useState(sourceArg?.timeFrame || []);
	const [location, setLocation] = useState(sourceArg?.location || []);
	const [sourceType, setSourceType] = useState(sourceArg?.source?.type || "");
	const [sourceLink, setSourceLink] = useState(sourceArg?.source?.link ? decodeURIComponent(sourceArg.source.link) : "");
	// New effects (manual and AI-draft conversions) default to being shown in the
	// effecten-overzicht, unless that theme's overzicht is already full (max 5).
	// Existing effects keep their saved setting.
	const overviewIsFull =
		(activeTheme?.arguments ?? []).filter((a) => a.importance === ArgumentImportance.High).length >= 5;
	const [importance, setImportance] = useState(
		isExistingArgument
			? sourceArg?.importance || ArgumentImportance.Low
			: overviewIsFull
			? ArgumentImportance.Low
			: ArgumentImportance.High
	);
	const isAiGenerated = Boolean(sourceArg?.generatedByAi);
	const aiProposal = sourceArg?.aiProposal || "";
	// Effects from the AI verkenning are tied to their source (an Open Research
	// article or an uploaded document). That source is fixed — the user classifies
	// the effect but can't change where it came from — so we lock the source UI and
	// reuse the draft's own source type instead of the editable chips/link.
	const lockedSourceEffect = sourceArg?.sourceEffect ?? null;
	const hasLockedSource = Boolean(lockedSourceEffect);
	const lockedSourceType = sourceArg?.source?.type || ArgumentSourceType.Link;
	// Reconstruct the public article URL from the source id so the source is a
	// clickable link; fall back to a readable label instead of the raw "openresearch:NNN".
	const lockedSourceUrl = getOpenResearchUrl(lockedSourceEffect?.sourceId);
	const lockedSourceTitle =
		sourceArg?.sourceTitle || (lockedSourceUrl ? "OpenResearch-bron" : "Eigen document");

	const overviewItems = (activeTheme?.arguments ?? [])
		.filter((arg) => arg.importance === ArgumentImportance.High)
		.map((arg) => arg.id);

	const sentimentsList = Object.values(ArgumentSentiment);
	const sourceTypesList = Object.values(ArgumentSourceType);

	const [createArgument, { error: createArgumentError, loading: createLoading }] = useMutation(CREATE_ARGUMENT, {
		refetchQueries: [GET_PROJECT],
	});
	const [updateArgument, { error: updateArgumentError, loading: updateLoading }] = useMutation(UPDATE_ARGUMENT, {
		refetchQueries: [GET_PROJECT],
	});
	const [moveArgumentToTheme, { error: moveArgumentError, loading: moveLoading }] = useMutation(
		MOVE_ARGUMENT_TO_THEME,
		{ refetchQueries: [GET_PROJECT] }
	);

	const {
		hasFieldError: hasServerFieldError,
		getFieldError: getServerFieldError,
		generalError,
		clearErrors: clearServerErrors,
	} = useFormErrors(createArgumentError, updateArgumentError);

	// Client-side validation runs before the mutation so empty required fields get
	// immediate, descriptive feedback instead of a non-descriptive server coercion
	// error (e.g. NonEmptyString rejecting an empty "Beschrijving effect"). Client
	// and server field errors share the same display helpers below.
	const [clientErrors, setClientErrors] = useState({});
	const hasFieldError = (field) => Boolean(clientErrors[field]) || hasServerFieldError(field);
	const getFieldError = (field) => clientErrors[field] || getServerFieldError(field);
	const clearErrors = () => {
		setClientErrors({});
		clearServerErrors();
	};
	const clearClientError = (field) =>
		setClientErrors((prev) => {
			if (!prev[field]) return prev;
			const next = { ...prev };
			delete next[field];
			return next;
		});

	const hasClientErrors = Object.keys(clientErrors).length > 0;
	const submitError = createArgumentError || updateArgumentError || moveArgumentError;

	useEffect(() => {
		dialogRef.current?.showModal();
	}, []);

	const handleTimeFrame = (tf) => {
		if (timeFrame.includes(tf)) {
			setTimeFrame((prev) => prev.filter((x) => x !== tf));
			return;
		}
		setTimeFrame((prev) => [...prev, tf]);
	};
	const handleLocation = (loc) => {
		if (location.includes(loc)) {
			setLocation((prev) => prev.filter((x) => x !== loc));
			return;
		}
		setLocation((prev) => [...prev, loc]);
	};

	const handleEmpty = () => {
		setTitle("");
		setExplanation("");
	};

	// Mirror the backend's required fields (NonEmptyString title/explanation,
	// required sentiment, required source type for manual effects) so we never send
	// a request the server is bound to reject with an opaque coercion error.
	const validate = () => {
		const errors = {};
		const themeError = getThemeSelectionError(showThemeSelect, selectedThemeSlug);
		if (themeError) {
			errors.theme = themeError;
		}
		if (!title.trim()) {
			errors.title = "Vul een titel voor het effect in.";
		}
		if (!explanation.trim()) {
			errors.explanation = "Vul een beschrijving van het effect in.";
		}
		if (!sentiment) {
			errors.sentiment = "Kies een emotie.";
		}
		// Manually-added effects need a source type; AI effects carry a locked source.
		if (!hasLockedSource && !sourceType) {
			errors.source = "Kies een bron.";
		}
		return errors;
	};

	const handleSave = async () => {
		clearErrors();

		const validationErrors = validate();
		if (Object.keys(validationErrors).length > 0) {
			setClientErrors(validationErrors);
			// Bring the summary alert + first invalid field into view.
			dialogRef.current?.querySelector(".effect-editor__scroll")?.scrollTo({ top: 0 });
			return;
		}

		try {
			if (!isExistingArgument) {
				// Get the next order number for the new argument
				const existingArgsCount = activeTheme?.arguments?.length || 0;

				await createArgument({
					variables: {
						projectId: project.id,
						themeSlug: activeTheme.slug,
						input: {
							title: title,
							explanation: explanation,
							sentiment: sentiment,
							discussionPoint: discussionPoint,
							timeFrame: timeFrame || [],
							location: location || [],
							source: hasLockedSource
								? { type: lockedSourceType, link: null }
								: {
										type: sourceType || null,
										link: sourceLink ? encodeURIComponent(sourceLink) : null,
								  },
							sourceEffect: toSourceEffectInput(draftEffect?.sourceEffect, activeTheme.slug),
							sourceTitle: sourceArg?.sourceTitle || null,
							generatedByAi: isAiGenerated,
							aiProposal: aiProposal || null,
							importance: importance,
							order: existingArgsCount + 1,
							// Converting an AI draft: tell the backend which draft this is so it
							// can mark it converted (kept for the AI dashboard, hidden from the to-do list).
							fromDraftEffectId: draftEffect?.id ?? null,
						},
					},
				});
				close();
			} else {
				await updateArgument({
					variables: {
						id: arg.id,
						input: {
							title: title,
							explanation: explanation,
							sentiment: sentiment,
							discussionPoint: discussionPoint,
							timeFrame: timeFrame || [],
							location: location || [],
							source: hasLockedSource
								? { type: lockedSourceType, link: null }
								: {
										type: sourceType,
										link: sourceLink ? encodeURIComponent(sourceLink) : null,
								  },
							generatedByAi: isAiGenerated,
							aiProposal: aiProposal || null,
							importance: importance,
						},
					},
				});
				// Move the effect to another theme if the user picked a different one.
				if (theme && selectedThemeSlug && selectedThemeSlug !== theme.slug) {
					await moveArgumentToTheme({
						variables: { projectId: project.id, argumentId: arg.id, themeSlug: selectedThemeSlug },
					});
				}
				close();
			}
		} catch (error) {
			// Errors are handled by the useEffect hook above
			console.error("Error saving argument:", error);
		}
	};

	const isLoading = createLoading || updateLoading || moveLoading;

	return (
		<dialog
			ref={dialogRef}
			className="effect-editor"
			aria-labelledby="effect-editor-title"
			onCancel={(event) => {
				event.preventDefault();
				close();
			}}
		>
			<div className="effect-editor__bar">
				<button type="button" className="effect-editor__close" onClick={() => close()}>
					<Icon name="cross" size={20} />
					<span>Sluiten</span>
				</button>
			</div>

			<div className="effect-editor__scroll">
				<div className="effect-editor__content">
					<Heading id="effect-editor-title" level={1} size="level-3" className="effect-editor__title">
						Effect schrijven
					</Heading>

					{(submitError || hasClientErrors) && (
						<Alert heading="Niet gelukt" headingLevel={2} severity="error">
							<Paragraph>
								{hasClientErrors
									? "Niet alle verplichte velden zijn ingevuld. Controleer de gemarkeerde velden hieronder."
									: generalError ||
									  moveArgumentError?.message ||
									  "Er ging iets mis bij het opslaan van het effect. Controleer de velden en probeer het opnieuw."}
							</Paragraph>
						</Alert>
					)}

					{showThemeSelect && (
						<div className="effect-editor__band-field">
							<span className={hasFieldError("theme") ? "field-label-error" : ""}>
								Onder welk thema valt dit effect?
							</span>
							{hasFieldError("theme") && (
								<ErrorMessage id="theme-error">{getFieldError("theme")}</ErrorMessage>
							)}
							<ThemeSelect
								themes={project.themes}
								value={selectedThemeSlug}
								onChange={(slug) => {
									setSelectedThemeSlug(slug);
									clearClientError("theme");
								}}
								label={null}
								invalid={hasFieldError("theme")}
								errorId={hasFieldError("theme") ? "theme-error" : undefined}
							/>
						</div>
					)}

					{isAiGenerated && (
						<Alert heading="Let op" headingLevel={2} className="card-content-ai-alert">
							<Paragraph>
								Dit effect is vooraf ingevuld door AI. Controleer de tekst en classificeer het effect zelf.
							</Paragraph>
						</Alert>
					)}

					{overviewItems.length >= 5 && !overviewItems.includes(arg.id) && (
						<Alert severity="information" heading="Maximum aantal effecten in effecten overzicht">
							Het is niet mogelijk meer effecten van dit thema toe te voegen aan het effecten-overzicht. Om
							dit effect in het overzicht te plaatsen, moet er eerst een ander effect uit het overzicht
							gehaald worden.
						</Alert>
					)}

					<div className="effect-editor__cols">
						{/* Left column — classify the effect */}
						<div className="card-content-edit-argument effect-editor__col">
							<div>
								<span className={hasFieldError("sentiment") ? "field-label-error" : ""}>Emotie</span>
								<div className="card-content-sentiment">
									<div>
										{hasFieldError("sentiment") && (
											<div className="form-error-message">
												<ErrorMessage id="sentiment-error">{getFieldError("sentiment")}</ErrorMessage>
											</div>
										)}
										<div className="chips">
											{_.orderBy(sentimentsList, [], "desc").map((sen, sIndex) => {
												const color =
													sen === sentiment
														? sentiment === ArgumentSentiment.Positive
															? "green"
															: sentiment === ArgumentSentiment.Neutral
															? "blue"
															: "red"
														: "default";
												return (
													<ChipSingleSelect
														key={sIndex}
														click={() => {
															setSentiment(sen);
															clearClientError("sentiment");
														}}
														color={color}
														iconName={getSentimentIcon(sen, sentiment === sen)}
														text={getSentimentOption(sen)}
														error={hasFieldError("sentiment")}
													/>
												);
											})}
										</div>
									</div>
								</div>
							</div>
							<div>
								<span>Voorgesteld bespreekpunt</span>
								<UISwitch checked={discussionPoint} onChange={() => setDiscussionPoint((prev) => !prev)} />
							</div>
							<div>
								<span>Nu & later</span>
								<div className="card-content-timelocation card-content-timelocation-time">
									<Icon name={getTimeIcon(timeFrame)} />
									<div className="card-content-timelocation-list">
										{[...timeOptions.short, ...timeOptions.long].map((tf, tIndex) => {
											return (
												<ChipMultiSelect
													key={tIndex}
													click={() => handleTimeFrame(tf)}
													selected={timeFrame.includes(tf)}
													text={getTimeOption(tf)}
												/>
											);
										})}
									</div>
								</div>
							</div>
							<div>
								<span>Hier & elders</span>
								<div className="card-content-timelocation card-content-timelocation-location">
									<Icon name={getLocationIcon(location)} />
									<div className="card-content-timelocation-list">
										{[...locationOptions.inside, ...locationOptions.outside].map((loc, lIndex) => {
											return (
												<ChipMultiSelect
													key={lIndex}
													click={() => handleLocation(loc)}
													selected={location.includes(loc)}
													text={getLocationOption(loc)}
												/>
											);
										})}
									</div>
								</div>
							</div>
							{(overviewItems.length < 5 || overviewItems.includes(arg.id)) && (
								<div>
									<span>Aan effecten-overzicht toevoegen</span>
									<div className="card-content-add-overview">
										<Icon name={`eye-${importance === ArgumentImportance.High ? "blue" : "hidden"}`} />
										<UISwitch
											checked={importance === ArgumentImportance.High}
											onChange={() =>
												setImportance((prev) =>
													prev === ArgumentImportance.Low
														? ArgumentImportance.High
														: ArgumentImportance.Low
												)
											}
										/>
									</div>
								</div>
							)}
						</div>

						{/* Right column — describe the effect and its source */}
						<div className="card-content-edit-argument effect-editor__col">
							<div>
								<span className={hasFieldError("title") ? "field-label-error" : ""}>Titel effect</span>
								<div>
									{hasFieldError("title") && (
										<div className="form-error-message">
											<ErrorMessage id="title-error">{getFieldError("title")}</ErrorMessage>
										</div>
									)}
									<TextInput
										value={title}
										onChange={(e) => {
											setTitle(e.target.value);
											clearClientError("title");
										}}
										invalid={hasFieldError("title")}
										aria-describedby={hasFieldError("title") ? "title-error" : undefined}
									/>
								</div>
							</div>
							<div>
								<span className={hasFieldError("explanation") ? "field-label-error" : ""}>Beschrijving effect</span>
								<div className="textarea-div">
									{hasFieldError("explanation") && (
										<div className="form-error-message">
											<ErrorMessage id="explanation-error">{getFieldError("explanation")}</ErrorMessage>
										</div>
									)}
									<TextAreaWithMention
										themes={project.themes}
										text={explanation}
										handleChange={(value) => {
											setExplanation(value);
											clearClientError("explanation");
										}}
										invalid={hasFieldError("explanation")}
										aria-describedby={hasFieldError("explanation") ? "explanation-error" : undefined}
									/>
									<span className="textarea-chars">{explanation.length} / 740 karakters</span>
								</div>
							</div>
							{hasLockedSource ? (
								<div>
									<span>Bron</span>
									<div className="card-content-fixed-source">
										<Icon name="ai-wand-stars" size={16} />
										{lockedSourceUrl ? (
											<a
												className="card-content-fixed-source__link"
												href={lockedSourceUrl}
												target="_blank"
												rel="noreferrer"
											>
												<span className="card-content-fixed-source__title">{lockedSourceTitle}</span>
												<Icon name="chevron-right" size={16} />
											</a>
										) : (
											<span className="card-content-fixed-source__title">{lockedSourceTitle}</span>
										)}
									</div>
									<Paragraph size="small" className="card-content-fixed-source__hint">
										Dit effect komt uit deze bron. De bron staat vast en kun je niet wijzigen.
									</Paragraph>
								</div>
							) : (
								<>
									<div>
										<span className={hasFieldError("source") ? "field-label-error" : ""}>Kies een bron</span>
										<div className="card-content-sourcetype">
											<div>
												{hasFieldError("source") && (
													<div className="form-error-message">
														<ErrorMessage id="source-error">{getFieldError("source")}</ErrorMessage>
													</div>
												)}
												<div className="chips">
													{sourceTypesList.map((typeFromList, tIndex) => {
														if (typeFromList === "LINK") return; // remove link from list
														const color = typeFromList === sourceType ? "blue" : "default";
														return (
															<ChipSingleSelect
																key={tIndex}
																click={() => {
																	setSourceType(typeFromList);
																	clearClientError("source");
																}}
																color={color}
																iconName={getSourceTypeIcon(typeFromList, typeFromList === sourceType)}
																text={getSourceTypeOption(typeFromList)}
																error={hasFieldError("source")}
															/>
														);
													})}
												</div>
											</div>
										</div>
									</div>
									<div>
										<span className={hasFieldError("sourceLink") ? "field-label-error" : ""}>
											Link toevoegen bron (optioneel)
										</span>
										<div>
											{hasFieldError("sourceLink") && (
												<div className="form-error-message">
													<ErrorMessage id="sourceLink-error">{getFieldError("sourceLink")}</ErrorMessage>
												</div>
											)}
											<TextInput
												value={sourceLink}
												onChange={(e) => setSourceLink(e.target.value)}
												invalid={hasFieldError("sourceLink")}
												aria-describedby={hasFieldError("sourceLink") ? "sourceLink-error" : undefined}
											/>
										</div>
									</div>
								</>
							)}
							{isAiGenerated && aiProposal && (
								<div>
									<span className="card-content-ai-proposal-label">
										Voorstel AI
										<Icon name="help" size={16} />
									</span>
									<TextareaAutosize
										className="card-content-ai-proposal"
										value={aiProposal}
										readOnly
										minRows={5}
										aria-label="Voorstel AI"
									/>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			<div className="effect-editor__footer">
				<UIButton variant="tertiary" onClick={() => handleEmpty()} disabled={isLoading}>
					Inhoud wissen
				</UIButton>
				<UIButton disabled={isLoading} variant="primary" onClick={() => handleSave()}>
					{isLoading ? "Opslaan..." : "Opslaan"}
				</UIButton>
			</div>
		</dialog>
	);
}
