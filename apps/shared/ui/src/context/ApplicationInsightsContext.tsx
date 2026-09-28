import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { ApplicationInsights } from '@microsoft/applicationinsights-web';
import { ReactPlugin } from '@microsoft/applicationinsights-react-js';

interface ApplicationInsightsContextType {
  appInsights: ApplicationInsights | null;
  isInitialized: boolean;
  trackEvent: (name: string, properties?: Record<string, any>, measurements?: Record<string, number>) => void;
  trackPageView: (name?: string, url?: string, properties?: Record<string, any>) => void;
  trackException: (exception: Error, properties?: Record<string, any>) => void;
  trackMetric: (name: string, average: number, properties?: Record<string, any>) => void;
  trackDependency: (id: string, method: string, absoluteUrl: string, pathName: string, totalTime: number, success: boolean, resultCode?: number) => void;
  setUser: (userId: string, accountId?: string) => void;
  flush: () => void;
}

const ApplicationInsightsContext = createContext<ApplicationInsightsContextType | undefined>(undefined);

interface ApplicationInsightsProviderProps {
  children: ReactNode;
  connectionString?: string;
  disabled?: boolean;
}

export const ApplicationInsightsProvider: React.FC<ApplicationInsightsProviderProps> = ({
  children,
  connectionString,
  disabled = false
}) => {
  const [appInsights, setAppInsights] = useState<ApplicationInsights | null>(null);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [reactPlugin] = useState(() => new ReactPlugin());

  useEffect(() => {
    // Skip initialization if disabled or no connection string provided
    if (disabled || !connectionString) {
      console.warn('ApplicationInsights: Disabled - no connection string provided');
      setIsInitialized(false);
      return;
    }

    try {
      const isDevelopment = process.env.NODE_ENV === 'development';

      const appInsightsInstance = new ApplicationInsights({
        config: {
          connectionString: connectionString,
          extensions: [reactPlugin],
          extensionConfig: {
            [reactPlugin.identifier]: {
              debug: isDevelopment
            }
          },
          // Enhanced error and performance tracking
          disableFetchTracking: false,
          disableAjaxTracking: false,
          autoTrackPageVisitTime: true,
          enableAutoRouteTracking: true,
          enableRequestHeaderTracking: true,
          enableResponseHeaderTracking: true,
          enableCorsCorrelation: true,
          enableUnhandledPromiseRejectionTracking: true,
          disableExceptionTracking: false,

          // Enhanced client-side error monitoring
          autoExceptionInstrumented: true,

          // Performance monitoring
          enablePerfMgr: true,
          perfEvtsSendAll: false,

          // Console and debugging
          loggingLevelConsole: isDevelopment ? 2 : 0,

          // Application naming
          namePrefix: 'Brede-Welvaart-',

          // Sampling for production performance
          samplingPercentage: process.env.NODE_ENV === 'production' ? 50 : 100
        }
      });

      appInsightsInstance.loadAppInsights();

      // Add global error handlers for comprehensive error tracking
      const originalErrorHandler = window.onerror;
      window.onerror = (message, source, lineno, colno, error) => {
        appInsightsInstance.trackException({
          exception: error || new Error(message as string),
          properties: {
            source,
            lineno,
            colno,
            type: 'window.onerror'
          }
        });

        if (originalErrorHandler) {
          return originalErrorHandler(message, source, lineno, colno, error);
        }
        return false;
      };

      // Handle unhandled promise rejections
      const originalUnhandledRejectionHandler = window.onunhandledrejection;
      window.onunhandledrejection = (event: PromiseRejectionEvent) => {
        appInsightsInstance.trackException({
          exception: new Error(event.reason),
          properties: {
            type: 'unhandledPromiseRejection',
            reason: event.reason?.toString()
          }
        });

        if (originalUnhandledRejectionHandler) {
          return originalUnhandledRejectionHandler.call(window, event);
        }
      };

      // Add custom telemetry initializer for additional context
      appInsightsInstance.addTelemetryInitializer((envelope) => {
        envelope.tags = envelope.tags || {};
        envelope.tags['ai.cloud.role'] = 'frontend';
        envelope.tags['ai.cloud.roleInstance'] = window.location.hostname;
        envelope.tags['ai.application.ver'] = process.env.VITE_APP_VERSION || '1.0.0';

        // Add user agent and browser info
        envelope.tags['ai.device.type'] = 'Browser';
        envelope.tags['ai.device.browser'] = navigator.userAgent;
        envelope.tags['ai.session.id'] = sessionStorage.getItem('ai_session') || 'unknown';

        return true;
      });

      // Generate session ID for tracking
      if (!sessionStorage.getItem('ai_session')) {
        sessionStorage.setItem('ai_session', `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`);
      }

      setAppInsights(appInsightsInstance);
      setIsInitialized(true);

      console.log('ApplicationInsights: Initialized successfully for client-side monitoring');
    } catch (error) {
      console.error('ApplicationInsights: Failed to initialize', error);
      setIsInitialized(false);
    }
  }, [connectionString, disabled, reactPlugin]);

  // Enhanced tracking methods with development mode logging
  const trackEvent = (name: string, properties: Record<string, any> = {}, measurements: Record<string, number> = {}) => {
    const eventData = {
      name,
      properties: {
        ...properties,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent
      },
      measurements
    };

    if (appInsights && isInitialized) {
      appInsights.trackEvent(eventData);
    } else if (process.env.NODE_ENV === 'development') {
      // console.log('ApplicationInsights trackEvent:', eventData);
    }
  };

  const trackPageView = (name?: string, url: string = window.location.href, properties: Record<string, any> = {}) => {
    const pageViewData = {
      name: name || document.title,
      uri: url,
      properties: {
        ...properties,
        timestamp: new Date().toISOString(),
        referrer: document.referrer
      }
    };

    if (appInsights && isInitialized) {
      appInsights.trackPageView(pageViewData);
    } else if (process.env.NODE_ENV === 'development') {
      console.log('ApplicationInsights trackPageView:', pageViewData);
    }
  };

  const trackException = (exception: Error, properties: Record<string, any> = {}) => {
    const exceptionData = {
      exception: exception instanceof Error ? exception : new Error(String(exception)),
      properties: {
        ...properties,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        stack: exception?.stack
      }
    };

    if (appInsights && isInitialized) {
      appInsights.trackException(exceptionData);
    } else if (process.env.NODE_ENV === 'development') {
      console.error('ApplicationInsights trackException:', exceptionData);
    }
  };

  const trackMetric = (name: string, average: number, properties: Record<string, any> = {}) => {
    const metricData = {
      name,
      average,
      properties: {
        ...properties,
        timestamp: new Date().toISOString()
      }
    };

    if (appInsights && isInitialized) {
      appInsights.trackMetric(metricData);
    } else if (process.env.NODE_ENV === 'development') {
      console.log('ApplicationInsights trackMetric:', metricData);
    }
  };

  const trackDependency = (id: string, method: string, absoluteUrl: string, pathName: string, totalTime: number, success: boolean, resultCode: number = 200) => {
    const dependencyData = {
      id,
      method,
      absoluteUrl,
      pathName,
      totalTime,
      success,
      resultCode,
      responseCode: resultCode,
      properties: {
        timestamp: new Date().toISOString()
      }
    };

    if (appInsights && isInitialized) {
      appInsights.trackDependencyData(dependencyData);
    } else if (process.env.NODE_ENV === 'development') {
      console.log('ApplicationInsights trackDependency:', dependencyData);
    }
  };

  const setUser = (userId: string, accountId?: string) => {
    if (appInsights && isInitialized) {
      appInsights.setAuthenticatedUserContext(userId, accountId);
    } else if (process.env.NODE_ENV === 'development') {
      console.log('ApplicationInsights setUser:', { userId, accountId });
    }
  };

  const flush = () => {
    if (appInsights && isInitialized) {
      appInsights.flush();
    }
  };

  const contextValue: ApplicationInsightsContextType = {
    appInsights,
    isInitialized,
    trackEvent,
    trackPageView,
    trackException,
    trackMetric,
    trackDependency,
    setUser,
    flush
  };

  return (
    <ApplicationInsightsContext.Provider value={contextValue}>
      {children}
    </ApplicationInsightsContext.Provider>
  );
};

export const useApplicationInsights = (): ApplicationInsightsContextType => {
  const context = useContext(ApplicationInsightsContext);
  if (!context) {
    throw new Error('useApplicationInsights must be used within an ApplicationInsightsProvider');
  }
  return context;
};
