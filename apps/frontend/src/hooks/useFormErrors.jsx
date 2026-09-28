import { useState, useEffect, useCallback } from "react";
import { parseGraphQLFieldErrors } from "../utils/graphqlErrorParser";

/**
 * Hook that parses Apollo mutation errors into field-specific error maps.
 * Consolidates error parsing so components don't need manual useEffect + useState.
 *
 * @param {...Object} errors - One or more Apollo error objects from useMutation
 * @returns {{ fieldErrors, hasFieldError, getFieldError, generalError, clearErrors }}
 *
 * @example
 * const [create, { error: createErr }] = useMutation(CREATE);
 * const [update, { error: updateErr }] = useMutation(UPDATE);
 * const { hasFieldError, getFieldError, clearErrors } = useFormErrors(createErr, updateErr);
 */
export function useFormErrors(...errors) {
	const [fieldErrors, setFieldErrors] = useState({});

	useEffect(() => {
		const activeError = errors.find((e) => e != null);
		if (activeError) {
			setFieldErrors(parseGraphQLFieldErrors(activeError));
		} else {
			setFieldErrors({});
		}
	}, errors); // eslint-disable-line react-hooks/exhaustive-deps

	const hasFieldError = useCallback((fieldName) => Boolean(fieldErrors[fieldName]), [fieldErrors]);
	const getFieldError = useCallback((fieldName) => fieldErrors[fieldName] || null, [fieldErrors]);

	return {
		fieldErrors,
		hasFieldError,
		getFieldError,
		generalError: fieldErrors.general || null,
		clearErrors: () => setFieldErrors({}),
	};
}
