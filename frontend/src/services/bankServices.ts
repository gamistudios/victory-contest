import api from "./api";
import { Bank } from "../types";

export async function getActiveBanks(): Promise<Bank[]> {
  // Trailing slash matches the gin route exactly; without it gin 301-redirects
  // and the redirect response lacks CORS headers.
  const res = await api.get("/banks/");
  const data = res.data as { banks?: Bank[] };
  return data.banks ?? [];
}

export async function getAllBanks(): Promise<Bank[]> {
  const res = await api.get("/banks/all");
  const data = res.data as { banks?: Bank[] };
  return data.banks ?? [];
}

export async function addBank(
  bank: Omit<Bank, "id" | "created_at">
): Promise<string> {
  const res = await api.post("/banks/", bank);
  const data = res.data as { id?: string };
  return data.id ?? "";
}

export async function updateBank(id: string, bank: Bank): Promise<void> {
  await api.put(`/banks/${id}`, bank);
}

export async function deleteBank(id: string): Promise<void> {
  await api.delete(`/banks/${id}`);
}
