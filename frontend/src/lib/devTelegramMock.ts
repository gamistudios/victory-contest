import { TelegramWebApp } from "../types";

// Minimal fake of window.Telegram.WebApp so the app can be exercised in a
// plain browser during local development. Never installed in production builds.
export function installDevTelegramMock(): void {
  // telegram-web-app.js is loaded in index.html and defines an empty WebApp
  // outside Telegram, so check for a real user rather than object existence.
  if (window.Telegram?.WebApp?.initDataUnsafe?.user) return;

  const noop = () => {};
  const webApp = {
    initData: "",
    initDataUnsafe: {
      user: { id: 999001, first_name: "Dev", username: "devuser" },
    },
    version: "2.0",
    platform: "web",
    colorScheme: "light",
    themeParams: {},
    isExpanded: false,
    viewportHeight: 800,
    viewportStableHeight: 800,
    headerColor: "#8b5cf6",
    backgroundColor: "#ffffff",
    isClosingConfirmationEnabled: false,
    MainButton: {
      text: "",
      color: "",
      textColor: "",
      isVisible: false,
      isActive: true,
      isProgressVisible: false,
      setText: noop,
      onClick: noop,
      show: noop,
      hide: noop,
      enable: noop,
      disable: noop,
      showProgress: noop,
      hideProgress: noop,
      setParams: noop,
    },
    BackButton: {
      isVisible: false,
      onClick: noop,
      show: noop,
      hide: noop,
    },
    HapticFeedback: {
      impactOccurred: noop,
      notificationOccurred: noop,
      selectionChanged: noop,
    },
    ready: noop,
    close: noop,
    expand: noop,
    sendData: noop,
    openLink: noop,
    openTelegramLink: noop,
    openInvoice: () => {},
    setHeaderColor: noop,
    setBackgroundColor: noop,
    showPopup: noop,
    showAlert: noop,
    showConfirm: noop,
    requestWriteAccess: noop,
    requestContact: noop,
    enableClosingConfirmation: noop,
    disableClosingConfirmation: noop,
    switchInlineQuery: noop,
    readTextFromClipboard: () => null,
    shareMessage: async () => {},
  } as unknown as TelegramWebApp;

  window.Telegram = { WebApp: webApp };
}
