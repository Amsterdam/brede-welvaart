/**
 * Utility to parse GraphQL errors into field-specific validation errors
 * that can be easily consumed by form components
 */

import { CombinedGraphQLErrors, ServerError, ServerParseError } from "@apollo/client/errors";

// Apollo Client v4 changed the error shape: combined GraphQL errors arrive as a
// CombinedGraphQLErrors instance exposing `.errors`, and network failures as
// ServerError / ServerParseError — not the v3 `.graphQLErrors` / `.networkError`.
// Support both so field-level parsing keeps working after the v4 upgrade (and so
// the unit tests, which use the v3 plain-object shape, stay valid).
function extractGraphQLErrors(error) {
	if (error instanceof CombinedGraphQLErrors) return error.errors ?? [];
	if (Array.isArray(error?.graphQLErrors)) return error.graphQLErrors;
	if (Array.isArray(error?.errors)) return error.errors;
	return [];
}

function isNetworkError(error) {
	return Boolean(error?.networkError) || error instanceof ServerError || error instanceof ServerParseError;
}

/**
 * Parses GraphQL errors and extracts field-specific validation errors
 * @param {Object} error - The GraphQL error object from Apollo Client
 * @returns {Object} Object with field names as keys and error messages as values
 */
export function parseGraphQLFieldErrors(error) {
	if (!error) return {};

	if (isNetworkError(error)) {
		return { general: "Netwerkfout: Controleer je internetverbinding" };
	}

	const graphQLErrors = extractGraphQLErrors(error);
	if (!graphQLErrors.length) {
		return {};
	}

	const fieldErrors = {};

	graphQLErrors.forEach((gqlError) => {
		const message = gqlError.message;
		const field = gqlError.extensions?.field;

		if (field) {
			fieldErrors[field] = message;
			return;
		}

		// Handle different types of GraphQL validation errors
		if (message.includes("Field") && message.includes("was not provided")) {
			// Extract field name from "Field 'fieldName' of required type..."
			const fieldMatch = message.match(/Field "([^"]+)" of required type/);
			if (fieldMatch) {
				const fieldName = fieldMatch[1];
				fieldErrors[fieldName] = `${getFieldDisplayName(fieldName)} is verplicht`;
			}
		} else if (message.includes("is not defined by type")) {
			// Extract field name from "Field 'fieldName' is not defined by type..."
			const fieldMatch = message.match(/Field "([^"]+)" is not defined by type/);
			if (fieldMatch) {
				const fieldName = fieldMatch[1];
				fieldErrors[fieldName] = `${getFieldDisplayName(fieldName)} is niet geldig`;
			}
		} else if (message.includes("does not exist in") && message.includes("enum")) {
			// Handle enum validation errors (e.g., empty sentiment value)
			const variablePathMatch = message.match(/Variable "\$\w+" got invalid value .* at "([^"]+)"/);
			if (variablePathMatch) {
				const fullPath = variablePathMatch[1];
				const fieldName = fullPath.split(".").pop();
				fieldErrors[fieldName] = `${getFieldDisplayName(fieldName)} is verplicht`;
			}
		} else if (message.includes("Expected non-nullable type") && message.includes("not to be null")) {
			// Handle null value errors for non-nullable types (e.g., source object)
			const variablePathMatch = message.match(/Variable "\$\w+" got invalid value .* at "([^"]+)"/);
			if (variablePathMatch) {
				const fullPath = variablePathMatch[1];
				const fieldName = fullPath.includes("source.type") ? "source" : fullPath.split(".").pop();
				fieldErrors[fieldName] = `${getFieldDisplayName(fieldName)} is verplicht`;
			}
		} else if (message.includes("got invalid value null") && message.includes("enum")) {
			// Handle null enum type errors (e.g., source.type is null)
			const variablePathMatch = message.match(/Variable "\$\w+" got invalid value .* at "([^"]+)"/);
			if (variablePathMatch) {
				const fullPath = variablePathMatch[1];
				const fieldName = fullPath.includes("source.type") ? "source" : fullPath.split(".").pop();
				fieldErrors[fieldName] = `${getFieldDisplayName(fieldName)} is verplicht`;
			}
		} else if (message.includes("Value cannot be an empty string")) {
			// Handle NonEmptyString validation errors from graphql-scalars
			// Extract field name from the variable path like "input.title"
			const variablePathMatch = message.match(/Variable "\$\w+" got invalid value .* at "([^"]+)"/);
			if (variablePathMatch) {
				const fullPath = variablePathMatch[1]; // e.g., "input.title"
				const fieldName = fullPath.split(".").pop(); // Extract "title" from "input.title"
				fieldErrors[fieldName] = `${getFieldDisplayName(fieldName)} mag niet leeg zijn`;
			} else {
				// Fallback: try to extract from the error message itself
				const directFieldMatch = message.match(/at "input\.(\w+)"/);
				if (directFieldMatch) {
					const fieldName = directFieldMatch[1];
					fieldErrors[fieldName] = `${getFieldDisplayName(fieldName)} mag niet leeg zijn`;
				} else {
					fieldErrors["general"] = "Een of meer velden mogen niet leeg zijn";
				}
			}
		} else if (message.includes("Expected type NonEmptyString")) {
			// Handle other NonEmptyString validation errors
			fieldErrors["general"] = "Een of meer velden hebben een ongeldige waarde";
		} else if (message.includes("Value is not a string") || message.includes("Cannot represent value as string")) {
			// Handle scalar type validation errors
			fieldErrors["general"] = "Een of meer velden hebben een ongeldige waarde";
		} else if (message.includes("invalid value")) {
			// Handle general invalid value errors
			// Try to extract specific field information from the error
			const fieldMatch = message.match(/\{ ([^:]+): "([^"]*)" \}/);
			if (fieldMatch) {
				const fieldName = fieldMatch[1];
				const value = fieldMatch[2];
				if (value === "") {
					fieldErrors[fieldName] = `${getFieldDisplayName(fieldName)} mag niet leeg zijn`;
				} else {
					fieldErrors[fieldName] = `${getFieldDisplayName(fieldName)} heeft een ongeldige waarde`;
				}
			}
		} else if (message.includes("ValidationError")) {
			// Handle MongoDB validation errors
			const mongoFieldMatch = message.match(/Path `([^`]+)` is required/);
			if (mongoFieldMatch) {
				const fieldName = mongoFieldMatch[1];
				fieldErrors[fieldName] = `${getFieldDisplayName(fieldName)} is verplicht`;
			} else if (message.includes("cannot be empty")) {
				const emptyFieldMatch = message.match(/Path `([^`]+)`.*cannot be empty/);
				if (emptyFieldMatch) {
					const fieldName = emptyFieldMatch[1];
					fieldErrors[fieldName] = `${getFieldDisplayName(fieldName)} mag niet leeg zijn`;
				}
			}
		} else if (message.includes("Maximaal") && message.includes("argumenten per")) {
			// Handle custom argument limit errors
			// These are sentiment-specific errors, so assign them to the sentiment field
			fieldErrors["sentiment"] = message;
		} else {
			// Handle any other unrecognized errors as general errors
			// This ensures custom errors like argument limits are always shown to the user
			fieldErrors["general"] = message;
		}
	});

	return fieldErrors;
}

