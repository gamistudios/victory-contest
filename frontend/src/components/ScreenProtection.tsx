import React from "react";
import { Shield, ShieldAlert } from "lucide-react";
import { useScreenshotProtection } from "../hooks/useScreenshotProtection";

interface ScreenshotProtectionProps {
  children: React.ReactNode;
  enabled?: boolean;
}

const ScreenshotProtection: React.FC<ScreenshotProtectionProps> = ({
  children,
  enabled = true,
}) => {
  const {
    tabSwitches,
    isCoverVisible,
    isShortcutWarningVisible,
    acknowledgeCover,
  } = useScreenshotProtection({ enabled });

  return (
    <div className="screenshot-protected">
      {children}

      {enabled && (
        <div className="fixed bottom-4 right-4 z-50">
          <div
            role="status"
            title="Screenshot protection active"
            aria-label="Screenshot protection active"
            className="bg-green-500 text-white p-2 rounded-full shadow-lg opacity-70 hover:opacity-100 transition-opacity"
          >
            <Shield className="w-4 h-4" />
          </div>
        </div>
      )}

      {isShortcutWarningVisible && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 text-white text-center px-6 backdrop-blur-xl pointer-events-none"
        >
          <div>
            <ShieldAlert className="w-12 h-12 mx-auto mb-4 text-red-400" />
            <p className="text-lg font-bold">
              Screenshots are not allowed during the contest
            </p>
            <p className="text-sm mt-2 opacity-80">
              This attempt has been recorded. Contest content is protected.
            </p>
          </div>
        </div>
      )}

      {isCoverVisible && (
        <div
          role="dialog"
          aria-modal="true"
          aria-live="assertive"
          aria-label="Stay on this page during the contest"
          onClick={acknowledgeCover}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gray-950 text-white text-center px-6"
        >
          <ShieldAlert className="w-12 h-12 mb-4 text-amber-400" />
          <p className="text-lg font-bold">
            Please stay on this page during the contest
          </p>
          <p className="text-sm mt-2 text-gray-300">
            Tab switch #{tabSwitches} was recorded.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              acknowledgeCover();
            }}
            className="mt-8 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 font-medium"
          >
            Tap to resume the contest
          </button>
        </div>
      )}
    </div>
  );
};

export default ScreenshotProtection;
