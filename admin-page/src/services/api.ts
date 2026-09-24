import axios from "axios";
import { DashboardStatsResponse } from "../types/dashboard";

const VITE_API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

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

export async function getDashboardStats(): Promise<DashboardStatsResponse> {
  const response = await api.get("/api/admin/dashboard");
  return response.data;
}

export default api;
