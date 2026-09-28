import { useState } from "react";
import _ from "lodash";

import { usePopup } from "@shared/ui/context/PopupContext";
import {
	getCssClass,
	getLocationIcon,
	getLocationOption,
	getSentimentIcon,
	getSourceTypeIcon,
	getSourceTypeOption,
	getTimeIcon,
	getTimeOption,
	locationOptions,
	timeOptions,
} from "../../../utils/argumentValues";

import Icon from "../../common/Icon";
import ChipSingleSelect from "../../common/Chip/ChipSingleSelect";
import ChipMultiSelect from "../../common/Chip/ChipMultiSelect";

import EditArgumentCard from "../Cards/EditArgumentCard";
import TextWithMention from "../Mention/TextWithMention";
import { getOpenResearchUrl } from "../../../pages/Source/helpers";

import "./index.scss";

export default function ListArguments({
	project,
	theme,
	args,
	preview = false,
	argsToDelete = [],
	setArgsToDelete = () => {},
}) {
	const popup = preview ? null : usePopup();
	const showCard = popup?.showCard;

	const [hoveredArgId, setHoveredArgId] = useState(null);

	return (
		<>
			{args.map((arg, aIndex) => {
				return (
					<div
						key={arg.id}
						data-argument-id={arg.id}
						className={`theme-arguments-list-item ${preview && "theme-arguments-list-item-preview"}`}
						onMouseEnter={() => setHoveredArgId(arg.id)}
						onMouseLeave={() => setHoveredArgId(null)}
					>
						<div
							className={`theme-arguments-list-item-indicator theme-arguments-list-item-indicator-${getCssClass(arg)}`}
							onClick={() => {
								if (preview) return;
								setArgsToDelete((prev) => {
									if (prev?.includes(arg.id)) {
										return prev.filter((x) => x !== arg.id);
									}
									return [...prev, arg.id];
								});
							}}
						>
							{preview ? (
								<Icon name={getSentimentIcon(arg.sentiment, true)} />
							) : hoveredArgId === arg.id || argsToDelete?.includes(arg.id) ? (
								<div className="theme-arguments-list-item-indicator-checkbox">
									{argsToDelete?.includes(arg.id) && <Icon name={"checkmark"} />}
								</div>
							) : (
								<span>{aIndex + 1}</span>
							)}
						</div>
						<div
							className="theme-arguments-list-item-content"
							onClick={() => {
								if (preview) return;
								showCard(EditArgumentCard, "", () => {}, { project, theme, arg });
							}}
						>
							{!preview && (
								<div
									className="theme-arguments-list-item-content-edit"
									onClick={() => showCard?.(EditArgumentCard, "", () => {}, { project, theme, arg })}
								>
									<Icon name={hoveredArgId === arg.id ? "edit-blue" : "edit-arg"} />
								</div>
							)}
							{arg.discussionPoint && (
								<div className="theme-arguments-list-item-content-tags">
									{arg.discussionPoint && (
										<ChipSingleSelect
											color={preview && "discussion-green"}
											text={"Voorgesteld bespreekpunt"}
										/>
									)}
								</div>
							)}
							<div className="theme-arguments-list-item-content-text">
								<span className="theme-arguments-list-item-content-text-title">{arg.title}</span>
								<span className="theme-arguments-list-item-content-text-explanation">
									<TextWithMention text={arg.explanation} />
								</span>
							</div>
							<div className="theme-arguments-list-item-content-timelocation">
								<div className="theme-arguments-list-item-content-timelocation-time">
									<Icon name={getTimeIcon(arg.timeFrame)} />
									{[...timeOptions.short, ...timeOptions.long].map((tf, tIndex) => {
										if (!arg.timeFrame.includes(tf)) return;
										return <ChipMultiSelect key={tIndex} text={getTimeOption(tf)} />;
									})}
								</div>
								<div className="theme-arguments-list-item-content-timelocation-location">
									<Icon name={getLocationIcon(arg.location)} />
									{[...locationOptions.inside, ...locationOptions.outside].map((loc, lIndex) => {
										if (!arg.location.includes(loc)) return;
										return <ChipMultiSelect key={lIndex} text={getLocationOption(loc)} />;
									})}
								</div>
							</div>
							{arg.source && (
								<div className="theme-arguments-list-item-content-source">
									{preview ? (
										<>
											<Icon name={getSourceTypeIcon(arg.source.type, false, true)} />
											<span>Bron: {getSourceTypeOption(arg.source.type)}</span>
										</>
									) : (
										<>
											<span>Bron:</span>
											<ChipSingleSelect
												iconName={getSourceTypeIcon(arg.source.type)}
												text={getSourceTypeOption(arg.source.type)}
											/>
											{(() => {
												const sourceUrl = getOpenResearchUrl(arg.sourceEffect?.sourceId);
												if (!sourceUrl) return null;
												const label = arg.sourceTitle || "OpenResearch-bron";
												return (
													<a
														className="theme-arguments-list-item-content-source-link"
														href={sourceUrl}
														target="_blank"
														rel="noreferrer"
														onClick={(e) => e.stopPropagation()}
													>
														<span>{label}</span>
														<Icon name="chevron-right" size={16} />
													</a>
												);
											})()}
										</>
									)}
								</div>
							)}
						</div>
					</div>
				);
			})}
		</>
	);
}
