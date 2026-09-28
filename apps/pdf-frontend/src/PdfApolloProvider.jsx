import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";
import { setContext } from "@apollo/client/link/context";

/**
 * PDF-specific Apollo Provider that avoids MSAL imports
 *
 * This provider is designed for PDF generation and:
 * - Does NOT import auth service (avoids MSAL dependencies)
 * - Only uses service token authentication
 * - Has minimal overhead for fast PDF rendering
 */

// PDF-specific auth link that only handles service tokens
const pdfAuthLink = setContext(async (_, { headers }) => {
	try {
		// Only get service token from localStorage - no MSAL
		const serviceToken = localStorage.getItem('pdfServiceToken');

		if (serviceToken) {
			return {
				headers: {
					...headers,
					authorization: `Bearer ${serviceToken}`,
				},
			};
		}

		console.warn("[pdfAuthLink] No service token found");
		return { headers };
	} catch (error) {
		console.error("[pdfAuthLink] Failed to get service token:", error);
		return { headers };
	}
});

export const PdfApolloProvider = ({ children }) => {
	// Create Apollo Client with PDF-specific configuration
	const client = new ApolloClient({
		link: pdfAuthLink.concat(
			createHttpLink({
				uri: `${import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"}/graphql`,
			})
		),
		cache: new InMemoryCache({
			typePolicies: {
				Project: {
					keyFields: ["slug"],
				},
				Theme: {
					keyFields: ["projectSlug", "slug"],
				},
			},
		}),
		// Disable dev tools for performance
		connectToDevTools: false,
	});

	return <ApolloProvider client={client}>{children}</ApolloProvider>;
};
