import api, { getStudentToken, setStudentToken } from "./api";

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

/**
 * Creates the Telegram Stars invoice link. The buyer's Telegram id is sent so
 * the server binds it into the invoice payload; payment confirmation then
 * arrives over the bot webhook, never from this client.
 */
export async function createInvoice(userId: string | number): Promise<string> {
  const res = await api.post("/telegram/invoice-link", {
    user_id: userId.toString(),
  });
  return res.data.result as string;
}

type TelegramAuthResponse = { token: string; user_id: string };

/**
 * The @username of the bot this deployment actually runs as, taken from the API's
 * own getMe result (GET /telegram/bot). A `t.me/<bot>` link only opens the mini
 * app when `<bot>` is the account the server's token belongs to, so guessing it
 * on the client produces a link that opens nothing.
 *
 * VITE_TELEGRAM_BOT_USERNAME survives only as a fallback for the cases where the
 * API cannot answer (bot disabled, or a dev build pointed at a stub). Resolved
 * once, then cached; a failed lookup is retried on the next call.
 */
let botUsername: string | null = null;
let botUsernameRequest: Promise<string> | null = null;

const clean = (name: unknown) =>
  String(name ?? "")
    .replace(/^@/, "")
    .trim();

export async function getBotUsername(): Promise<string | null> {
  if (botUsername) return botUsername;
  botUsernameRequest ??= api
    .get("/telegram/bot")
    .then((res) => clean(res.data?.username))
    .catch(() => "");
  const fromApi = await botUsernameRequest;
  botUsernameRequest = null;
  botUsername = fromApi || clean(import.meta.env.VITE_TELEGRAM_BOT_USERNAME) || null;
  return botUsername;
}

/**
 * Exchange the Telegram WebApp initData for a student session token (S2).
 * The backend HMAC-verifies initData against the bot token; from here on the
 * axios interceptor attaches the resulting JWT to every request, so student
 * mutations (register / payment / submission) run as a verified identity.
 */
async function exchangeTelegramInitData(): Promise<void> {
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

/**
 * The student session, shared by every caller that needs one.
 *
 * AuthProvider starts the exchange in its mount effect, but React runs child
 * effects first, and the Academy provider needs the token before it can read
 * `/academy/me` or claim a referral. So the exchange is exposed as a promise
 * instead of a fire-and-forget call: whoever arrives first starts it, everyone
 * else awaits the same request, and nobody has to know which provider mounted
 * before the other.
 *
 * A settled session is cached; a failed or empty exchange is not, so the next
 * caller can retry rather than spend the whole launch unauthenticated.
 */
let sessionRequest: Promise<void> | null = null;

export function ensureStudentSession(): Promise<void> {
  if (getStudentToken()) return Promise.resolve();
  sessionRequest ??= exchangeTelegramInitData()
    .then(() => {
      // "Nothing to exchange" (a browser outside Telegram, no dev endpoint)
      // leaves no token: not a session, so do not cache it as one.
      if (!getStudentToken()) sessionRequest = null;
    })
    .catch((err: unknown) => {
      sessionRequest = null;
      throw err;
    });
  return sessionRequest;
}
