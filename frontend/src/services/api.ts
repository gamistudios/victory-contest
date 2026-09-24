import axios, { AxiosError } from "axios";

//const baseURL = "https://7wwb0knl-8080.euw.devtunnels.ms";
const baseURL = import.meta.env.VITE_API_BASE_URL;
const api = axios.create({
  baseURL: baseURL + "/api",
  withCredentials: true,
});

// Student session token (S2): minted by POST /telegram/auth from validated
// Telegram initData and sent as `Authorization: Bearer` on every request.
// Kept in localStorage so a WebApp reload keeps the session (7-day expiry).
const STUDENT_TOKEN_KEY = "student_token";
let studentToken: string | null = (() => {
  try {
    return localStorage.getItem(STUDENT_TOKEN_KEY);
  } catch {
    return null; // storage blocked (private mode): memory-only session
  }
})();

export function setStudentToken(token: string | null): void {
  studentToken = token;
  try {
    if (token) localStorage.setItem(STUDENT_TOKEN_KEY, token);
    else localStorage.removeItem(STUDENT_TOKEN_KEY);
  } catch {
    // ignore: in-memory token still applies for this page lifetime
  }
}

export function getStudentToken(): string | null {
  return studentToken;
}

api.interceptors.request.use((config) => {
  if (studentToken) {
    config.headers.Authorization = `Bearer ${studentToken}`;
  }
  return config;
});

/**
 * True when a request was cancelled rather than genuinely failed.
 *
 * Two legitimate sources:
 *  - Manual cancellation (AbortController wired to a signal): axios rejects
 *    with a CanceledError (`axios.isCancel`, code ERR_CANCELED).
 *  - Browser-level cancellation, e.g. a Vite dev full-reload during
 *    dependency optimisation or a page unload while the request is in
 *    flight: the XHR `abort` event fires and axios rejects with code
 *    ECONNABORTED and the literal message "Request aborted" (see
 *    axios/lib/adapters/xhr.js, `request.onabort`). Timeouts share the
 *    ECONNABORTED code but carry a different message
 *    ("timeout of Nms exceeded"), so the message check keeps real
 *    timeouts reportable.
 *
 * These errors must NOT surface as user-visible toasts or error states,
 * but callers must still stop applying their results (the stale-response /
 * ignore-flag guards stay in place — an abort never sets state from a dead
 * component).
 */
export function isAbortedRequest(err: unknown): boolean {
  if (axios.isCancel(err)) return true;
  if (err instanceof AxiosError) {
    if (err.code === "ERR_CANCELED") return true;
    if (err.code === AxiosError.ECONNABORTED && err.message === "Request aborted") {
      return true;
    }
  }
  return false;
}

export default api;
