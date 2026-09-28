import { describe, expect, it } from 'vitest';
import { CombinedGraphQLErrors, ServerError } from '@apollo/client/errors';
import {
  getFieldError,
  getGeneralErrorMessage,
  hasFieldError,
  parseGraphQLFieldErrors,
} from '../graphqlErrorParser';

describe('graphqlErrorParser', () => {
  it('returns a network error as a general field error', () => {
    expect(parseGraphQLFieldErrors({ networkError: new Error('offline') })).toEqual({
      general: 'Netwerkfout: Controleer je internetverbinding',
    });
  });

  // Apollo Client v4 wraps GraphQL errors in CombinedGraphQLErrors (.errors) instead
  // of the v3 .graphQLErrors array. Without this the parser dropped every field error
  // and forms fell back to a non-descriptive alert.
  it('parses Apollo v4 CombinedGraphQLErrors into field errors', () => {
    const error = new CombinedGraphQLErrors({
      errors: [
        {
          message:
            'Variable "$input" got invalid value "" at "input.explanation"; Value cannot be an empty string: ',
          extensions: { code: 'BAD_USER_INPUT' },
        },
      ],
    });

    const errors = parseGraphQLFieldErrors(error);
    expect(errors).toEqual({ explanation: 'Beschrijving mag niet leeg zijn' });
  });

  it('treats an Apollo v4 ServerError as a network error', () => {
    const error = new ServerError('Bad gateway', {
      response: { status: 502 },
      result: {},
      statusCode: 502,
    });
    expect(parseGraphQLFieldErrors(error)).toEqual({
      general: 'Netwerkfout: Controleer je internetverbinding',
    });
  });

  it('maps missing required input fields to Dutch field messages', () => {
    const errors = parseGraphQLFieldErrors({
      graphQLErrors: [
        {
          message: 'Field "title" of required type "NonEmptyString!" was not provided.',
        },
      ],
    });

    expect(errors).toEqual({ title: 'Titel is verplicht' });
    expect(hasFieldError(errors, 'title')).toBe(true);
    expect(getFieldError(errors, 'title')).toBe('Titel is verplicht');
  });

  it('falls back to the first GraphQL error as a general message', () => {
    expect(
      getGeneralErrorMessage({
        graphQLErrors: [{ message: 'Maximaal 5 positieve argumenten per thema toegestaan!' }],
      })
    ).toBe('Maximaal 5 positieve argumenten per thema toegestaan!');
  });
});
