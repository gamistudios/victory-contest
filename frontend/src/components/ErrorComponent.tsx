import { AlertCircle, RefreshCw } from "lucide-react";

interface ErrorProps {
  message?: string;
  onRetry?: () => void;
}

const ErrorMessage: React.FC<ErrorProps> = ({ message, onRetry }) => {
  return (
    <div className="flex items-center justify-between p-4 rounded-2xl border border-red-300 bg-red-50 text-red-700 shadow-sm">
      <div className="flex items-center gap-3">
        <AlertCircle className="w-5 h-5 text-red-600" />
        <span className="text-sm font-medium">
          {message || "Something went wrong. Please try again."}
        </span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      )}
    </div>
  );
};

export default ErrorMessage;
