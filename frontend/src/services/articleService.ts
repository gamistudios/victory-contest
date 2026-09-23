import { Article, Comment } from "../types/article";
import api from "./api";

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
