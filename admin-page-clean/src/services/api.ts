import axios from "axios";
import { DashboardStatsResponse } from "../types/dashboard";

// Empty string means same-origin (how the Docker image serves the admin panel
// and the API from one host); undefined keeps the localhost dev default.
const VITE_API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

const api = axios.create({
  baseURL: VITE_API_URL,
  withCredentials: true,
});

export async function getMe() {
  const response = await api.get("/api/admin/me");
  return response.data;
}

export async function userLogout() {
  const response = await api.post("/api/admin/logout");
  return response.data;
}

export async function getDashboardStats(
  refresh = false
): Promise<DashboardStatsResponse> {
  // ?refresh=1 tells the backend to bypass its in-memory cache and re-scan the
  // tables for up-to-date numbers (client task 4 / performance).
  const response = await api.get(
    "/api/admin/dashboard",
    refresh ? { params: { refresh: 1 } } : undefined
  );
  return response.data;
}

export default api;
