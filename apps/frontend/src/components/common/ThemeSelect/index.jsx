import { useEffect, useId, useRef, useState } from "react";

import Icon from "../Icon";

import { getShortThemeDescription } from "./description";

import "./index.scss";

// Custom combobox for picking a Brede Welvaart theme. Shows the theme icon +
// colour the same way the /about theme cards do (native <select> can't render
// the icon/colour). Controlled: pass `value` (slug) and `onChange(slug)`.
export default function ThemeSelect({ themes = [], value, onChange, label = "Thema", id, invalid = false, errorId }) {
	const reactId = useId();
	const selectId = id || reactId;
	const [open, setOpen] = useState(false);
	const rootRef = useRef(null);
	const buttonRef = useRef(null);

	const selected = themes.find((theme) => theme.slug === value);

	useEffect(() => {
		if (!open) return undefined;
		function onDocPointerDown(event) {
			if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
		}
		function onKeyDown(event) {
			if (event.key === "Escape") {
				setOpen(false);
				buttonRef.current?.focus();
			}
		}
		document.addEventListener("mousedown", onDocPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onDocPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	function choose(slug) {
		onChange?.(slug);
		setOpen(false);
		buttonRef.current?.focus();
	}

	function onButtonKeyDown(event) {
		if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			setOpen(true);
		}
	}

	return (
		<div className="theme-select" ref={rootRef}>
			{label && (
				<span className="theme-select__label" id={`${selectId}-label`}>
					{label}
				</span>
			)}
			<button
				type="button"
				ref={buttonRef}
				className="theme-select__button"
				aria-haspopup="listbox"
				aria-expanded={open}
				aria-label={label || "Thema"}
				aria-labelledby={label ? `${selectId}-label ${selectId}-value` : undefined}
				aria-describedby={errorId}
				aria-invalid={invalid || undefined}
				onClick={() => setOpen((value) => !value)}
				onKeyDown={onButtonKeyDown}
			>
				<span className="theme-select__value" id={`${selectId}-value`}>
					{selected ? (
						<>
							<Icon name={`${selected.slug}-straight`} size={24} />
							<span className="theme-select__name">{selected.name}</span>
						</>
					) : (
						<span className="theme-select__placeholder">Selecteer thema</span>
					)}
				</span>
				<Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
			</button>
			{open && (
				<ul
					className="theme-select__list"
					role="listbox"
					aria-label={label || "Thema"}
					aria-labelledby={label ? `${selectId}-label` : undefined}
				>
					{themes.map((theme) => {
						const descriptionId = `${selectId}-${theme.slug}-description`;
						const shortDescription = getShortThemeDescription(theme.description);

						return (
							<li
								key={theme.slug}
								role="option"
								aria-selected={theme.slug === value}
								aria-label={theme.name}
								aria-describedby={shortDescription ? descriptionId : undefined}
								className={`theme-select__option ${theme.slug === value ? "theme-select__option--selected" : ""}`}
								tabIndex={0}
								onClick={() => choose(theme.slug)}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										choose(theme.slug);
									}
								}}
							>
								<Icon name={`${theme.slug}-straight`} size={24} />
								<span className="theme-select__name">{theme.name}</span>
								{theme.slug === value && <Icon name="checkmark" size={16} />}
								{shortDescription && (
									<span id={descriptionId} role="tooltip" className="theme-select__tooltip">
										{shortDescription}
									</span>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
