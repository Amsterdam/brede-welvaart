import { StrictMode, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";

import { PdfApolloProvider } from "./PdfApolloProvider";
import PdfRenderer from "./components/PdfRenderer";

// Import styles from main frontend app
import "@frontend/assets/scss/variables.scss"; // Ensure CSS variables are loaded
import "@frontend/main.scss";
import "@frontend/assets/scss/fonts.scss";

/**
 * PDF-only frontend app
 *
 * This is a completely separate app that:
 * - Has NO MSAL dependencies in package.json
 * - Imports only what it needs from main frontend
 * - Runs on port 5174 independently
 * - Avoids all crypto/MSAL issues in Puppeteer
 */

console.log('PDF frontend app initializing');

const PdfApp = () => {
  const [projectSlug, setProjectSlug] = useState(null);
  const [pageNumber, setPageNumber] = useState(-1);
  const [error, setError] = useState(null);

  useEffect(() => {
    const parseUrlParams = () => {
      const urlParams = new URLSearchParams(window.location.search);

      // Extract all parameters from query string only
      const slugFromQuery = urlParams.get('slug');
      const pageFromQuery = urlParams.get('page');
      const tokenFromQuery = urlParams.get('token');

      console.log('Parsing URL:', {
        pathname: window.location.pathname,
        search: window.location.search,
        slugFromQuery,
        pageFromQuery,
        hasToken: !!tokenFromQuery
      });

      if (!slugFromQuery) {
        setError('Invalid PDF URL format. Expected: /pdf?slug=project-slug&page=N&token=TOKEN');
        return;
      }

      if (!tokenFromQuery) {
        setError('Missing service token in URL. Expected: /pdf?slug=project-slug&page=N&token=TOKEN');
        return;
      }

      // Store the service token for use in Apollo Client
      if (typeof window !== 'undefined') {
        localStorage.setItem('pdfServiceToken', tokenFromQuery);
      }

      setProjectSlug(slugFromQuery);
      setPageNumber(pageFromQuery ? parseInt(pageFromQuery, 10) : 0);
      setError(null);
    };

    // Parse initial URL
    parseUrlParams();

    // Listen for URL changes (for navigation within the same page)
    const handlePopState = () => {
      parseUrlParams();
    };

    window.addEventListener('popstate', handlePopState);

    // Clean up listener
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  if (error) {
    return <div>{error}</div>;
  }

  if (projectSlug === null) {
    return <div>Loading...</div>;
  }

  return (
    <PdfApolloProvider>
      <PdfRenderer
        projectSlug={projectSlug}
        pageNumber={pageNumber}
      />
    </PdfApolloProvider>
  );
};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PdfApp />
  </StrictMode>
);
