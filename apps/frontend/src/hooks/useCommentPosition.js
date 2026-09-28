import { useTransformContext } from "react-zoom-pan-pinch";

/**
 * Hook to calculate screen position for a comment based on its stored coordinates
 * and the current zoom/pan state
 * 
 * @param {Object} position - The stored position { x, y }
 * @returns {Object} Screen position { x, y } accounting for zoom and pan
 */
export function useCommentPosition(position) {
	const { state: transformState } = useTransformContext();

	if (!position) {
		return { x: 0, y: 0 };
	}

	// Transform stored coordinates to screen coordinates
	// Formula: screenCoord = (storedCoord * scale) + panOffset
	const screenX = position.x * transformState.scale + transformState.positionX;
	const screenY = position.y * transformState.scale + transformState.positionY;

	return {
		x: screenX,
		y: screenY,
	};
}
