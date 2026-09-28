import { Checkbox, Paragraph } from "@amsterdam/design-system-react";

import Icon from "../../components/common/Icon";

export default function SourceEffectCard({
	effect,
	index,
	selected,
	used,
	onSelect,
}) {
	function handleSelectAreaKeyDown(event) {
		if (used) return;
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onSelect();
		}
	}

	return (
		<article className={`source-page-card ${used ? "source-page-card--used" : ""}`}>
			<div className="source-page-card__line" aria-hidden="true" />
			<div className="source-page-card__content">
				<div
					className="source-page-card__select-area"
					onClick={used ? undefined : onSelect}
					onKeyDown={handleSelectAreaKeyDown}
					role="button"
					tabIndex={used ? -1 : 0}
					aria-pressed={selected}
					aria-disabled={used}
				>
					<div className="source-page-card__top">
						<span className="source-page-card__label">
							{used ? (
								<>
									<Icon name="checkmark" size={16} />
									Toegevoegd aan scan
								</>
							) : (
								"AI-zoekresultaat"
							)}
						</span>
						{!used && (
							<span
								className="source-page-card__checkbox"
								onClick={(event) => event.stopPropagation()}
							>
								<Checkbox
									aria-label={`AI-zoekresultaat ${index + 1} selecteren`}
									checked={selected}
									onChange={onSelect}
								/>
							</span>
						)}
					</div>
					<div className="source-page-card__body">
						<Paragraph className="source-page-card__page">Pagina {effect.page}:</Paragraph>
						<Paragraph className="source-page-card__quote">“{effect.text}”</Paragraph>
					</div>
				</div>
				{!used && (
					<div className="source-page-card__footer">
						<Paragraph>Nuttig resultaat?</Paragraph>
						<button type="button" aria-label="Niet nuttig" className="source-page-card__feedback">
							<Icon name="thumb-down" size={18} />
						</button>
						<button type="button" aria-label="Nuttig" className="source-page-card__feedback">
							<Icon name="thumb-up" size={18} />
						</button>
					</div>
				)}
			</div>
		</article>
	);
}
