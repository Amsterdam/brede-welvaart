import { useEffect, useState } from "react";

import { useApp } from "../../../context/AppContext";

import Icon from "../../common/Icon";

export default function PageControls({
	currentPage,
	setCurrentPage,
	centerView,
	zoomIn,
	zoomOut,
	smallPreview,
	totalPages: propTotalPages,
	hasUnreadComments = false,
}) {
	const { commentMode, setCommentMode } = useApp();

	const [totalPages, setTotalPages] = useState(propTotalPages || 0);
	const [zoomInIsHovered, setZoomInIsHovered] = useState(false);
	const [zoomOutIsHovered, setZoomOutIsHovered] = useState(false);
	const [commentIsHovered, setCommentIsHovered] = useState(false);
	const [previousIsHovered, setPreviousIsHovered] = useState(false);
	const [nextIsHovered, setNextIsHovered] = useState(false);

	useEffect(() => {
		if (propTotalPages) {
			setTotalPages(propTotalPages);
		} else {
			setTotalPages(document.getElementsByClassName("transformcomponent-page").length);
		}
	}, [propTotalPages]);

	return (
		<div className="page-controls">
			<div className="page-controls-left">
				<div onMouseEnter={() => setZoomInIsHovered(true)} onMouseLeave={() => setZoomInIsHovered(false)}>
					<Icon click={() => zoomIn()} name={zoomInIsHovered ? "zoom-in-hover" : "zoom-in"} />
				</div>
				<div onMouseEnter={() => setZoomOutIsHovered(true)} onMouseLeave={() => setZoomOutIsHovered(false)}>
					<Icon click={() => zoomOut()} name={zoomOutIsHovered ? "zoom-out-hover" : "zoom-out"} />
				</div>
				<div
					onMouseEnter={() => setCommentIsHovered(true)}
					onMouseLeave={() => setCommentIsHovered(false)}
					style={{ position: "relative" }}
				>
					<Icon
						click={() => {
							setCommentMode((prev) => !prev);
							setCommentIsHovered(false);
						}}
						name={commentMode ? "comment-blue" : commentIsHovered ? "comment-hover" : "comment"}
					/>
					{hasUnreadComments && !commentMode && (
						<div
							style={{
								position: "absolute",
								top: 3,
								right: 3,
								width: 8,
								height: 8,
								borderRadius: "50%",
								background: "var(--ams-color-feedback-warning)",
								border: "1.5px solid var(--white)",
								pointerEvents: "none",
							}}
						/>
					)}
				</div>
			</div>
			<div className="page-controls-divider" />
			<div className="page-controls-right">
				<div onMouseEnter={() => setPreviousIsHovered(true)} onMouseLeave={() => setPreviousIsHovered(false)}>
					<Icon
						click={() => {
							if (currentPage === 0) return;
							setCurrentPage((prev) => prev - 1);
							centerView();
						}}
						name={
							currentPage === 0
								? "previous-page-disabled"
								: previousIsHovered
									? "previous-page-hover"
									: "previous-page"
						}
					/>
				</div>
				<span className="prevent-select">
					{currentPage + 1} van {totalPages}
				</span>
				{totalPages && (
					<div onMouseEnter={() => setNextIsHovered(true)} onMouseLeave={() => setNextIsHovered(false)}>
						<Icon
							click={() => {
								if (currentPage === totalPages - 1) return;
								setCurrentPage((prev) => prev + 1);
								centerView();
							}}
							name={
								currentPage === totalPages - 1
									? "next-page-disabled"
									: nextIsHovered
										? "next-page-hover"
										: "next-page"
							}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