/**
 * Maps GraphQL field names to user-friendly Dutch display names
 * @param {string} fieldName - The GraphQL field name
 * @returns {string} User-friendly field name in Dutch
 */
function getFieldDisplayName(fieldName) {
	const fieldNameMap = {
		name: "Naam",
		title: "Titel",
		description: "Beschrijving",
		explanation: "Beschrijving",
		sentiment: "Emotie",
		discussionPoint: "Bespreekpunt",
		importance: "Belangrijkheid",
		timeFrame: "Tijdskader",
		location: "Locatie",
		source: "Bron",
		sourceType: "Brontype",
		sourceLink: "Bronlink",
		reason: "Aanleiding",
		reasonOther: "Toelichting",
		scanGoal: "Onderwerp van de brede welvaartscan",
		impactMotivation: "Doel van de scan",
		scope: "Afbakening",
		order: "Volgorde",
		themeSlug: "Thema",
	};

	return fieldNameMap[fieldName] || fieldName;
}

/**
 * Checks if a specific field has an error
 * @param {Object} fieldErrors - Object with field errors
 * @param {string} fieldName - Name of the field to check
 * @returns {boolean} True if field has an error
 */
export function hasFieldError(fieldErrors, fieldName) {
	return Boolean(fieldErrors[fieldName]);
}

/**
 * Gets the error message for a specific field
 * @param {Object} fieldErrors - Object with field errors
 * @param {string} fieldName - Name of the field
 * @returns {string|null} Error message or null if no error
 */
export function getFieldError(fieldErrors, fieldName) {
	return fieldErrors[fieldName] || null;
}

/**
 * Creates a general error message from GraphQL errors when no specific field errors are found
 * @param {Object} error - The GraphQL error object from Apollo Client
 * @returns {string|null} General error message or null
 */
export function getGeneralErrorMessage(error) {
	if (!error) return null;

	if (isNetworkError(error)) {
		return "Netwerkfout: Controleer je internetverbinding";
	}

	const graphQLErrors = extractGraphQLErrors(error);
	if (graphQLErrors.length) {
		// Return the first GraphQL error message as fallback
		return graphQLErrors[0].message;
	}

	return error.message || "Er is een onbekende fout opgetreden";
}
