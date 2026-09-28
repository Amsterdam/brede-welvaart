import { useEffect, useRef } from "react";
import { useQuery } from "@apollo/client/react";
import { GET_COMMENTS } from "../graphql/queries";

/**
 * Custom hook for light polling of comments
 * Automatically refreshes comments every minute if they haven't been reloaded
 */
export function useCommentsPolling(projectSlug, pollingInterval = 60000) {
	const lastFetchTimeRef = useRef(Date.now());
	const pollingIntervalRef = useRef(null);

	const queryResult = useQuery(GET_COMMENTS, {
		variables: { projectSlug },
		fetchPolicy: "cache-first",
		onCompleted: () => {
			// Update last fetch time when data is successfully loaded
			lastFetchTimeRef.current = Date.now();
		},
	});

	const { refetch } = queryResult;

	useEffect(() => {
		// Clear any existing interval
		if (pollingIntervalRef.current) {
			clearInterval(pollingIntervalRef.current);
		}

		// Set up polling interval
		pollingIntervalRef.current = setInterval(() => {
			const timeSinceLastFetch = Date.now() - lastFetchTimeRef.current;

			// Only refetch if it's been more than the polling interval since last fetch
			if (timeSinceLastFetch >= pollingInterval) {
				refetch()
					.then(() => {
						lastFetchTimeRef.current = Date.now();
					})
					.catch((error) => {
						console.warn("Failed to poll comments:", error);
					});
			}
		}, pollingInterval);

		// Cleanup interval on unmount or when dependencies change
		return () => {
			if (pollingIntervalRef.current) {
				clearInterval(pollingIntervalRef.current);
			}
		};
	}, [projectSlug, pollingInterval, refetch]);

	// Function to manually trigger a fetch and reset the polling timer
	const manualRefetch = () => {
		lastFetchTimeRef.current = Date.now();
		return refetch();
	};

	return {
		...queryResult,
		refetch: manualRefetch,
	};
}
