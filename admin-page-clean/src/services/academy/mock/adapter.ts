/**
 * Axios adapter that answers `/academy/*` requests from the in-memory mock DB
 * and delegates everything else to axios' default adapter. Because the UI keeps
 * calling the same `api` instance, replacing the mock with the Go backend is a
 * one-line change (see services/api.ts).
 */
import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import { dispatch, HttpError } from "./handlers";

const MIN_LATENCY = 90;
const MAX_LATENCY = 260;

function pathOf(config: InternalAxiosRequestConfig): { path: string; query: Record<string, string> } {
  const raw = config.url ?? "";
  const base = config.baseURL ?? "";
  let full = raw.startsWith("http") ? raw : `${base.replace(/\/$/, "")}/${raw.replace(/^\//, "")}`;
  full = full.replace(/^https?:\/\/[^/]+/, "");
  const [p, qs] = full.split("?");
  const query: Record<string, string> = {};
  new URLSearchParams(qs ?? "").forEach((v, k) => (query[k] = v));
  for (const [k, v] of Object.entries((config.params ?? {}) as Record<string, unknown>)) {
    if (v !== undefined && v !== null && v !== "") query[k] = String(v);
  }
  return { path: p.replace(/^\/api/, "") || "/", query };
}

export function installAcademyMock(api: AxiosInstance): void {
  const real = axios.getAdapter(api.defaults.adapter) as AxiosAdapter;

  const adapter: AxiosAdapter = async (config) => {
    const { path, query } = pathOf(config);
    if (!path.startsWith("/academy")) return real(config);

    if (config.signal?.aborted) throw new axios.CanceledError("canceled", config);
    await new Promise((r) => setTimeout(r, MIN_LATENCY + Math.random() * (MAX_LATENCY - MIN_LATENCY)));
    if (config.signal?.aborted) throw new axios.CanceledError("canceled", config);

    let body: unknown = config.data;
    if (typeof body === "string" && body) {
      try {
        body = JSON.parse(body);
      } catch {
        /* keep raw */
      }
    }

    const respond = (status: number, data: unknown): AxiosResponse => ({
      data,
      status,
      statusText: String(status),
      headers: {},
      config,
      request: {},
    });

    try {
      const out = dispatch(config.method ?? "get", path, query, body);
      const status = out.status ?? 200;
      const data = out.data === undefined ? "" : JSON.parse(JSON.stringify(out.data));
      return respond(status, data);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      const message = e instanceof Error ? e.message : "mock server error";
      const response = respond(status, { error: message });
      throw new AxiosError(message, status >= 500 ? "ERR_BAD_RESPONSE" : "ERR_BAD_REQUEST", config, {}, response);
    }
  };

  api.defaults.adapter = adapter;
}
