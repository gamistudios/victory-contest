import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTelegram } from "../hooks/useTelegram";
import BottomNavigation from "./BottomNavigation";
import TopNavigation from "./TopNavigation";
import { Toaster } from "sonner";
import { NotificationProvider } from "../context/NotificationContext";
import PaymentAlert from "./PaymentAlert";
import { useTheme } from "../context/ThemeContext";

const Layout: React.FC = () => {
  const { webApp, enableClosingConfirmation } = useTelegram();
  const location = useLocation();
  const { resolvedTheme } = useTheme();
  const [hasAlert, setHasAlert] = useState(false);

  useEffect(() => {
    if (webApp) {
      // Theme (light/dark) is owned by ThemeProvider; it also syncs Telegram chrome colours.
      enableClosingConfirmation();
    }
  }, [webApp, enableClosingConfirmation]);

  if (webApp && webApp.platform === "unknown") {
    return (
      <div className="p-4 text-center">Please open this link in Telegram.</div>
    );
  }
  return (
    <div
      // Removed `` from className to prevent dark background
      className="min-h-screen flex flex-col bg-gray-50"
      // style={getThemeStyles()}
    >
      <NotificationProvider>
        <div className="fixed top-0 left-0 right-0 z-50">
          <PaymentAlert onVisibilityChange={setHasAlert} />
          <TopNavigation />
        </div>
      </NotificationProvider>

      <main
        className={`flex-1 pb-20 overflow-y-auto transition-all duration-300 ${
          hasAlert ? "pt-[7.5rem]" : "pt-16"
        }`}
      >
        <Outlet />
        <Toaster
          theme={resolvedTheme}
          toastOptions={{
            classNames: {
              toast: "!bg-card !text-card-foreground !border-border",
              description: "!text-muted-foreground",
            },
          }}
        />
      </main>
      {location.pathname !== "/register" && <BottomNavigation />}
    </div>
  );
};

export default Layout;
