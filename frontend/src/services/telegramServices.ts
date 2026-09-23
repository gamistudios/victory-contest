import api from "./api";

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
