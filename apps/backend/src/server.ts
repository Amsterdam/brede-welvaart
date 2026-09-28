import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express5';
import { rateLimit } from 'express-rate-limit';
import { resolvers } from './resolvers';
import { argumentTypeDefs } from './graphql/argument.graphql';
import { projectTypeDefs } from './graphql/project.graphql';
import { themeTypeDefs } from './graphql/theme.graphql';
import { userTypeDefs } from './graphql/user.graphql';
import { commentTypeDefs } from './graphql/comment.graphql';
import { scalars } from './graphql/scalars.graphql';
import { validationScalarTypeDefs } from './graphql/scalars.validation';
import connectDB from './lib/database';
import { createContext } from './lib/context';
import { AppContext } from '@shared/types';
import config from './config';
import cors from 'cors';
import { getPdf } from './lib/pdf';
import { initializeTelemetry, trackEvent, trackException, shutdownTelemetry } from './lib/telemetry';
import { requestTelemetryMiddleware, apiTelemetryMiddleware, errorTelemetryMiddleware } from './lib/middleware/telemetryMiddleware';
import { createGraphQLTelemetryPlugin } from './lib/graphqlTelemetryPlugin';
import {
  createProjectDocumentUploadHandler,
  projectDocumentUploadRateLimitOptions,
} from './routes/projectDocumentUploads';
import { statusHandler, statusRateLimitOptions } from './routes/status';

async function main() {
  // Initialize telemetry first
  initializeTelemetry();

  try {
    await connectDB();
    trackEvent('DatabaseConnected', { database: 'MongoDB' });
  } catch (error) {
    trackException(error as Error, { context: 'DatabaseConnection' });
    throw error;
  }

  const port = Number(config.port) || 4000;

  const app = express();
  // The pod sits behind the S-ADS App Gateway and the nginx ingress, both of
  // which append to X-Forwarded-For. Without this, express-rate-limit can't
  // identify the client and throws ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
  app.set('trust proxy', config.trustProxy);
  app.use(express.json({ limit: '10mb' }));

  // Add telemetry middleware
  app.use(requestTelemetryMiddleware);

  // Setup CORS
  const whitelist = config.corsOriginWhitelist
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin: function (
        origin: string | undefined,
        callback: (err: Error | null, allow?: boolean) => void
      ) {
        // Allow requests with no origin (like mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        if (whitelist.length === 0) return callback(null, true); // Allow all if whitelist is empty
        if (whitelist.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    })
  );

  // Health endpoint
  app.get('/health', (_req, res) => {
    res.status(200).send('OK');
  });

  app.get('/status', rateLimit(statusRateLimitOptions), statusHandler);

  // PDF endpoint with telemetry
  app.get('/pdf/:slug', apiTelemetryMiddleware('PDFGeneration'), async (req, res) => {
    await getPdf(req, res)
  });

  app.post(
    '/projects/:projectId/upload-document',
    rateLimit(projectDocumentUploadRateLimitOptions),
    apiTelemetryMiddleware('ProjectDocumentUpload'),
    createProjectDocumentUploadHandler()
  );

  const server = new ApolloServer<AppContext>({
    typeDefs: [scalars, validationScalarTypeDefs, argumentTypeDefs, projectTypeDefs, themeTypeDefs, userTypeDefs, commentTypeDefs],
    resolvers,
    introspection: process.env.NODE_ENV !== 'production',
    plugins: [createGraphQLTelemetryPlugin()],
  });

  await server.start();

  app.use(
    '/graphql',
    express.json({ limit: '10mb' }),
    expressMiddleware(server, {
      context: async ({ req }) => createContext({ req }),
    })
  );

  // Add error handling middleware last
  app.use(errorTelemetryMiddleware);

  app.listen(port, () => {
    console.info(`🐈 BW: Server ready at: http://localhost:${port}`);
    trackEvent('ServerStarted', {
      port: port.toString(),
      environment: config.nodeEnv,
      graphqlPath: config.graphql.path
    });
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    trackEvent('ServerShutdown', { reason: 'SIGTERM' });
    shutdownTelemetry();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    trackEvent('ServerShutdown', { reason: 'SIGINT' });
    shutdownTelemetry();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    trackException(error, { context: 'UncaughtException' });
    shutdownTelemetry();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    trackException(new Error(`Unhandled Rejection: ${reason}`), { context: 'UnhandledRejection' });
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  trackException(error, { context: 'ServerStartup' });
  shutdownTelemetry();
  process.exit(1);
});
