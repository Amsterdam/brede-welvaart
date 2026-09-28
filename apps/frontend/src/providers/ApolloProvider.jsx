import { useEffect, useMemo } from "react";
import { ApolloClient, InMemoryCache, createHttpLink } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";
import { onError } from "@apollo/client/link/error";
import { authLink, redirectToLogin, setAuthContextTokenGetter } from "../service/auth";
import { useAuth } from "@shared/ui/context/AuthContext";
import { registerSeedDev } from "../utils/seedDev";

const errorLink = onError(({ networkError }) => {
	if (networkError && "statusCode" in networkError && networkError.statusCode === 401) {
		void redirectToLogin("graphql-401");
	}
});

const httpLink = createHttpLink({
	uri: `${import.meta.env.VITE_BACKEND_URL || "http://localhost:3000"}/graphql`,
});

const link = errorLink.concat(authLink).concat(httpLink);

export const EnhancedApolloProvider = ({ children }) => {
	const { getAccessToken } = useAuth();

	useEffect(() => {
		setAuthContextTokenGetter(getAccessToken);
	}, [getAccessToken]);

	const client = useMemo(
		() =>
			new ApolloClient({
				link,
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
				connectToDevTools: process.env.NODE_ENV === "development",
			}),
		[]
	);

	// Exposes window.seedDev() in every environment so example scans can be
	// created from the browser console (incl. prod). Safe: the underlying
	// CREATE_PROJECT mutation is SSO- and facilitator-gated server-side.
	useEffect(() => {
		registerSeedDev(client);
	}, [client]);

	return <ApolloProvider client={client}>{children}</ApolloProvider>;
};
