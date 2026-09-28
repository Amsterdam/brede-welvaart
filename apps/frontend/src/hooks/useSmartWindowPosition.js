import { useState, useEffect, useCallback } from "react";

/**
 * Hook to calculate smart positioning for comment windows
 * Positions window near the bubble while keeping it within viewport bounds
 * 
 * @param {React.RefObject} bubbleRef - Ref to the bubble element
 * @param {Array} dependencies - Additional dependencies to trigger recalculation
 * @returns {Object} Position { x, y } for the window, or null if not ready
 */
export function useSmartWindowPosition(bubbleRef, dependencies = []) {
	const [position, setPosition] = useState(null);

	const calculatePosition = useCallback(() => {
		if (!bubbleRef?.current) {
			return;
		}

		const bubble = bubbleRef.current.getBoundingClientRect();
		
		// If bubble is not visible or has no dimensions, don't calculate
		if (bubble.width === 0 || bubble.height === 0) {
			return;
		}

		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		// Window dimensions (approximate)
		const windowWidth = 350;
		const windowHeight = 200; // Approximate min height

		// Default offset from bubble (right and slightly up)
		let x = bubble.right + 10;
		let y = bubble.top - 35;

		// Check if window would go off right edge
		if (x + windowWidth > viewportWidth) {
			// Position to the left of the bubble instead
			x = bubble.left - windowWidth - 10;
		}

		// If still off-screen on left, center it
		if (x < 0) {
			x = Math.max(10, (viewportWidth - windowWidth) / 2);
		}

		// Check if window would go off bottom
		if (y + windowHeight > viewportHeight) {
			y = viewportHeight - windowHeight - 10;
		}

		// Check if window would go off top
		if (y < 0) {
			y = 10;
		}

		setPosition({ x, y });
	}, [bubbleRef]);

	useEffect(() => {
		// Small delay to ensure bubble is rendered
		const timer = setTimeout(calculatePosition, 10);

		// Update on scroll, resize, or transform changes
		window.addEventListener("scroll", calculatePosition, true);
		window.addEventListener("resize", calculatePosition);

		// Use ResizeObserver to detect zoom/transform changes
		const resizeObserver = new ResizeObserver(calculatePosition);
		if (bubbleRef?.current) {
			resizeObserver.observe(bubbleRef.current);
		}

		return () => {
			clearTimeout(timer);
			window.removeEventListener("scroll", calculatePosition, true);
			window.removeEventListener("resize", calculatePosition);
			resizeObserver.disconnect();
		};
	}, [bubbleRef, calculatePosition, ...dependencies]);

	return position;
}
