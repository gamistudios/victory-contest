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
 * Keeps one broken screen from blanking the whole mini app.
 *
 * React has no recovery path for an error thrown during render or from an
 * effect cleanup: without a boundary the root unmounts and the Telegram
 * WebApp is left white. This catches those errors, logs enough to diagnose
 * them, and offers a retry.
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
      <div className="flex min-h-[50vh] items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-center" role="alert">
          <p className="font-nunito text-base font-extrabold">This screen hit a problem</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {this.props.label ? `${this.props.label} failed to load.` : "Something went wrong."} Try again — if it keeps happening, go back and reopen it.
          </p>
          <p className="mt-3 line-clamp-2 text-xs text-muted-foreground/80">{this.state.error.message}</p>
          <div className="mt-4 flex justify-center gap-2">
            <button type="button" onClick={this.retry} className="rounded-full bg-blue-fix-600 px-4 py-2 text-sm font-bold text-white active:scale-95">
              Try again
            </button>
            <button type="button" onClick={() => window.location.reload()} className="rounded-full border border-border px-4 py-2 text-sm font-bold active:scale-95">
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
