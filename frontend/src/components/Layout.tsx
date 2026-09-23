import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTelegram } from "../hooks/useTelegram";
import BottomNavigation from "./BottomNavigation";
import TopNavigation from "./TopNavigation";
import { Toaster } from "sonner";
import { NotificationProvider } from "../context/NotificationContext";
import PaymentAlert from "./PaymentAlert";

const Layout: React.FC = () => {
  const { webApp, enableClosingConfirmation } = useTelegram();
  const location = useLocation();
  const [hasAlert, setHasAlert] = useState(false);

  useEffect(() => {
    if (webApp) {
      // App is light-mode only; Telegram theme params are intentionally ignored.
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
      // Removed `dark:bg-gray-900` from className to prevent dark background
      className="min-h-screen flex flex-col bg-gray-50"
      // style={getThemeStyles()}
    >
      <NotificationProvider>
        <div className="fixed top-0 left-0 right-0 z-50">
          <PaymentAlert onVisibilityChange={setHasAlert} />
          <TopNavigation />
        </div>
      </NotificationProvider>

      {/* <AdTrigger /> */}

      <main
        className={`flex-1 pb-20 overflow-y-auto transition-all duration-300 ${
          hasAlert ? "pt-[7.5rem]" : "pt-16"
        }`}
      >
        <Outlet />
        <Toaster />
      </main>
      {location.pathname !== "/register" && <BottomNavigation />}
    </div>
  );
};

export default Layout;
