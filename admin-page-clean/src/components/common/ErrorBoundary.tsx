import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Change this (e.g. the pathname) to retry automatically when the user navigates. */
  resetKey?: unknown;
  /** Shown in the fallback so support can tell which area broke. */
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one broken page from blanking the whole admin app.
 *
 * React has no recovery path for an error thrown during render or from an effect
 * cleanup: without a boundary the root unmounts and the operator is left with an
 * empty page mid-edit. This catches those errors, logs enough to diagnose them,
 * and offers a retry.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`ErrorBoundary[${this.props.label ?? "app"}]`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-5" role="alert">
          <p className="text-sm font-bold text-card-foreground">This page hit a problem</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {this.props.label ? `${this.props.label} failed to render.` : "Something went wrong."} Nothing was lost: retry, or reload the app.
          </p>
          <p className="mt-3 break-words text-xs text-muted-foreground/80">{this.state.error.message}</p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={this.retry} className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
              Try again
            </button>
            <button type="button" onClick={() => window.location.reload()} className="h-9 rounded-md border border-border px-3 text-sm font-medium">
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
