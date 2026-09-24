import api, { setStudentToken } from "./api";

export async function getPreparedMessageIdTelegram(data: {
  user_id: number;
  result: unknown;
}) {
  const res = await api.post("/telegram/prepared-inline-message", {
    user_id: data.user_id,
    result: data.result,
  });
  return res.data;
}

export async function createInvoice(): Promise<string> {
  const res = await api.post("/telegram/invoice-link");
  return res.data.result as string;
}

type TelegramAuthResponse = { token: string; user_id: string };

/**
 * Exchange the Telegram WebApp initData for a student session token (S2).
 * The backend HMAC-verifies initData against the bot token; from here on the
 * axios interceptor attaches the resulting JWT to every request, so student
 * mutations (register / payment / submission) run as a verified identity.
 */
export async function exchangeTelegramInitData(): Promise<void> {
  const webApp = window.Telegram?.WebApp;
  const initData = webApp?.initData ?? "";

  if (!initData) {
    // Local dev: main.tsx installs a mock WebApp whose initData is empty, so
    // there is nothing to verify. Use the dev exchange endpoint, which the
    // backend only exposes when started with ALLOW_DEV_AUTH=true.
    if (!import.meta.env.DEV || import.meta.env.VITE_MOCK_TELEGRAM === "false") {
      return;
    }
    const userId = webApp?.initDataUnsafe?.user?.id;
    if (userId == null) return;
    const res = await api.post<TelegramAuthResponse>("/telegram/auth/dev", {
      user_id: userId.toString(),
    });
    setStudentToken(res.data.token);
    return;
  }

  const res = await api.post<TelegramAuthResponse>("/telegram/auth", {
    initData,
  });
  setStudentToken(res.data.token);
}
