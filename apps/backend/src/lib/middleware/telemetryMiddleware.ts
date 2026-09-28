import { Request, Response, NextFunction } from 'express';
import { trackEvent, trackException, trackMetric } from '../telemetry';

/**
 * Middleware to track HTTP requests and responses
 */
export function requestTelemetryMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const originalSend = res.send;

  // Track request start
  trackEvent('HTTPRequest', {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent') || 'unknown',
    ip: req.ip as string,
    path: req.path,
  });

  // Override res.send to capture response
  res.send = function (body: any) {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const success = statusCode < 400;

    // Track response metrics
    trackMetric('RequestDuration', duration, {
      method: req.method,
      path: req.path,
      statusCode: statusCode.toString(),
    });

    trackEvent('HTTPResponse', {
      method: req.method,
      path: req.path,
      statusCode: statusCode.toString(),
      success: success.toString(),
      duration: duration.toString(),
    });

    // Track errors for 4xx and 5xx responses
    if (!success) {
      trackException(new Error(`HTTP ${statusCode}: ${req.method} ${req.path}`), {
        statusCode: statusCode.toString(),
        method: req.method,
        path: req.path,
        body: typeof body === 'string' ? body.substring(0, 1000) : JSON.stringify(body).substring(0, 1000),
      });
    }

    return originalSend.call(this, body);
  };

  next();
}

/**
 * Middleware to track specific API endpoints
 */
export function apiTelemetryMiddleware(endpoint: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();

    trackEvent(`${endpoint}Request`, {
      method: req.method,
      params: JSON.stringify(req.params),
      query: JSON.stringify(req.query),
    });

    const originalSend = res.send;
    res.send = function (body: any) {
      const duration = Date.now() - startTime;

      trackEvent(`${endpoint}Response`, {
        statusCode: res.statusCode.toString(),
        duration: duration.toString(),
        success: (res.statusCode < 400).toString(),
      });

      trackMetric(`${endpoint}Duration`, duration, {
        statusCode: res.statusCode.toString(),
      });

      return originalSend.call(this, body);
    };

    next();
  };
}

/**
 * Error handling middleware with telemetry
 */
export function errorTelemetryMiddleware(error: Error, req: Request, res: Response, next: NextFunction): void {
  // Track the error
  trackException(error, {
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent') || 'unknown',
    ip: req.ip as string,
    stack: error.stack || 'No stack trace available',
  });

  // Continue with standard error handling
  next(error);
}
