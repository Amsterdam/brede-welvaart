import { GraphQLError } from 'graphql';
import { MongoError } from 'mongodb';

export class AuthenticationError extends GraphQLError {
  constructor(message: string = 'Not authenticated') {
    super(message, {
      extensions: {
        code: 'UNAUTHENTICATED',
        http: { status: 401 }
      }
    });
    console.error('[AuthenticationError]', message);
  }
}

export class NotFoundError extends GraphQLError {
  constructor(resource: string) {
    const message = `${resource} not found`;
    super(message, {
      extensions: {
        code: 'NOT_FOUND',
        http: { status: 404 }
      }
    });
    console.error('[NotFoundError]', message);
  }
}

export class ValidationError extends GraphQLError {
  constructor(message: string, field?: string) {
    super(message, {
      extensions: {
        code: 'BAD_USER_INPUT',
        http: { status: 400 },
        ...(field ? { field } : {})
      }
    });
    console.error('[ValidationError]', message);
  }
}

export class DatabaseError extends GraphQLError {
  constructor(error: MongoError) {
    super('Database error occurred', {
      extensions: {
        code: 'DATABASE_ERROR',
        http: { status: 500 },
        mongoCode: error.code,
        mongoMessage: error.message
      }
    });
    console.error('[DatabaseError]', {
      mongoCode: error.code,
      mongoMessage: error.message
    });
  }
}

export const handleMongoError = (error: any) => {
  console.error('[MongoError]', error);
  if (error.name === 'ValidationError') {
    // Mongoose validation error
    const messages = Object.values(error.errors)
      .map((err: any) => err.message)
      .join(', ');
    throw new ValidationError(messages);
  }

  if (error.code === 11000) {
    // Duplicate key error
    throw new ValidationError('Duplicate entry found');
  }

  if (error instanceof MongoError) {
    throw new DatabaseError(error);
  }

  // Re-throw unknown errors
  throw error;
};
