// src/components/common/ErrorState.tsx

import { AlertTriangle } from "lucide-react";
import { Button } from "../components/ui/button";
import ErrorIcon from "../assets/500 Internal Server Error-cuate.svg?react";
interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryText?: string;
}
// src/components/ui/ErrorIllustration.tsx

export function ErrorIllustration({ className }: { className?: string }) {
  return <ErrorIcon className={className} />;
}
export default function ErrorState({
  title = "Oops! Something went wrong.",
  description = "We couldn't load the data you were looking for. Please check your connection and try again.",
  onRetry,
  retryText = "Try Again",
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 min-h-screen">
      <div className="relative w-64 h-64 sm:w-80 sm:h-80">
        <ErrorIllustration className="w-full h-full" />
      </div>

      <div className="max-w-md mt-8">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground flex items-center justify-center gap-2">
          <AlertTriangle className="h-7 w-7 text-destructive" />
          {title}
        </h1>
        <p className="mt-4 text-base sm:text-lg text-muted-foreground">
          {description}
        </p>
      </div>

      {onRetry && (
        <Button size="lg" onClick={onRetry} className="mt-8 text-base">
          {retryText}
        </Button>
      )}
    </div>
  );
}
