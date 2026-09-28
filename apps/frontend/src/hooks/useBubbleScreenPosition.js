import { useState, useEffect } from "react";

/**
 * Hook to track the screen position of a DOM element (like a comment bubble)
 * This is used to position portal-rendered UI elements relative to elements inside TransformComponent
 * 
 * @param {React.RefObject} elementRef - Ref to the element to track
 * @param {Array} dependencies - Additional dependencies to trigger position recalculation
 * @returns {Object} Screen position { x, y } of the element
 */
export function useBubbleScreenPosition(elementRef, dependencies = []) {
	const [screenPos, setScreenPos] = useState({ x: 0, y: 0 });

	useEffect(() => {
		const updatePosition = () => {
			if (elementRef?.current) {
				const rect = elementRef.current.getBoundingClientRect();
				setScreenPos({ x: rect.left, y: rect.top });
			}
		};

		updatePosition();

		// Update on scroll, resize, or transform changes
		window.addEventListener("scroll", updatePosition, true);
		window.addEventListener("resize", updatePosition);

		// Use ResizeObserver to detect zoom/transform changes
		const resizeObserver = new ResizeObserver(updatePosition);
		if (elementRef?.current) {
			resizeObserver.observe(elementRef.current);
		}

		// Also observe parent transforms
		const parentObserver = new MutationObserver(updatePosition);
		if (elementRef?.current?.parentElement) {
			parentObserver.observe(elementRef.current.parentElement, {
				attributes: true,
				attributeFilter: ["style"],
			});
		}

		return () => {
			window.removeEventListener("scroll", updatePosition, true);
			window.removeEventListener("resize", updatePosition);
			resizeObserver.disconnect();
			parentObserver.disconnect();
		};
	}, [elementRef, ...dependencies]);

	return screenPos;
}
