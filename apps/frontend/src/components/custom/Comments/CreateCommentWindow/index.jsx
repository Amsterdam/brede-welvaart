import { useEffect, useState } from "react";
import { useApp } from "../../../../context/AppContext";

import { useMutation } from "@apollo/client/react";
import { ADD_REPLY, CREATE_COMMENT } from "../../../../graphql/mutations";
import { GET_COMMENTS } from "../../../../graphql/queries";

import { TextInput } from "@amsterdam/design-system-react";
import { Button as UIButton } from "@shared/ui";

import Icon from "../../../common/Icon";

import "./index.scss";

export default function CreateCommentWindow({
	currentPage,
	projectId = false,
	replyToCommentId = false,
	reposition = true,
	screenPosition = null,
}) {
	const { clickPosition, setClickPosition } = useApp();

	const [commentText, setCommentText] = useState("");

	const [createComment, { error: createCommentError }] = useMutation(CREATE_COMMENT, {
		refetchQueries: [GET_COMMENTS],
	});
	const [addReply, { error: addReplyError }] = useMutation(ADD_REPLY, {
		refetchQueries: [GET_COMMENTS],
	});

	useEffect(() => {
		if (createCommentError) {
			console.error("Error creating comment:", createCommentError.message);
		}
		if (addReplyError) {
			console.error("Error creating reply:", addReplyError.message);
		}
	}, [createCommentError, addReplyError]);

	const reset = () => {
		setCommentText("");
		setClickPosition(null);
	};

	const handleSave = async () => {
		if (replyToCommentId) {
			await addReply({
				variables: {
					input: {
						body: commentText,
						commentId: replyToCommentId,
					},
				},
			}).then(() => reset());
			return;
		}
		const { anchor, ...locationData } = clickPosition;
		await createComment({
			variables: {
				input: {
					body: commentText,
					locationData,
					page: currentPage.toString(),
					projectId: projectId,
					anchor: anchor || null,
				},
			},
		}).then(() => reset());
	};

	// User can click "escape" to close the window
	// only when creating new comment, not for replying
	useEffect(() => {
		if (!reposition) return;
		const handleKeyDown = (e) => {
			if (e.key === "Escape") {
				reset();
			}
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [reposition]);

	const windowStyle = reposition && screenPosition
		? { left: `${screenPosition.x}px`, top: `${screenPosition.y}px` }
		: {};

	// Don't render if we don't have a valid position yet
	if (reposition && !screenPosition) {
		return null;
	}

	return (
		<div
			className={`comment-window ${commentText && "comment-window-filled"} ${!reposition && "comment-window-pos-relative"}`}
			style={windowStyle}
		>
			<div className="comment-window-top">
				<TextInput
					autoFocus={true}
					value={commentText}
					onChange={(e) => setCommentText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleSave();
					}}
				/>
				{!commentText && (
					<div className="comment-window-top-input-button">
						<Icon name={"arrow-up-white"} />
					</div>
				)}
			</div>
			{commentText && (
				<div className="comment-window-bottom">
					<UIButton variant="secondary" onClick={() => reset()}>
						Annuleren
					</UIButton>
					<UIButton variant="primary" onClick={async () => handleSave()}>
						Opslaan
					</UIButton>
				</div>
			)}
		</div>
	);
}
