import api from "./api";
import {
  Article,
  ArticleSummary,
  ArticleListResponse,
  ArticleFilters,
  CreateArticlePayload,
  UpdateArticlePayload,
  BulkArticleOperation,
  ArticleSearchParams,
} from "@/types/article";

/** Wire shape of backend/internal/domain/article.go Comment (snake_case
 *  user fields, RFC3339 timestamps). */
export interface ArticleComment {
  id: string;
  articleId: string;
  user_id: string;
  user_name: string;
  avatar: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

/** PUT body: commentTextPayload is `{ "text": string }` with `binding:"required"`. */
export interface UpdateArticleCommentPayload {
  text: string;
}

// Create a new article
export const createArticle = async (
  articleData: CreateArticlePayload
): Promise<Article> => {
  const { data } = await api.post("/api/articles", articleData);
  return data;
};

// Get all articles (backend returns an array; we adapt to ArticleListResponse)
export const getArticles = async (
  _params?: ArticleSearchParams
): Promise<ArticleListResponse> => {
  const { data } = await api.get("/api/articles");
  const raw = (data?.articles ?? data) as Article[];
  const articles = raw.map((a) => ({
    id: a.id,
    title: a.title,
    excerpt: a.excerpt || "",
    author: a.author || {
      id: "1",
      name: "Admin User",
      avatar: "https://via.placeholder.com/40",
    },
    publishedAt: a.publishedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    status: a.status,
    thumbnail: a.thumbnail || "",
    readTime: a.readTime || 1,
    tags: a.tags || [],
    // Server-maintained counter; comment delete decrements it, so the admin
    // list is the source of truth for the moderation badge.
    commentCount: a.commentCount ?? 0,
  }));
  return { articles, total: articles.length, page: 1, limit: articles.length };
};

// Get a single article by ID
export const getArticleById = async (id: string): Promise<Article> => {
  const { data } = await api.get(`/api/articles/${id}`);
  return data.article ?? data;
};

// Update an article
export const updateArticle = async (
  articleData: UpdateArticlePayload
): Promise<Article> => {
  const { data } = await api.put(
    `/api/articles/${articleData.id}`,
    articleData
  );
  return data;
};

// Delete an article
export const deleteArticle = async (id: string): Promise<void> => {
  await api.delete(`/api/articles/${id}`);
};

// Publish/unpublish an article
export const toggleArticleStatus = async (
  id: string,
  status: "published" | "draft"
): Promise<Article> => {
  const { data } = await api.patch(`/api/articles/${id}/status`, { status });
  return data;
};

// Bulk operations (not implemented on backend yet) - placeholder to avoid runtime errors
export const bulkArticleOperation = async (
  _operation: BulkArticleOperation
): Promise<void> => {
  throw new Error("Bulk article operation not implemented on backend");
};

// Search articles (not implemented on backend yet)
export const searchArticles = async (
  _query: string,
  _filters?: ArticleFilters
): Promise<ArticleSummary[]> => {
  throw new Error("Search articles not implemented on backend");
};

// Get published articles for public view (wrap array)
export const getPublishedArticles = async (): Promise<ArticleListResponse> => {
  const { data } = await api.get("/api/articles/published");
  const raw = (data?.articles ?? data) as Article[];
  const articles = raw.map((a) => ({
    id: a.id,
    title: a.title,
    excerpt: a.excerpt || "",
    author: a.author || {
      id: "1",
      name: "Admin User",
      avatar: "https://via.placeholder.com/40",
    },
    publishedAt: a.publishedAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    status: a.status,
    thumbnail: a.thumbnail || "",
    readTime: a.readTime || 1,
    tags: a.tags || [],
  }));
  return { articles, total: articles.length, page: 1, limit: articles.length };
};

// Upload attachment for articles (returns { url, filename })
export const uploadAttachment = async (file: File): Promise<string> => {
  // TODO: Implement file upload to backend
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.readAsDataURL(file);
  });
};

export const updateStats = async (
  articleId: string,
  type: "view" | "like",
  action: "increment" | "decrement"
): Promise<void> => {
  try {
    await api.patch(`/api/articles/${articleId}/stats`, {
      type,
      action,
    });
  } catch (error) {
    console.error(`Failed to ${action} ${type} count:`, error);
    throw error;
  }
};

// Convenience functions for backward compatibility
export const incrementView = async (articleId: string): Promise<void> => {
  return updateStats(articleId, "view", "increment");
};

export const incrementLike = async (articleId: string): Promise<void> => {
  return updateStats(articleId, "like", "increment");
};

export const decrementView = async (articleId: string): Promise<void> => {
  return updateStats(articleId, "view", "decrement");
};

export const decrementLike = async (articleId: string): Promise<void> => {
  return updateStats(articleId, "like", "decrement");
};

// Comment services
export const getCommentsByArticleId = async (
  articleId: string
): Promise<Comment[]> => {
  try {
    const response = await api.get(`/api/articles/${articleId}/comments`);
    return response.data.comments || [];
  } catch (error) {
    console.error("Failed to fetch comments:", error);
    throw new Error("Failed to fetch comments");
  }
};

export const createComment = async (
  articleId: string,
  comment: Omit<Comment, "id" | "articleId" | "createdAt" | "updatedAt">
): Promise<string> => {
  try {
    const response = await api.post(
      `/api/articles/${articleId}/comments`,
      comment
    );
    return response.data.id;
  } catch (error) {
    console.error("Failed to create comment:", error);
    throw new Error("Failed to create comment");
  }
};

/** GET /api/articles/:id/comments — public listing, used by admin moderation. */
export const getArticleComments = async (
  articleId: string
): Promise<ArticleComment[]> => {
  const { data } = await api.get(`/api/articles/${articleId}/comments`);
  return (data?.comments ?? []) as ArticleComment[];
};

/** PUT /api/articles/:id/comments/:commentId (admin-gated) — body {"text": string},
 *  400 when text is missing/empty, 404 when the article or comment is gone,
 *  200 with the updated comment. */
export const updateArticleComment = async (
  articleId: string,
  commentId: string,
  payload: UpdateArticleCommentPayload
): Promise<ArticleComment> => {
  const { data } = await api.put(
    `/api/articles/${articleId}/comments/${commentId}`,
    payload
  );
  return data as ArticleComment;
};

/** DELETE /api/articles/:id/comments/:commentId (admin-gated) — 204, and the
 *  server decrements the article's commentCount. */
export const deleteArticleComment = async (
  articleId: string,
  commentId: string
): Promise<void> => {
  await api.delete(`/api/articles/${articleId}/comments/${commentId}`);
};

// Upload article image (not implemented; use existing image service if available)
export const uploadArticleImage = async (
  _file: File
): Promise<{ url: string }> => {
  throw new Error("Article image upload not implemented on backend");
};

// Stats/author/related (not implemented)
export const getArticleStats = async (): Promise<{
  total: number;
  published: number;
  drafts: number;
  archived: number;
}> => {
  throw new Error("Article stats not implemented on backend");
};

export const getArticlesByAuthor = async (
  _authorId: string,
  _params?: {
    page?: number;
    limit?: number;
    status?: "draft" | "published" | "archived";
  }
): Promise<ArticleListResponse> => {
  throw new Error("Get articles by author not implemented on backend");
};

export const getRelatedArticles = async (
  _articleId: string,
  _limit: number = 3
): Promise<ArticleSummary[]> => {
  throw new Error("Related articles not implemented on backend");
};
