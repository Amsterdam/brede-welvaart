import { useRef } from "react";
import Mentions from "rc-mentions";

import Icon from "../../../common/Icon";

import "./index.less";

const MentionsComponent = Mentions.default ?? Mentions;
const MentionOption = MentionsComponent.Option ?? Mentions.Option;

export default function TextAreaWithMention({ themes, text, handleChange, invalid = false, "aria-describedby": ariaDescribedBy }) {
	const containerRef = useRef(null);
	const highlightRef = useRef(null);
	const value = text ?? "";
	const themeSlugs = new Set(themes.map((theme) => theme.slug));
	const parts = value.split(/(#[a-zA-Z0-9_-]+)/g);

	// Keep the highlight mirror aligned if the textarea ever scrolls internally
	const syncScroll = (event) => {
		if (highlightRef.current) {
			highlightRef.current.scrollTop = event.target.scrollTop;
		}
	};

	// Inside an ADS Dialog the popup must escape the scrollable dialog body (which clips it)
	// but stay within the <dialog> so it renders in the browser top layer, above the backdrop.
	const getPopupContainer = () => containerRef.current?.closest("dialog") ?? containerRef.current;

	return (
		<div className="mention-textarea" ref={containerRef}>
			{/*
			 * Mirror of the textarea content: the textarea text renders on top, this layer
			 * only draws the colored pill behind each recognized #theme tag.
			 */}
			<div className="mention-textarea-highlight" ref={highlightRef} aria-hidden="true">
				{parts.map((part, index) => {
					const slug = part.startsWith("#") ? part.slice(1) : null;
					if (slug && themeSlugs.has(slug)) {
						return (
							<span
								key={index}
								className="mention-textarea-highlight-tag"
								style={{ "--mention-tag-color": `var(--theme-${slug}-bg)` }}
							>
								{part}
							</span>
						);
					}
					return <span key={index}>{part}</span>;
				})}
				{"\n"}
			</div>
			<MentionsComponent
				prefix={"#"}
				split={""}
				notFoundContent={"Geen thema gevonden"}
				value={value}
				onChange={(newText) => handleChange(newText)}
				onScroll={syncScroll}
				autoSize={{ minRows: 5 }}
				maxLength={740}
				getPopupContainer={getPopupContainer}
				className={invalid ? "rc-mentions--invalid" : undefined}
				aria-invalid={invalid || undefined}
				aria-describedby={ariaDescribedBy}
			>
				{themes.map((theme) => (
					<MentionOption value={theme.slug} key={theme.slug}>
						<span className={`mention-option-icon bg-theme-${theme.slug}`} aria-hidden="true">
							<Icon name={`${theme.slug}-straight`} size={20} />
						</span>
						<span className="mention-option-label">{theme.name}</span>
					</MentionOption>
				))}
			</MentionsComponent>
		</div>
	);
}
