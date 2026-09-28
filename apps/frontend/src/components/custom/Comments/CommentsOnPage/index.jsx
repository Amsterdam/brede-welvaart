import { Fragment, useEffect, useState, useRef, useLayoutEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useTransformContext } from "react-zoom-pan-pinch";

import { useApp } from "../../../../context/AppContext";

import { useMutation } from "@apollo/client/react";
import { GET_COMMENTS } from "../../../../graphql/queries";
import { DELETE_COMMENT, MARK_COMMENT_RESOLVED } from "../../../../graphql/mutations";
import { useUnreadComments } from "../../../../hooks/useUnreadComments";
import { useSmartWindowPosition } from "../../../../hooks/useSmartWindowPosition";

import CommentsPortal from "../CommentsPortal";
import CommentBubble from "../CommentBubble";
import CommentThreadCard from "../CommentThreadCard";

/**
 * Resolve the page number for a comment, using anchor data when available.
 * Falls back to the stored page number for legacy comments without anchors.
 */
function resolveCommentPage(comment, argumentPageMap) {
	const anchor = comment.anchor;
	if (anchor && argumentPageMap) {
		if (anchor.type === "argument" && anchor.argumentId) {
			const page = argumentPageMap.get(anchor.argumentId);
			if (page != null) return page;
		}
		if (anchor.type === "theme" && anchor.themeId) {
			const page = argumentPageMap.get(`theme:${anchor.themeId}`);
			if (page != null) return page;
		}
	}
	// Fallback: stored page number
	return parseInt(comment.page.split(":")[0]);
}

/**
 * Resolve the position for a comment bubble. For anchored comments, compute
 * position from the anchor element's DOM rect + stored relative offset.
 * Falls back to stored locationData for legacy or orphaned comments.
 */
function resolveCommentPosition(comment, pageEl, scale) {
	const anchor = comment.anchor;

	if (anchor && anchor.relativePosition && pageEl) {
		let anchorEl = null;
		if (anchor.type === "argument" && anchor.argumentId) {
			anchorEl = pageEl.querySelector(`[data-argument-id="${anchor.argumentId}"]`);
		} else if (anchor.type === "theme" && anchor.themeId) {
			anchorEl = pageEl.querySelector(`[data-theme-id="${anchor.themeId}"]`);
		}

		if (anchorEl) {
			const pageRect = pageEl.getBoundingClientRect();
			const anchorRect = anchorEl.getBoundingClientRect();

			// Convert anchor element's position to document-space (unscaled) coordinates
			// relative to the page, then add the stored relative offset
			const x = (anchorRect.left - pageRect.left) / scale + anchor.relativePosition.x;
			const y = (anchorRect.top - pageRect.top) / scale + anchor.relativePosition.y;
			return { x, y };
		}
	}

	// Fallback: stored absolute position
	return {
		x: comment.locationData.x,
		y: comment.locationData.y,
	};
}

