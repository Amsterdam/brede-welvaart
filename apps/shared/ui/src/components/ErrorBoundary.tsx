import React, { ReactNode } from 'react';
import { useApplicationInsights } from '../context/ApplicationInsightsContext';

interface ErrorBoundaryProps {
  children: ReactNode;
  trackException: (exception: Error, properties?: Record<string, any>) => void;
  componentName?: string;
  errorContext?: Record<string, any>;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(_error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: any) {
    // Log the error to ApplicationInsights
    this.setState({
      error,
      errorInfo
    });

    // Track the error with ApplicationInsights if available
    if (this.props.trackException) {
      this.props.trackException(error, {
        componentStack: errorInfo.componentStack,
        errorBoundary: true,
        component: this.props.componentName || 'Unknown',
        props: JSON.stringify(this.props.errorContext || {}),
        url: window.location.href,
        timestamp: new Date().toISOString()
      });
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  override render() {
    if (this.state.hasError) {
      // Render custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: '20px',
          margin: '20px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          backgroundColor: '#f8f8f8'
        }}>
          <h2>Er is iets misgegaan</h2>
          <p>Er is een onverwachte fout opgetreden. Probeer de pagina te verversen.</p>

          {process.env.NODE_ENV === 'development' && (
            <details style={{ whiteSpace: 'pre-wrap', marginTop: '10px' }}>
              <summary>Foutdetails (alleen zichtbaar in ontwikkelmodus)</summary>
              <div style={{
                backgroundColor: '#fff',
                padding: '10px',
                marginTop: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '12px',
                fontFamily: 'monospace'
              }}>
                <strong>Error:</strong> {this.state.error?.toString()}
                <br />
                <strong>Component Stack:</strong>
                {this.state.errorInfo?.componentStack}
              </div>
            </details>
          )}

          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Pagina verversen
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

interface ErrorBoundaryWithInsightsProps {
  children: ReactNode;
  componentName?: string;
  errorContext?: Record<string, any>;
  fallback?: ReactNode;
}

// HOC to inject ApplicationInsights tracking
export const ErrorBoundaryWithInsights: React.FC<ErrorBoundaryWithInsightsProps> = ({ children, componentName, errorContext, fallback }) => {
  const { trackException } = useApplicationInsights();

  return (
    <ErrorBoundary
      trackException={trackException}
      componentName={componentName}
      errorContext={errorContext}
      fallback={fallback}
    >
      {children}
    </ErrorBoundary>
  );
};

export default ErrorBoundaryWithInsights;
