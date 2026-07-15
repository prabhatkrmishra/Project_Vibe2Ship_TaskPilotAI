import React from 'react';

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, {
    hasError: boolean,
    error?: Error
}> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = {hasError: false};
    }

    static getDerivedStateFromError(error: Error) {
        return {hasError: true, error};
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 p-4">
                    <div className="bg-slate-900 border border-red-500/20 p-8 rounded-3xl max-w-md w-full text-center">
                        <h2 className="text-xl font-bold text-red-400 mb-4">Something went wrong</h2>
                        <p className="text-slate-400 text-sm mb-6">{this.state.error?.message || "An unexpected error occurred in the application."}</p>
                        <button onClick={() => window.location.reload()}
                                className="bg-white text-slate-900 px-4 py-2 rounded-xl text-sm font-bold uppercase">
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}
