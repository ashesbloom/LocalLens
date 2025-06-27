import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text)' }}>
                    <h1>Something went wrong.</h1>
                    <p>An unexpected error occurred. Please reload the application.</p>
                    <details style={{ whiteSpace: 'pre-wrap', color: 'var(--color-text-muted)', textAlign: 'left', background: 'var(--color-bg-light)', padding: '1rem', borderRadius: '0.5rem', marginTop: '1rem' }}>
                        {this.state.error && this.state.error.toString()}
                    </details>
                    <button onClick={() => window.location.reload()} className="btn btn-primary" style={{marginTop: '1rem'}}>Reload</button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;