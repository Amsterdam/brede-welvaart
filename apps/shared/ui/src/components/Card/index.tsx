import React, { useRef, useEffect } from "react";
import "./card.scss";
import { useAnchorPosition, Anchor } from "./useAnchorPosition";

import crossWhite from "../../assets/icons/cross-white.svg";
import crossBlack from "../../assets/icons/cross-black.svg";

interface Arrow {
	direction: string;
	align: string;
}

interface CardProps {
	size?: string;
	iconSrc?: string;
	title?: React.ReactNode;
	imageSrc?: string;
	children?: React.ReactNode;
	footerContent?: React.ReactNode;
	arrow?: Arrow;
	anchor?: Anchor;
	onClose?: () => void;
	className?: string;
	closeWhenClickedOutside?: boolean;
	variant?: "dark" | "light";
}

export const Card: React.FC<CardProps> = ({
	size,
	iconSrc,
	title,
	imageSrc,
	children,
	footerContent,
	arrow,
	anchor,
	onClose,
	className = false,
	closeWhenClickedOutside = false,
	variant = "dark",
}) => {
	const cardRef = useRef<HTMLDivElement | null>(null);

	// Only use anchor positioning if anchor is provided
	const computedStyle = useAnchorPosition(anchor, []);

	useEffect(() => {
		if (!onClose) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (
				onClose &&
				closeWhenClickedOutside &&
				cardRef.current &&
				event.target instanceof Node &&
				!cardRef.current.contains(event.target)
			) {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [onClose, closeWhenClickedOutside]);

	// Default style if no anchor is provided
	const style = anchor
		? computedStyle
		: undefined;

	return (
		<div
			ref={cardRef}
			className={`card${size ? ` card-${size}` : ""} card-${variant}`}
			style={style}
		>
			{arrow && <div className={`arrow arrow-${arrow.direction} arrow-align-${arrow.align}`}></div>}
			<div className="card-header">
				<div className="card-title">
					{iconSrc && <img src={iconSrc} alt="" className="card-icon" />}
					<span>{title}</span>
				</div>
				{onClose && (
					<img
						src={variant === "light" ? crossBlack : crossWhite }
						alt="Close"
						className="card-close"
						onClick={onClose}
					/>
				)}
			</div>
			{imageSrc && (
				<div className="card-image">
					<img src={imageSrc} alt="..." />
				</div>
			)}
			<div className={`card-content ${className && `card-content-${className}`}`}>{children}</div>
			<div className="card-footer">{footerContent}</div>
		</div>
	);
};
