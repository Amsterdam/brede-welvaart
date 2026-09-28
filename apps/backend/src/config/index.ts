import dotenv from 'dotenv';

dotenv.config({ quiet: true });
dotenv.config({ path: '.env.local', override: true, quiet: true });

// Express `trust proxy`. Behind S-ADS (App Gateway) + nginx ingress the client
// IP arrives via X-Forwarded-For, so trust the exact number of proxy hops to
// read the real client IP — a fixed count (not `true`) so clients can't spoof
// XFF to dodge the upload rate limiter.
const parseTrustProxy = (raw: string | undefined): boolean | number | string => {
  if (raw === undefined || raw === '') return 2;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const numeric = Number(raw);
  return Number.isInteger(numeric) ? numeric : raw;
};

export default {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  database: {
    url: process.env.MONGODB_URI || '',
    cosmosConnectionStringUrl: process.env.AZURE_COSMOS_LISTCONNECTIONSTRINGURL || '',
    name: process.env.COSMOS_DATABASE_NAME || 'ct-bw-o-db',
  },
  graphql: {
    path: '/graphql',
    debug: process.env.NODE_ENV !== 'production',
  },
  corsOriginWhitelist: process.env.CORS_ORIGIN_WHITELIST || '',
  applicationInsights: {
    connectionString: process.env.APPINSIGHTS_CONNECTION_STRING,
    enabled: process.env.APPINSIGHTS_ENABLED !== 'false',
    cloudRole: 'backend',
    samplingPercentage: process.env.NODE_ENV === 'production' ? 50 : 100,
    debugTelemetry: process.env.APPINSIGHTS_DEBUG === 'true' || false,
  },
  // Authentication (MSAL)
  msal: {
    clientId: process.env.MSAL_CLIENT_ID || '',
    authority: process.env.MSAL_AUTHORITY || '',
    clientSecret: process.env.MSAL_CLIENT_SECRET || '',
  },
  // PDF Generation
  pdf: {
    browserExecutablePath: process.env.BROWSER_EXECUTABLE_PATH || '/usr/bin/chromium',
    frontendUrl: process.env.FRONTEND_URL || 'http://pdf-frontend:5174/',
    serviceSecret: process.env.PDF_SERVICE_SECRET || 'pdf-service-secret-key',
  },
  aiService: {
    baseUrl: process.env.AI_SERVICE_URL || 'http://ai-service:8000',
    timeoutMs: Number(process.env.AI_SERVICE_TIMEOUT_MS || 60000),
  },
  storage: {
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING || '',
    accountUrl: process.env.AZURE_STORAGE_ACCOUNT_BLOB_ENDPOINT
      || process.env.AZURE_STORAGE_ACCOUNT_URL
      || '',
    containerName: process.env.AZURE_STORAGE_CONTAINER_NAME || 'data',
  },
};
