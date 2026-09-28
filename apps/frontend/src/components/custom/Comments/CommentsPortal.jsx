import { createPortal } from "react-dom";
import { useTransformContext } from "react-zoom-pan-pinch";

/**
 * Portal component that renders comments outside the transform container
 * while maintaining correct visual positioning that accounts for zoom and pan
 */
export default function CommentsPortal({ children, containerId = "comments-portal-root" }) {
	const { state: transformState } = useTransformContext();

	const portalRoot = document.getElementById(containerId);
	if (!portalRoot) {
		console.warn(`Portal root element with id "${containerId}" not found`);
		return null;
	}

	// Pass transform state through context to children
	return createPortal(
		<div
			className="comments-portal-wrapper"
			data-scale={transformState.scale}
			data-position-x={transformState.positionX}
			data-position-y={transformState.positionY}
		>
			{children}
		</div>,
		portalRoot
	);
}
