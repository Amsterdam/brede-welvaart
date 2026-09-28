import { useMemo, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import _ from "lodash";

import { useQuery } from "@apollo/client/react";
import { GET_PROJECT } from "@frontend/graphql/queries";

import Page from "../A4/Page";
import Icon from "@frontend/components/common/Icon";
import ListArguments from "@frontend/components/custom/Arguments/ListArguments";
import ListNoArguments from "@frontend/components/custom/Arguments/ListNoArguments";
import OverviewPage from "@frontend/components/custom/Overview/OverviewPage";
import PreviewThemeHeader from "@frontend/components/custom/Preview/PreviewThemeHeader";
import TextWithMention from "@frontend/components/custom/Mention/TextWithMention";
import { CircularGraph } from "@frontend/components/custom/CircularGraph";
import CoverPage from "@frontend/components/custom/CoverPage";
import {
  generatePaginatedThemes,
  calculateTotalPages,
} from "@frontend/utils/paginationUtils";

import "@frontend/pages/EditorPreview/index.scss";
import "./index.scss";

export default function PdfRenderer({ projectSlug, pageNumber }) {
  // Use props directly - no React Router dependency
  const currentPage = pageNumber;
  const slug = projectSlug;

  const { data, loading, error } = useQuery(GET_PROJECT, {
    variables: { slug: projectSlug },
    fetchPolicy: "cache-first",
  });

  // Render the A4 page at full size (1:1). The on-screen editor shrinks the page to
  // fit a viewport, but this renderer is a print target — the backend's page.pdf()
  // box (scale 0.5 of the 2480×3508 page) does the downscaling. Any zoom transform
  // here shrinks the page into the top-left corner of the PDF. react-zoom-pan-pinch v4
  // applies initialScale even when disabled, so this must stay 1.
  const [scale, setScale] = useState(1);

  // Calculate paginated themes based on content height
  const paginatedThemes = useMemo(() => {
    if (!data?.project?.themes) return [];
    return generatePaginatedThemes(data.project.themes);
  }, [data?.project?.themes]);
  const totalCalculatedPages = useMemo(() => {
    if (!data?.project?.themes) return 3; // minimum pages (cover + graph + overview)
    return calculateTotalPages(data.project.themes);
  }, [data?.project?.themes]);

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        Project laden...
      </div>
    );
  if (error) return <div>Error: {error.message}</div>;
  const { project } = data;

  // Expose total pages for Puppeteer to access
  if (typeof window !== "undefined") {
    window.totalCalculatedPages = totalCalculatedPages;
    window.localStorage.setItem("pdfTotalPages", totalCalculatedPages);
  }

  return (
    <div
      className="editor-preview"
      data-total-pages={totalCalculatedPages}
      data-page-ready="true"
    >
      <TransformWrapper
        initialScale={scale}
        minScale={scale}
        disabled={true}
        customTransform={() => {}}
      >
        <div className="editor-preview-transform">
          <TransformComponent>
            {data.project.status === "DRAFT" ? (
              <div className="watermark">
                <span>Concept</span>
              </div>
            ) : null}
            <Page
              currentPage={currentPage}
              display={currentPage === 0}
              subtitle={project.name}
              date={project.updatedAt}
              totalPages={totalCalculatedPages}
            >
              <CoverPage project={project} totalPages={totalCalculatedPages} />
            </Page>
            <Page
              currentPage={currentPage}
              display={currentPage === 1}
              date={project.updatedAt}
              totalPages={totalCalculatedPages}
            >
              <div className="transformcomponent-page-content-frontpage-header">
                <span className="transformcomponent-page-content-frontpage-header-title">
                  Totaaloverzicht
                </span>
                <span className="transformcomponent-page-content-frontpage-header-text">
                  Grootte van het gekleurde vlak is het aantal negatieve en
                  positieve effecten.
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
            <Page
              currentPage={currentPage}
              display={currentPage === 2}
              date={project.updatedAt}
              totalPages={totalCalculatedPages}
            >
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
                  key={`theme-${themePageData.name}-${themePageData.pageNumber || pageIndex}`}
                  totalPages={totalCalculatedPages}
                >
                  {/* Only show theme header on first page of theme */}
                  {themePageData.isFirstPage && (
                    <PreviewThemeHeader
                      theme={project.themes.find(
                        (t) => t.id === themePageData.id,
                      )}
                    />
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
          </TransformComponent>
        </div>
      </TransformWrapper>
    </div>
  );
}
