import { useEffect, useMemo, useState } from "react";
import {
  TelegramWebApp,
  TelegramUser,
  InlineQueryResultArticle,
} from "../types";
import { getPreparedMessageIdTelegram } from "../services/telegramServices";

export const useTelegram = () => {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const app = window.Telegram?.WebApp;

    if (app) {
      app.ready();
      app.setHeaderColor("#8b5cf6");
      app.setBackgroundColor("#ffffff");
      setWebApp(app);
      setUser(app.initDataUnsafe?.user || null);
    }
    setIsLoading(false);
  }, []);

  const sendData = (data: unknown) => {
    if (webApp) {
      webApp.sendData(JSON.stringify(data));
    }
  };

  const downloadFile = (fileUrl: string, fileName?: string) => {
    if (!webApp?.downloadFile) {
      console.warn("downloadFile is not available on this client");
      return;
    }
    webApp.downloadFile(fileUrl, fileName);
  };

  const showMainButton = (text: string, onClick: () => void) => {
    if (webApp) {
      webApp.MainButton.setText(text);
      webApp.MainButton.onClick(onClick);
      webApp.MainButton.show();
    }
  };

  const hideMainButton = () => {
    if (webApp) {
      webApp.MainButton.hide();
    }
  };

  const showBackButton = (onClick: () => void) => {
    if (webApp) {
      webApp.BackButton.onClick(onClick);
      webApp.BackButton.show();
    }
  };

  const hideBackButton = () => {
    if (webApp) {
      webApp.BackButton.hide();
    }
  };

  const hapticFeedback = (
    type: "impact" | "notification" | "selection",
    style?: string
  ) => {
    if (webApp) {
      switch (type) {
        case "impact":
          webApp.HapticFeedback.impactOccurred(
            (style as "light" | "medium" | "heavy" | "rigid" | "soft") ||
              "medium"
          );
          break;
        case "notification":
          webApp.HapticFeedback.notificationOccurred(
            (style as "error" | "success" | "warning") || "success"
          );
          break;
        case "selection":
          webApp.HapticFeedback.selectionChanged();
          break;
      }
    }
  };

  const close = () => {
    if (webApp) {
      webApp.close();
    }
  };

  const setHeaderColor = (color: string) => {
    if (webApp) {
      webApp.setHeaderColor(color);
    }
  };

  const setBackgroundColor = (color: string) => {
    if (webApp) {
      webApp.setBackgroundColor(color);
    }
  };

  const showPopup = (
    title: string,
    message: string,
    buttons?: Array<{ id: string; type?: string; text: string }>
  ) => {
    if (webApp) {
      webApp.showPopup(
        {
          title,
          message,
          buttons: buttons || [{ id: "ok", type: "ok", text: "OK" }],
        },
        () => {}
      );
    }
  };

  const showAlert = (message: string) => {
    if (webApp) {
      webApp.showAlert(message);
    }
  };

  const showConfirm = (
    message: string,
    callback: (confirmed: boolean) => void
  ) => {
    if (webApp) {
      webApp.showConfirm(message, callback);
    }
  };

  const openLink = (url: string) => {
    if (webApp) {
      webApp.openLink(url);
    }
  };
  const openInvoice = (url: string, callback?: (status: string) => void) => {
    if (webApp && webApp.openInvoice) {
      webApp.openInvoice(url, (status: string) => {

        if (callback) callback(status);
      });
    } else {
      console.warn("openInvoice is not available on this client");
    }
  };

  const openTelegramLink = (url: string) => {
    if (webApp) {
      webApp.openTelegramLink(url);
    }
  };

  const requestWriteAccess = () => {
    if (webApp) {
      webApp.requestWriteAccess(() => {});
    }
  };

  const requestContact = () => {
    if (webApp) {
      webApp.requestContact(() => {});
    }
  };

  const enableClosingConfirmation = () => {
    if (webApp) {
      webApp.enableClosingConfirmation();
    }
  };

  const disableClosingConfirmation = () => {
    if (webApp) {
      webApp.disableClosingConfirmation();
    }
  };

  const switchInlineQuery = (query: string, chatTypes?: string[]) => {
    if (webApp) {
      webApp.switchInlineQuery(query, chatTypes);
    }
  };

  const readTextFromClipboard = () => {
    if (webApp) {
      return webApp.readTextFromClipboard();
    }
    return null;
  };
  const PrepareAndShareMessageShare = async (
    data: InlineQueryResultArticle
  ) => {
    if (!user?.id) return;
    const payload = {
      user_id: user.id,
      result: data,
    };
    const res = await getPreparedMessageIdTelegram(payload);
    const chatId = res?.result?.id;
    if (chatId) {
      if (webApp) {
        return webApp.shareMessage(chatId, () => {});
      }
    }
    return;
  };
  const setCloudData = (
    key: string,
    value: unknown,
    callback?: (success: boolean) => void
  ) => {
    if (webApp?.CloudStorage) {
      webApp.CloudStorage.setItem(
        key,
        JSON.stringify(value),
        (error, result) => {
          if (callback) {
            callback(!error && result === true);
          }
        }
      );
    } else {
      // Fallback to localStorage
      try {
        localStorage.setItem(`telegram_cloud_${key}`, JSON.stringify(value));
        if (callback) callback(true);
      } catch {
        if (callback) callback(false);
      }
    }
  };

  const getCloudData = <T,>(
    key: string,
    callback: (data: T | null) => void
  ) => {
    if (webApp?.CloudStorage) {
      webApp.CloudStorage.getItem(key, (error, result) => {
        if (!error && result) {
          try {
            callback(JSON.parse(result) as T);
          } catch {
            callback(null);
          }
        } else {
          callback(null);
        }
      });
    } else {
      // Fallback to localStorage
      try {
        const data = localStorage.getItem(`telegram_cloud_${key}`);
        callback(data ? (JSON.parse(data) as T) : null);
      } catch {
        callback(null);
      }
    }
  };

  const removeCloudData = (
    key: string,
    callback?: (success: boolean) => void
  ) => {
    if (webApp?.CloudStorage) {
      webApp.CloudStorage.removeItem(key, (error, result) => {
        if (callback) {
          callback(!error && result === true);
        }
      });
    } else {
      // Fallback to localStorage
      try {
        localStorage.removeItem(`telegram_cloud_${key}`);
        if (callback) callback(true);
      } catch {
        if (callback) callback(false);
      }
    }
  };

  const getCloudKeys = (callback: (keys: string[]) => void) => {
    if (webApp?.CloudStorage) {
      webApp.CloudStorage.getKeys((error, result) => {
        callback(!error && result ? result : []);
      });
    } else {
      // Fallback to localStorage
      const keys = Object.keys(localStorage)
        .filter((key) => key.startsWith("telegram_cloud_"))
        .map((key) => key.replace("telegram_cloud_", ""));
      callback(keys);
    }
  };

  // Stable identity: the wrappers only close over webApp/user, which are set
  // once. Without this, every consumer effect listing these in deps re-runs
  // on each render.
  return useMemo(
    () => ({
      webApp,
      user,
      isLoading,
      sendData,
      showMainButton,
      hideMainButton,
      showBackButton,
      hideBackButton,
      hapticFeedback,
      close,
      setHeaderColor,
      setBackgroundColor,
      showPopup,
      showAlert,
      showConfirm,
      openLink,
      openInvoice,
      openTelegramLink,
      requestWriteAccess,
      requestContact,
      enableClosingConfirmation,
      disableClosingConfirmation,
      switchInlineQuery,
      readTextFromClipboard,
      downloadFile,
      PrepareAndShareMessageShare,
      removeCloudData,
      setCloudData,
      getCloudData,
      getCloudKeys,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [webApp, user, isLoading]
  );
};
