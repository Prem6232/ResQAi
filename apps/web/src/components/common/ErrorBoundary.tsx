import { Component, type ReactNode } from "react";

export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-dvh place-items-center p-6">
          <div className="max-w-md rounded-3xl bg-white p-6 shadow-card">
            <h1 className="font-display text-xl font-bold">Something went wrong</h1>
            <p className="mt-2 text-sm text-ink-700/70">{this.state.error.message}</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
