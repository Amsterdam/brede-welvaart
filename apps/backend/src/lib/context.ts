import { IncomingMessage } from 'http';
import { Request } from 'express';
import { verifyToken, getUserForApi } from '../lib/auth';
import { AuthenticationError } from './errors';
import { AppContext, ServiceTokenPayload } from '@shared/types';
import { verifyServiceToken, isServiceToken } from './serviceToken';

interface ContextParams {
  req: IncomingMessage | Request;
}

export const createContext = async ({
  req,
}: ContextParams): Promise<AppContext> => {
  try {
    // Allow unauthenticated introspection queries for development
    // Apollo/Express makes the parsed body available as req.body
    const opName = (req as any).body?.operationName;
    const query = (req as any).body?.query;

    const isIntrospection =
      opName === 'IntrospectionQuery' ||
      (typeof query === 'string' && (query.includes('__schema')));

    if (isIntrospection) {
      return {
        user: null,
        isAuthenticated: false,
      };
    }

    // Get token from the Authorization header
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    // Check if this is a service token for PDF generation
    if (token && isServiceToken(token)) {
      try {
        const serviceTokenPayload = verifyServiceToken(token);
        return {
          user: {
            _id: serviceTokenPayload.userId,
            email: 'pdf-service@system',
            name: 'PDF Service',
          },
          isAuthenticated: true,
          serviceToken: serviceTokenPayload,
        };
      } catch (error) {
        console.error('Service token verification failed:', error);
        throw new AuthenticationError('Invalid service token');
      }
    }

    // Regular user authentication
    const user = await getUserForApi(req.headers);

    return {
      user,
      isAuthenticated: !!user,
    };
  } catch (error) {
    console.error('Context creation error:', error);
    throw new AuthenticationError('Invalid or expired token');
  }
};
