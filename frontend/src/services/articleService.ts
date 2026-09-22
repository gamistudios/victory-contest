import axios from "axios";
import { Article, Comment } from "../types/article";
import api, { telegramApi } from "./api";

export async function getArticles(number: string = "") {
  const response = await api.get(`/articles/published?number=${number}`);
  return response.data.articles as Article[];
}
export async function getArticleById(id: string) {
  const response = await api.get(`/articles/${id}`);
  return response.data.article as Article;
}
export async function updateArticle(id: string, data: Article) {
  const response = await api.put(`/articles/${id}`, data);
  return response.data;
}
export async function toggleStat(
  articleId: string,
  payload: { type: "like" | "view"; action: "increment" | "decrement" }
) {
  const response = await api.patch(`/articles/${articleId}/stats`, payload);
  return response.data;
}

export async function getArticleComments(articleId: string) {
  const response = await api.get(`/articles/${articleId}/comments`);
  return response.data.comments as Comment[];
}
export async function postComment(articleId: string, comment: Comment) {
  const res = await api.post(`/articles/${articleId}/comments`, comment);
  return res.data;
}
export async function getPreparedMessageIdTelegram(data: any) {
  const res = await telegramApi.post(`/savePreparedInlineMessage`, data);
  return res.data;
}
export async function createInvoice(): Promise<string> {
  const payloadId = crypto.randomUUID();
  const final_payloadId = payloadId.replace("-", "");
  const res = await telegramApi.post("/createInvoiceLink", {
    title: `Premium Plan`,
    description: "This the plan for victory learning platform",
    payload: `subscription_${final_payloadId}`,
    currency: "XTR", // Stars are in Telegram’s native currency
    prices: [{ label: "Victory Premium", amount: 50 }],
    subscription_period: "month", // e.g. "month", "year"
  });

  return res.data.result as string;
}
