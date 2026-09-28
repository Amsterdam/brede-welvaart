import * as appInsights from 'applicationinsights';
import config from '../config';

let isInitialized = false;
let telemetryClient: appInsights.TelemetryClient | null = null;

/**
 * Initialize Application Insights for backend monitoring
 */
export function initializeTelemetry(): void {
  if (isInitialized) {
    console.warn('Application Insights already initialized');
    return;
  }

  if (!config.applicationInsights.enabled || !config.applicationInsights.connectionString) {
    console.warn('Application Insights: Disabled - no connection string provided or explicitly disabled');
    return;
  }

  try {
    // Configure Application Insights
    appInsights
      .setup(config.applicationInsights.connectionString)
      .setDistributedTracingMode(appInsights.DistributedTracingModes.AI_AND_W3C)
      .setSendLiveMetrics(true)
      .setAutoCollectRequests(true)
      .setAutoCollectPerformance(true, true)
      .setAutoCollectExceptions(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectConsole(true, false)
      .setUseDiskRetryCaching(true)
      .setAutoCollectPreAggregatedMetrics(true)
      .setSendLiveMetrics(false);

    // Configure sampling
    appInsights.defaultClient.config.samplingPercentage = config.applicationInsights.samplingPercentage;

    // Add custom properties to all telemetry
    appInsights.defaultClient.addTelemetryProcessor((envelope) => {
      if (envelope.tags) {
        envelope.tags['ai.cloud.role'] = config.applicationInsights.cloudRole;
        envelope.tags['ai.cloud.roleInstance'] = process.env.HOSTNAME || 'backend-instance';
        envelope.tags['ai.application.ver'] = process.env.APP_VERSION || '1.0.0';
      }

      // Add environment and Node.js info
      if (envelope.data && envelope.data.baseData && envelope.data.baseData.properties) {
        envelope.data.baseData.properties.environment = config.nodeEnv;
        envelope.data.baseData.properties.nodeVersion = process.version;
        envelope.data.baseData.properties.platform = process.platform;
      }

      return true;
    });

    // Start Application Insights
    appInsights.start();

    telemetryClient = appInsights.defaultClient;
    isInitialized = true;

    console.log('Application Insights: Backend monitoring initialized successfully');

    // Track startup event
    trackEvent('ServerStartup', {
      environment: config.nodeEnv,
      nodeVersion: process.version,
      port: config.port.toString(),
    });

  } catch (error) {
    console.error('Application Insights: Failed to initialize backend monitoring', error);
  }
}

/**
 * Get the telemetry client instance
 */
export function getTelemetryClient(): appInsights.TelemetryClient | null {
  return telemetryClient;
}

/**
 * Track custom events
 */
export function trackEvent(name: string, properties?: { [key: string]: string }, measurements?: { [key: string]: number }): void {
  if (telemetryClient) {
    telemetryClient.trackEvent({
      name,
      properties: {
        ...properties,
        timestamp: new Date().toISOString(),
        source: 'backend',
      },
      measurements,
    });
  } else if (config.nodeEnv === 'development' && config.applicationInsights.debugTelemetry) {
    console.log('AppInsights trackEvent:', { name, properties, measurements });
  }
}

/**
 * Track exceptions and errors
 */
export function trackException(exception: Error, properties?: { [key: string]: string }): void {
  if (telemetryClient) {
    telemetryClient.trackException({
      exception,
      properties: {
        ...properties,
        timestamp: new Date().toISOString(),
        source: 'backend',
      },
    });
  } else if (config.nodeEnv === 'development' && config.applicationInsights.debugTelemetry) {
    console.error('AppInsights trackException:', { exception: exception.message, stack: exception.stack, properties });
  }
}

/**
 * Track custom metrics
 */
export function trackMetric(name: string, value: number, properties?: { [key: string]: string }): void {
  if (telemetryClient) {
    telemetryClient.trackMetric({
      name,
      value,
      properties: {
        ...properties,
        timestamp: new Date().toISOString(),
        source: 'backend',
      },
    });
  } else if (config.nodeEnv === 'development' && config.applicationInsights.debugTelemetry) {
    console.log('AppInsights trackMetric:', { name, value, properties });
  }
}

/**
 * Track dependencies (database calls, external API calls, etc.)
 */
export function trackDependency(
  dependencyTypeName: string,
  name: string,
  data: string,
  duration: number,
  success: boolean,
  resultCode?: number,
  properties?: { [key: string]: string }
): void {
  if (telemetryClient) {
    telemetryClient.trackDependency({
      dependencyTypeName,
      name,
      data,
      duration,
      success,
      resultCode,
      properties: {
        ...properties,
        timestamp: new Date().toISOString(),
        source: 'backend',
      },
    });
  } else if (config.nodeEnv === 'development' && config.applicationInsights.debugTelemetry) {
    console.log('AppInsights trackDependency:', {
      dependencyTypeName,
      name,
      data,
      duration,
      success,
      resultCode,
      properties
    });
  }
}

/**
 * Track GraphQL operations specifically
 */
export function trackGraphQLOperation(
  operationName: string,
  operationType: 'query' | 'mutation' | 'subscription',
  duration: number,
  success: boolean,
  errorMessage?: string,
  userId?: string
): void {
  const properties: { [key: string]: string } = {
    operationType,
    operationName,
    source: 'graphql',
  };

  if (userId) {
    properties.userId = userId;
  }

  if (errorMessage) {
    properties.errorMessage = errorMessage;
  }

  trackEvent('GraphQLOperation', properties, {
    duration,
    success: success ? 1 : 0,
  });

  // Also track as dependency for better visibility in Application Map
  trackDependency(
    'GraphQL',
    operationName,
    `${operationType}: ${operationName}`,
    duration,
    success,
    success ? 200 : 500,
    properties
  );
}
/**
 * Shutdown telemetry gracefully
 */
export function shutdownTelemetry(): void {
  if (telemetryClient) {
    telemetryClient.flush();
    console.log('Application Insights: Telemetry shutdown complete');
  }
}
