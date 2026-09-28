import Icon from "../../../common/Icon";

import CommentsListItem from "../CommentsList/CommentsListItem";
import CreateCommentWindow from "../CreateCommentWindow";

import "./index.scss";

export default function CommentThreadCard({
	comment,
	screenPosition,
	currentPage,
	deleteComment = () => {},
	resolveComment = () => {},
	close = () => {},
}) {
	// Don't render if we don't have a valid position yet
	if (!screenPosition) {
		return null;
	}

	return (
		<div className="comments-thread-card" style={{ left: `${screenPosition.x}px`, top: `${screenPosition.y}px` }}>
			<div className="comments-thread-card-header">
				<span>Opmerkingen</span>
				<div className="comments-thread-card-header-buttons">
					<Icon name={"trashbin-blue"} click={deleteComment} />
					{comment.canResolve && <Icon name={"check-mark-circle"} click={resolveComment} />}
					<Icon name={"cross-blue"} click={close} />
				</div>
			</div>
			<div className="comments-thread-card-list">
				<CommentsListItem comment={comment} repliesByDefault={true} />
			</div>
			{!comment.resolved && (
				<CreateCommentWindow currentPage={currentPage} replyToCommentId={comment.id} reposition={false} />
			)}
		</div>
	);
}
