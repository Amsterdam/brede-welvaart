import { useApp } from "../../../context/AppContext";

import PageHeader from "./PageHeader";
import PageFooter from "./PageFooter";
import { useRef } from "react";
import { useTransformContext } from "react-zoom-pan-pinch";

export default function Page({ currentPage, display, children, subtitle, date, totalPages }) {
	const context = useTransformContext();

	const { commentMode, setClickPosition } = useApp();

	return (
		<div
			className="transformcomponent-page"
			style={{ display: !display && "none" }}
			onClick={(e) => {
				if (!commentMode) return;

				const pageRect = e.currentTarget.getBoundingClientRect();
				const scale = context.state.scale;
				const rawX = e.clientX - pageRect.left;
				const rawY = e.clientY - pageRect.top;

				const scaledX = rawX / scale;
				const scaledY = rawY / scale;

				// Detect anchor element for theme pages (page >= 3)
				let anchor = null;
				if (currentPage >= 3) {
					const argumentEl = e.target.closest("[data-argument-id]");
					const themeEl = e.target.closest("[data-theme-id]");

					if (argumentEl) {
						const anchorRect = argumentEl.getBoundingClientRect();
						anchor = {
							type: "argument",
							argumentId: argumentEl.dataset.argumentId,
							relativePosition: {
								x: (e.clientX - anchorRect.left) / scale,
								y: (e.clientY - anchorRect.top) / scale,
							},
						};
					} else if (themeEl) {
						const anchorRect = themeEl.getBoundingClientRect();
						anchor = {
							type: "theme",
							themeId: themeEl.dataset.themeId,
							relativePosition: {
								x: (e.clientX - anchorRect.left) / scale,
								y: (e.clientY - anchorRect.top) / scale,
							},
						};
					} else {
						anchor = { type: "page" };
					}
				}

				setClickPosition({
					x: scaledX,
					y: scaledY,
					anchor,
				});
			}}
		>
			<PageHeader subtitle={subtitle} />
			<div className="transformcomponent-page-content">{children}</div>
			<PageFooter currentPage={currentPage} date={date} totalPages={totalPages} />
		</div>
	);
}
