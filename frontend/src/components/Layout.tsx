import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTelegram } from "../hooks/useTelegram";
import BottomNavigation from "./BottomNavigation";
import TopNavigation from "./TopNavigation";
import { Toaster } from "sonner";
import { NotificationProvider } from "../context/NotificationContext";
import { AuthProvider } from "../context/AuthContext";
import PaymentAlert from "./PaymentAlert";

const Layout: React.FC = () => {
  const { webApp, enableClosingConfirmation } = useTelegram();
  const location = useLocation();
  const [hasAlert, setHasAlert] = useState(false);

  useEffect(() => {
    if (webApp) {
      // const theme = webApp.themeParams;
      // --- Dark Mode Logic Commented Out ---
      // const isDark = isDarkColor(theme.bg_color || "#ffffff");

      // Force light mode
      // document.documentElement.setAttribute("data-mode", "light");
      // document.documentElement.setAttribute("data-theme", "light");
      // // --- End of Dark Mode Logic ---

      // // --- Force Light Background Colors ---
      // // This ignores the user's Telegram theme and sets a white/light-gray background.
      // document.documentElement.style.setProperty(
      //   "--tg-theme-bg-color",
      //   "#ffffff" // Overrides theme.bg_color
      // );
      // document.documentElement.style.setProperty(
      //   "--tg-theme-secondary-bg-color",
      //   "#f5f5f5" // Overrides theme.secondary_bg_color
      // );
      // --- End of Forced Light Background ---

      // document.documentElement.style.setProperty(
      //   "--tg-theme-text-color",
      //   "#000000"
      // );
      // document.documentElement.style.setProperty(
      //   "--tg-theme-hint-color",
      //   "#999999"
      // );
      // document.documentElement.style.setProperty(
      //   "--tg-theme-link-color",
      //   "#2481cc"
      // );
      // document.documentElement.style.setProperty(
      //   "--tg-theme-button-color",
      //   "#2481cc"
      // );
      // document.documentElement.style.setProperty(
      //   "--tg-theme-button-text-color",
      //    "#ffffff"
      // );
      enableClosingConfirmation();
    }
  }, [webApp]);

  // --- isDarkColor function commented out as it's no longer needed ---
  // const isDarkColor = (color: string): boolean => {
  //   const hex = color.replace("#", "");
  //   const r = parseInt(hex.slice(0, 2), 16);
  //   const g = parseInt(hex.slice(2, 4), 16);
  //   const b = parseInt(hex.slice(4, 6), 16);
  //   const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  //   return brightness < 128;
  // };
  // ---

  // const getThemeStyles = () => {
  //   if (!webApp) return {};

  //   const theme = webApp.themeParams;
  //   return {
  //     backgroundColor: theme.bg_color || "#ffffff",
  //     color: theme.text_color || "#000000",
  //     "--primary-color": theme.button_color || "#0088cc",
  //     "--secondary-color": theme.secondary_bg_color || "#f5f5f5",
  //     "--text-color": theme.text_color || "#000000",
  //     "--hint-color": theme.hint_color || "#999999",
  //     "--link-color": theme.link_color || "#0088cc",
  //   } as React.CSSProperties;
  // };

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
      <AuthProvider>
        <NotificationProvider>
          <div className="fixed top-0 left-0 right-0 z-50">
            <PaymentAlert onVisibilityChange={setHasAlert} />
            <TopNavigation />
          </div>
        </NotificationProvider>

        {/* <AdTrigger /> */}

        <main
          className={`flex-1 pb-20 overflow-y-auto transition-all duration-300 ${
            hasAlert ? "pt-30" : "pt-16"
          }`}
        >
          <Outlet />
          <Toaster />
        </main>
        {location.pathname !== "/register" && <BottomNavigation />}
      </AuthProvider>
    </div>
  );
};

export default Layout;
