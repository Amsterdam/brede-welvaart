import { KeepScale, useTransformContext } from "react-zoom-pan-pinch";
import getInitials from "../../../../utils/getInitials";

import "./index.scss";

export default function CommentBubble({ userFullName, position, resolved = false, hasUnread = false, isDraft = false, click = () => {}, bubbleRef = null }) {
	const { state: transformState } = useTransformContext();
	const initials = getInitials(userFullName);

	return (
		<KeepScale
			ref={bubbleRef}
			style={{
				position: "absolute",
				zIndex: 2,
				left: `${position.x}px`,
				top: `${position.y - 30}px`,
				transform: `scale(${1 / transformState.scale})`,
				transformOrigin: "bottom left",
				cursor: "pointer",
			}}
			onClick={click}
		>
			<div className={`comment-bubble ${resolved ? "resolved" : ""} ${isDraft ? "draft" : ""}`}>
				{!isDraft && (
					<div className="comment-bubble-initials">
						<span>{initials}</span>
					</div>
				)}
				{hasUnread && !resolved && <div className="comment-bubble-unread-dot" />}
			</div>
		</KeepScale>
	);
}
