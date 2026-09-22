import React from "react";
import { Shield } from "lucide-react";
import { useScreenshotProtection } from "../hooks/useScreenshotProtection";

const ScreenshotProtection: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  useScreenshotProtection();

  return (
    <div className="screenshot-protected">
      {children}

      {/* Protection indicator - small and unobtrusive */}
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-green-500 text-white p-2 rounded-full shadow-lg opacity-70 hover:opacity-100 transition-opacity">
          <Shield className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};

export default ScreenshotProtection;
