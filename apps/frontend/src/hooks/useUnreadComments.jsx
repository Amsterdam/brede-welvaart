import { useCallback, useMemo, useRef } from "react";
import { useMutation } from "@apollo/client/react";
import { useParams } from "react-router-dom";
import { MARK_COMMENTS_READ, MARK_ALL_PROJECT_COMMENTS_READ } from "../graphql/mutations";
import { GET_COMMENTS } from "../graphql/queries";
import { useCommentsPolling } from "./useCommentsPolling";

/**
 * Hook that wraps useCommentsPolling and adds unread state management.
 * Batches markAsRead calls over 500ms and provides optimistic cache updates.
 */
export function useUnreadComments(projectSlug) {
	const polling = useCommentsPolling(projectSlug);
	const batchRef = useRef([]);
	const timerRef = useRef(null);

	const [markCommentsReadMutation] = useMutation(MARK_COMMENTS_READ, {
		update(cache, _result, { variables }) {
			const ids = variables.commentIds;
			const existing = cache.readQuery({
				query: GET_COMMENTS,
				variables: { projectSlug },
			});
			if (!existing) return;
			cache.writeQuery({
				query: GET_COMMENTS,
				variables: { projectSlug },
				data: {
					comments: existing.comments.map((c) =>
						ids.includes(c.id) ? { ...c, hasUnread: false, unreadReplyCount: 0 } : c
					),
				},
			});
		},
	});

	const [markAllReadMutation] = useMutation(MARK_ALL_PROJECT_COMMENTS_READ, {
		variables: { projectSlug },
		update(cache) {
			const existing = cache.readQuery({
				query: GET_COMMENTS,
				variables: { projectSlug },
			});
			if (!existing) return;
			cache.writeQuery({
				query: GET_COMMENTS,
				variables: { projectSlug },
				data: {
					comments: existing.comments.map((c) => ({
						...c,
						hasUnread: false,
						unreadReplyCount: 0,
					})),
				},
			});
		},
	});

	const flushBatch = useCallback(() => {
		if (batchRef.current.length === 0) return;
		const ids = [...new Set(batchRef.current)];
		batchRef.current = [];
		markCommentsReadMutation({ variables: { commentIds: ids } });
	}, [markCommentsReadMutation]);

	const markAsRead = useCallback(
		(commentId) => {
			if (!batchRef.current.includes(commentId)) {
				batchRef.current.push(commentId);
			}
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(flushBatch, 500);
		},
		[flushBatch]
	);

	const markAllAsRead = useCallback(() => {
		// Clear any pending batch
		batchRef.current = [];
		if (timerRef.current) clearTimeout(timerRef.current);
		markAllReadMutation();
	}, [markAllReadMutation]);

	const comments = polling.data?.comments || [];

	const unreadCount = useMemo(() => comments.filter((c) => c.hasUnread).length, [comments]);

	const unreadIds = useMemo(() => comments.filter((c) => c.hasUnread).map((c) => c.id), [comments]);

	return {
		...polling,
		unreadCount,
		unreadIds,
		markAsRead,
		markAllAsRead,
	};
}
