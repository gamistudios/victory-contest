// src/components/ErrorState.tsx
// The single, app-wide error UI. Use variant="page" for full-screen errors
// (auth failures, route-level errors) and variant="inline" for section- or
// list-level error banners inside a page.

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import ErrorIcon from "../assets/500 Internal Server Error-cuate.svg?react";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryText?: string;
  /** "page": centered full-screen layout with illustration. "inline": compact banner. */
  variant?: "page" | "inline";
  className?: string;
}

export function ErrorIllustration({ className }: { className?: string }) {
  return <ErrorIcon className={className} aria-hidden="true" />;
}

const DEFAULT_PAGE_TITLE = "Oops! Something went wrong.";
const DEFAULT_DESCRIPTION =
  "We couldn't load the data you were looking for. Please check your connection and try again.";

export default function ErrorState({
  title,
  description,
  onRetry,
  retryText = "Try Again",
  variant = "page",
  className,
}: ErrorStateProps) {
  if (variant === "inline") {
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 shadow-sm",
          className
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          <AlertTriangle
            className="h-5 w-5 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <div className="min-w-0">
            {title && (
              <p className="text-sm font-semibold text-foreground">{title}</p>
            )}
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {onRetry && (
          <Button
            size="sm"
            onClick={onRetry}
            className="bg-violet-fix-500 text-white shadow-sm hover:bg-violet-fix-600"
          >
            <RefreshCw aria-hidden="true" />
            {retryText}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "flex min-h-screen flex-col items-center justify-center p-8 text-center",
        className
      )}
    >
      <div className="relative h-64 w-64 sm:h-80 sm:w-80">
        <ErrorIllustration className="h-full w-full" />
      </div>

      <div className="mt-8 max-w-md">
        <h1 className="flex items-center justify-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden="true" />
          {title ?? DEFAULT_PAGE_TITLE}
        </h1>
        <p className="mt-4 text-base text-muted-foreground sm:text-lg">
          {description ?? DEFAULT_DESCRIPTION}
        </p>
      </div>

      {onRetry && (
        <Button
          size="lg"
          onClick={onRetry}
          className="mt-8 bg-violet-fix-500 text-base text-white hover:bg-violet-fix-600"
        >
          <RefreshCw aria-hidden="true" />
          {retryText}
        </Button>
      )}
    </div>
  );
}
