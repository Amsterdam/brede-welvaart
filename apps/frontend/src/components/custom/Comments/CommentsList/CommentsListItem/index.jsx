import { useState, useEffect } from "react";
import moment from "moment";

import { Button as UIButton } from "@shared/ui";

import getInitials from "../../../../../utils/getInitials";

import "./index.scss";

export default function CommentsListItem({ comment, repliesByDefault = false }) {
	const hasUnread = comment.hasUnread;
	const unreadReplyCount = comment.unreadReplyCount || 0;

	// Auto-expand replies when thread has unread replies
	const [toggleReplies, setToggleReplies] = useState(hasUnread && unreadReplyCount > 0);

	// Update toggle when unread state changes
	useEffect(() => {
		if (hasUnread && unreadReplyCount > 0) {
			setToggleReplies(true);
		}
	}, [hasUnread, unreadReplyCount]);

	const Comment = ({ item, isUnreadReply = false }) => {
		const initals = getInitials(comment.author.displayName);

		return (
			<div className="comment-item">
				<div className="comment-item-left">
					<div className="comment-item-left-initials">
						<span>{initals}</span>
					</div>
				</div>
				<div className="comment-item-content">
					<div className="comment-item-content-header">
						<span>{item.author.displayName}</span>
						<span>{moment(item.updatedAt).fromNow()}</span>
						{isUnreadReply && <span className="comment-item-nieuw-badge">Nieuw</span>}
					</div>
					<span className="comment-item-content-text">{item.body}</span>
				</div>
			</div>
		);
	};

	// Determine which replies are "new" (last N replies where N = unreadReplyCount)
	const replyStartIndex = Math.max(0, comment.replies.length - unreadReplyCount);

	return (
		<div className={`thread ${hasUnread ? "thread--unread" : ""}`}>
			<Comment item={comment} />
			{!repliesByDefault && comment.replies.length > 0 && (
				<UIButton variant="quaternary" onClick={() => setToggleReplies((prev) => !prev)}>
					{toggleReplies ? "Antwoorden sluiten" : "Antwoorden openen"}
				</UIButton>
			)}
			{(toggleReplies || repliesByDefault) && comment.replies.length > 0 && (
				<>
					<div className="thread-replies-list-divider" />
					<div className="thread-replies-list">
						{comment.replies.map((reply, rIndex) => {
							const isUnread = hasUnread && rIndex >= replyStartIndex;
							return <Comment item={reply} isUnreadReply={isUnread} key={rIndex} />;
						})}
					</div>
				</>
			)}
		</div>
	);
}
