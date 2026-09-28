import { useRef, useState, useEffect, useMemo, useLayoutEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { TransformComponent, TransformWrapper, useControls } from "react-zoom-pan-pinch";
import _ from "lodash";

import { useQuery } from "@apollo/client/react";
import { GET_PROJECT } from "../../graphql/queries";
import { useApp } from "../../context/AppContext";

import { Button as UIButton } from "@shared/ui";
import { useAuth } from "@shared/ui/context/AuthContext";
import { Alert, Paragraph } from "@amsterdam/design-system-react";

import Icon from "../../components/common/Icon";

import Header from "../../layouts/Header";

import CommentBubble from "../../components/custom/Comments/CommentBubble";
import CommentsOnPage from "../../components/custom/Comments/CommentsOnPage";
import CommentsPortal from "../../components/custom/Comments/CommentsPortal";
import CreateCommentWindow from "../../components/custom/Comments/CreateCommentWindow";
import { useUnreadComments } from "../../hooks/useUnreadComments";
import ListArguments from "../../components/custom/Arguments/ListArguments";
import ListNoArguments from "../../components/custom/Arguments/ListNoArguments";
import OverviewPage from "../../components/custom/Overview/OverviewPage";
import Page from "../../components/custom/A4/Page";
import PageControls from "../../components/custom/A4/PageControls";
import PreviewThemeHeader from "../../components/custom/Preview/PreviewThemeHeader";
import TextWithMention from "../../components/custom/Mention/TextWithMention";

import { calculateTotalPages, generatePaginatedThemes } from "../../utils/paginationUtils";
import { CircularGraph } from "../../components/custom/CircularGraph";
import CoverPage from "../../components/custom/CoverPage";
import { useSmartWindowPosition } from "../../hooks/useSmartWindowPosition";

import "./index.scss";

// Separate component to handle portal rendering for click comment window
function ClickCommentPortal({ bubbleRef, currentPage, projectId, clickPosition }) {
	const position = useSmartWindowPosition(bubbleRef, [clickPosition?.x, clickPosition?.y]);

	return (
		<CommentsPortal>
			<CreateCommentWindow currentPage={currentPage} projectId={projectId} screenPosition={position} />
		</CommentsPortal>
	);
}

function EditorViewport({
	project,
	paginatedThemes,
	totalCalculatedPages,
	currentPage,
	setCurrentPage,
	defaultScale,
	smallPreview,
}) {
	const { centerView, zoomIn, zoomOut } = useControls();
	const { commentMode, clickPosition } = useApp();
	const { userFullName } = useAuth();
	const location = useLocation();
	const clickBubbleRef = useRef(null);
	const { projectSlug } = useParams();
	const { unreadCount } = useUnreadComments(projectSlug);

	// Map argument/theme IDs → page numbers for anchor-based comment positioning
	const argumentPageMap = useMemo(() => {
		const map = new Map();
		paginatedThemes.forEach((themePageData, pageIndex) => {
			const pageNumber = pageIndex + 3;
			themePageData.arguments.forEach((arg) => map.set(arg.id, pageNumber));
			if (themePageData.isFirstPage) map.set(`theme:${themePageData.id}`, pageNumber);
		});
		return map;
	}, [paginatedThemes]);

	useEffect(() => {
		setTimeout(() => {
			centerView(defaultScale);
		}, 50);
	}, [location, defaultScale, commentMode]);

	return (
		<div className="editor-preview-transform">
			<TransformComponent>
				<Page
					currentPage={currentPage}
					display={currentPage === 0}
					subtitle={project.name}
					date={project.updatedAt}
					totalPages={totalCalculatedPages}
				>
					<CoverPage project={project} totalPages={totalCalculatedPages} />
				</Page>
				<Page currentPage={currentPage} display={currentPage === 1} date={project.updatedAt}>
					<div className="transformcomponent-page-content-frontpage-header">
						<span className="transformcomponent-page-content-frontpage-header-title">Totaaloverzicht</span>
						<span className="transformcomponent-page-content-frontpage-header-text">
							Grootte van het gekleurde vlak is het aantal negatieve en positieve effecten.
							<br />
							Neutrale effecten worden niet weergegeven.
						</span>
					</div>
					<CircularGraph themes={project.themes} />
					<div className="chart-legend">
						<span className="chart-legend-title">Legenda</span>
						<div className="chart-legend-list">
							<div className="chart-legend-list-item">
								<Icon name={"chart-legend-current"} />
								<span>Huidige situatie</span>
							</div>
							<div className="chart-legend-list-item">
								<Icon name={"chart-legend-positive"} />
								<span>Positieve argumenten (buitenste ring)</span>
							</div>
							<div className="chart-legend-list-item">
								<Icon name={"chart-legend-negative"} />
								<span>Negatieve argumenten (binnenste ring)</span>
							</div>
							<div className="chart-legend-list-item">
								<Icon name={"chart-legend-discussion"} />
								<span>Voorgesteld bespreekpunt</span>
							</div>
							<div className="chart-legend-list-item">
								<Icon name={"chart-legend-theme-missing"} />
								<span>Thema niet meegenomen in overweging</span>
							</div>
							<div className="chart-legend-list-item">
								<Icon name={"chart-legend-location-inside"} />
								<span>Effect binnen de stad</span>
								<Icon name={"chart-legend-location-outside"} />
								<span>Effect buiten de stad</span>
							</div>
							<div className="chart-legend-list-item">
								<Icon name={"chart-legend-time-short"} />
								<span>Effect binnen 10 jaar</span>
								<Icon name={"chart-legend-time-long"} />
								<span>Effect na 10 jaar</span>
							</div>
						</div>
					</div>
					<div className="transformcomponent-page-content-frontpage-key-message">
						<span className="transformcomponent-page-content-frontpage-key-message-title">
							Kernboodschap
						</span>
						<ul className="transformcomponent-page-content-frontpage-key-message-list">
							{project.keyMessage
								? project.keyMessage.split("• ").map((message, mIndex) => {
										if (!message) return null;
										return (
											<li key={mIndex}>
												<TextWithMention text={message} />
											</li>
										);
									})
								: null}
						</ul>
					</div>
				</Page>
				<Page currentPage={currentPage} display={currentPage === 2} date={project.updatedAt}>
					<OverviewPage themes={project.themes} />
				</Page>
				{paginatedThemes.map((themePageData, pageIndex) => {
					const pageNumber = pageIndex + 3; // +3 for cover, graph and overview pages
					return (
						<Page
							currentPage={currentPage}
							display={currentPage === pageNumber}
							subtitle={project.name}
							date={project.updatedAt}
							totalPages={totalCalculatedPages}
							key={`theme-${themePageData.name}-${themePageData.pageNumber || pageIndex}`}
						>
							{/* Only show theme header on first page of theme */}
							{themePageData.isFirstPage && (
								<PreviewThemeHeader theme={project.themes.find((t) => t.id === themePageData.id)} />
							)}

							{/* Show continuation indicator for subsequent pages */}
							{themePageData.continuedTheme && (
								<div className="theme-continuation-header">
									{/* <h2>{themePageData.name} (vervolg)</h2> */}
								</div>
							)}

							{!themePageData.arguments.length ? (
								<ListNoArguments theme={themePageData} preview={true} />
							) : (
								<div className="theme-arguments-list">
									<ListArguments
										project={project}
										theme={themePageData}
										args={themePageData.arguments}
										preview={true}
									/>
								</div>
							)}
						</Page>
					);
				})}
				{commentMode && (
					<>
						<CommentsOnPage currentPage={currentPage} argumentPageMap={argumentPageMap} />
						{clickPosition && (
							<>
								<CommentBubble
									userFullName={userFullName}
									position={clickPosition}
									bubbleRef={clickBubbleRef}
									isDraft
								/>
								<ClickCommentPortal
									bubbleRef={clickBubbleRef}
									currentPage={currentPage}
									projectId={project.id}
									clickPosition={clickPosition}
								/>
							</>
						)}
					</>
				)}
			</TransformComponent>
			<PageControls
				currentPage={currentPage}
				setCurrentPage={setCurrentPage}
				centerView={() => centerView(defaultScale)}
				zoomIn={zoomIn}
				zoomOut={zoomOut}
				smallPreview={smallPreview}
				totalPages={totalCalculatedPages}
				hasUnreadComments={unreadCount > 0}
			/>
		</div>
	);
}

export default function EditorPreview() {
	const { projectSlug } = useParams();

	const navigate = useNavigate();
	const location = useLocation();

	const { data, loading, error } = useQuery(GET_PROJECT, {
		variables: { slug: projectSlug },
		fetchPolicy: "cache-first",
	});

	// Keep the cover as PDF page 1, but open the interactive preview on the scan.
	const [currentPage, setCurrentPage] = useState(1);
	const [smallPreview, setSmallPreview] = useState(location.pathname.startsWith("/project/"));
	const [sharePreview, setSharePreview] = useState(location.pathname.startsWith("/share/"));
	const [defaultScale, setDefaultScale] = useState(0.1); // default scale size
	const wrapperRef = useRef();

	// Calculate paginated themes based on content height - conditional to prevent errors
	const paginatedThemes = useMemo(() => {
		if (!data?.project?.themes) return [];
		return generatePaginatedThemes(data.project.themes);
	}, [data?.project?.themes]);

	const totalCalculatedPages = useMemo(() => {
		if (!data?.project?.themes) return 3; // minimum pages (cover + graph + overview)
		return calculateTotalPages(data.project.themes);
	}, [data?.project?.themes]);

	const handleResize = () => {
		if (!wrapperRef.current) return;
		const wrapperComponentHeight = wrapperRef.current.instance.wrapperComponent.offsetHeight;
		setDefaultScale((wrapperComponentHeight * 0.75) / 3508); // take around 70% of the wrapper to fill
	};

	useEffect(() => {
		window.addEventListener("resize", handleResize);
		handleResize();
		return () => {
			window.removeEventListener("resize", handleResize);
		};
	}, []);

	if (loading)
		return <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>Project laden...</div>;
	if (error)
		return (
			<Alert heading="Niet gelukt" headingLevel={2} severity="error">
				<Paragraph>Fout tijdens het laden van project: {error.message}</Paragraph>
			</Alert>
		);
	const { project } = data;

	return (
		<div className="editor-preview">
			<div id="comments-portal-root"></div>
			<div className="editor-preview-header">
				{sharePreview ? (
					<div></div>
				) : smallPreview ? (
					<UIButton
						className="editor-preview-header-action"
						variant="quaternary"
						onClick={() => navigate(`/preview/${projectSlug}`)}
					>
						<Icon name={"expand"} />
						<span>Volledig beeld openen</span>
					</UIButton>
				) : (
					<UIButton
						className="editor-preview-header-action"
						variant="quaternary"
						onClick={() => navigate(`/project/${projectSlug}`)}
					>
						<Icon name={"shrink"} />
						<span>Weergave sluiten</span>
					</UIButton>
				)}
				<div className="editor-preview-header-auto-saved">
					<Icon name={"checkmark-alert"} />
					<span>Opgeslagen</span>
				</div>
			</div>
			<TransformWrapper
				onInit={() => handleResize()}
				initialScale={defaultScale}
				minScale={defaultScale}
				maxScale={4}
				limitToBounds={false}
				centerOnInit={true}
				smooth={true}
				doubleClick={{ disabled: true }}
				panning={{ velocityDisabled: false, wheelPanning: true }}
				wheel={{ wheelDisabled: true }}
				ref={wrapperRef}
			>
				<EditorViewport
					project={project}
					paginatedThemes={paginatedThemes}
					totalCalculatedPages={totalCalculatedPages}
					currentPage={currentPage}
					setCurrentPage={setCurrentPage}
					defaultScale={defaultScale}
					smallPreview={smallPreview}
				/>
			</TransformWrapper>
		</div>
	);
}
