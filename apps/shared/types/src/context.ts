import { BaseContext } from '@apollo/server';

export interface ServiceTokenPayload {
  projectId: string;
  userId: string;
  requestId: string;
  purpose: 'pdf-generation';
  iat: number;
  exp: number;
}

export interface AppContext extends BaseContext {
  user: any | null;  // Using 'any' since we don't have access to IUser type here
  isAuthenticated: boolean;
  serviceToken?: ServiceTokenPayload;
}