export default function CommentsOnPage({ currentPage, argumentPageMap }) {
	const { projectSlug } = useParams();
	const { clickPosition, setClickPosition } = useApp();
	// react-zoom-pan-pinch v4 exposes the live transform as `state` (was `transformState` in v3).
	const { state: transformState } = useTransformContext();

	const [activeCommentIndex, setActiveCommentIndex] = useState(null);
	const [errorMessage, setErrorMessage] = useState(null);
	const [resolvedPositions, setResolvedPositions] = useState({});
	const bubbleRefs = useRef({});
	const markReadTimerRef = useRef(null);

	const { data, loading, error, refetch, markAsRead } = useUnreadComments(projectSlug);

	const [deleteComment, { error: deleteCommentError }] = useMutation(DELETE_COMMENT, {
		onCompleted: () => {
			refetch();
		},
	});

	const [resolveComment, { error: resolveCommentError }] = useMutation(MARK_COMMENT_RESOLVED, {
		onCompleted: () => {
			refetch();
		},
	});

	useEffect(() => {
		if (deleteCommentError) {
			console.error("Fout bij het verwijderen van de opmerking:", deleteCommentError.message);
			setErrorMessage("Fout bij het verwijderen van de opmerking");
		}
		if (resolveCommentError) {
			console.error("Fout bij het oplossen van de opmerking:", resolveCommentError.message);
			setErrorMessage("Fout bij het oplossen van de opmerking");
		}
	}, [deleteCommentError, resolveCommentError]);

	// Filter comments for the current page using anchor-based resolution
	const pageComments = useMemo(
		() =>
			data?.comments?.filter((comment) => {
				return resolveCommentPage(comment, argumentPageMap) === currentPage;
			}) ?? [],
		[data?.comments, argumentPageMap, currentPage]
	);

	// Stable key for layout effect — only re-run when the set of comments changes
	const pageCommentIds = pageComments.map((c) => c.id).join(",");

	// Resolve positions from DOM after layout for anchored comments
	useLayoutEffect(() => {
		if (!pageComments.length) {
			setResolvedPositions({});
			return;
		}

		// Find the currently visible page element
		const pageEls = document.querySelectorAll(".transformcomponent-page");
		let pageEl = null;
		for (const el of pageEls) {
			if (el.style.display !== "none") {
				pageEl = el;
				break;
			}
		}

		const scale = transformState.scale;
		const positions = {};
		for (const comment of pageComments) {
			positions[comment.id] = resolveCommentPosition(comment, pageEl, scale);
		}
		setResolvedPositions(positions);
	}, [pageCommentIds, currentPage, transformState.scale, argumentPageMap]);

	// Mark-as-read on thread open with 1s delay
	useEffect(() => {
		if (markReadTimerRef.current) {
			clearTimeout(markReadTimerRef.current);
			markReadTimerRef.current = null;
		}

		if (activeCommentIndex === null || !pageComments.length) return;

		const comment = pageComments[activeCommentIndex];

		if (comment?.hasUnread) {
			markReadTimerRef.current = setTimeout(() => {
				markAsRead(comment.id);
			}, 1000);
		}

		return () => {
			if (markReadTimerRef.current) {
				clearTimeout(markReadTimerRef.current);
			}
		};
	}, [activeCommentIndex, pageComments, markAsRead]);

	const handleDelete = async (commentId) => {
		await deleteComment({
			variables: {
				deleteCommentId: commentId,
			},
		}).then(() => setActiveCommentIndex(null));
	};

	const handleResolve = async (commentId) => {
		await resolveComment({
			variables: {
				resolveCommentId: commentId,
			},
		});
	};

	useEffect(() => {
		setActiveCommentIndex(null);
	}, [currentPage]);

	useEffect(() => {
		if (!clickPosition) return;
		setActiveCommentIndex(null);
	}, [clickPosition]);

	if (loading) {
		return;
	}

	if (error) {
		return (
			<CommentsPortal>
				<div className="error-message" style={{ color: "red", padding: "10px" }}>
					Fout bij het laden van opmerkingen
					<button onClick={() => refetch()} style={{ marginLeft: "10px" }}>
						Opnieuw proberen
					</button>
				</div>
			</CommentsPortal>
		);
	}

	if (errorMessage) {
		return (
			<CommentsPortal>
				<div className="error-message" style={{ color: "red", padding: "10px" }}>
					{errorMessage}
					<button onClick={() => setErrorMessage(null)} style={{ marginLeft: "10px" }}>
						Sluiten
					</button>
				</div>
			</CommentsPortal>
		);
	}

	return (
		<>
			{pageComments.map((comment, cIndex) => {
				const position = resolvedPositions[comment.id] || {
					x: comment.locationData.x,
					y: comment.locationData.y,
				};
				const isActive = activeCommentIndex === cIndex;

				// Create ref for this bubble if it doesn't exist
				if (!bubbleRefs.current[comment.id]) {
					bubbleRefs.current[comment.id] = { current: null };
				}

				return (
					<Fragment key={comment.id}>
						<CommentBubble
							userFullName={comment.author.displayName}
							position={position}
							resolved={comment.resolved}
							hasUnread={comment.hasUnread}
							bubbleRef={bubbleRefs.current[comment.id]}
							click={() => {
								setActiveCommentIndex(cIndex);
								setClickPosition(null);
							}}
						/>
						{isActive && (
							<PortalizedCommentCard
								comment={comment}
								bubbleRef={bubbleRefs.current[comment.id]}
								currentPage={currentPage}
								deleteComment={async () => handleDelete(comment.id)}
								resolveComment={async () => handleResolve(comment.id)}
								close={() => setActiveCommentIndex(null)}
							/>
						)}
					</Fragment>
				);
			})}
		</>
	);
}

// Separate component to handle portal rendering with smart positioning
function PortalizedCommentCard({ comment, bubbleRef, currentPage, deleteComment, resolveComment, close }) {
	const position = useSmartWindowPosition(bubbleRef, [comment.id]);

	return (
		<CommentsPortal>
			<CommentThreadCard
				comment={comment}
				screenPosition={position}
				currentPage={currentPage}
				deleteComment={deleteComment}
				resolveComment={resolveComment}
				close={close}
			/>
		</CommentsPortal>
	);
}
