import gql from 'graphql-tag';
import { GraphQLScalarType, Kind } from 'graphql';

export const scalars = gql`
  scalar DateTime
  scalar JSON
`;

export const dateTimeResolver = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime scalar type',

  serialize(value) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return null;
  },

  parseValue(value) {
    if (typeof value === 'string') {
      return new Date(value);
    }
    return null;
  },

  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

export const jsonResolver = new GraphQLScalarType({
  name: 'JSON',
  description: 'JSON scalar type',

  serialize(value) {
    return value;
  },

  parseValue(value) {
    return value;
  },

  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      try {
        return JSON.parse(ast.value);
      } catch {
        return ast.value;
      }
    }
    if (ast.kind === Kind.OBJECT) {
      return ast;
    }
    return null;
  },
});
