import { useParams } from "react-router-dom";
import _ from "lodash";

import { useApp } from "../../../../context/AppContext";
import { useUnreadComments } from "../../../../hooks/useUnreadComments";

import Icon from "../../../common/Icon";

import CommentsListItem from "./CommentsListItem";

import "./index.scss";

export default function CommentsList() {
	const { projectSlug } = useParams();
	const { setCommentMode } = useApp();

	const { data, loading, error, unreadCount, markAllAsRead } = useUnreadComments(projectSlug);

	return (
		<div className="comments-wrapper">
			<div className="comments-header">
				<div className="comments-header-title">
					<span>Opmerkingen</span>
					{unreadCount > 0 && <span className="comments-header-unread-badge">{unreadCount}</span>}
				</div>
				<div className="comments-header-buttons">
					{unreadCount > 0 && (
						<button className="comments-header-mark-all-read" onClick={markAllAsRead}>
							Alles gelezen
						</button>
					)}
					<Icon click={() => setCommentMode((prev) => !prev)} name={"cross"} />
				</div>
			</div>
			<div className="comments-list">
				{loading ? (
					<span>Opmerkingen laden...</span>
				) : error ? (
					<span>Fout tijdens het laden van opmerkingen.</span>
				) : (
					_.orderBy(data.comments, ["updatedAt"], "desc").map((comment) => {
						return <CommentsListItem comment={comment} key={comment.id} />;
					})
				)}
			</div>
		</div>
	);
}
