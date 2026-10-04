// Article Management System Types

export interface Article {
  id: string;
  title: string;
  content: string; // Rich text HTML
  excerpt: string;
  author: Author;
  status: "draft" | "published" | "archived";
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  thumbnail?: string;
  readTime: number;
  viewCount: number;
  likeCount: number;
}

export interface MediaItem {
  id: string;
  type: "image" | "video";
  url: string;
  alt?: string; // for images
  caption?: string;
  width?: number;
  height?: number;
}

export interface ArticleData {
  title: string;
  content: string;
  excerpt: string;
  tags: string[];
  status: "draft" | "published";
  thumbnail?: string;
}

// Additional types for UI components
export interface ArticleSummary {
  id: string;
  title: string;
  excerpt: string;
  author: Author;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  status: ArticleStatus;
  thumbnail?: string;
  readTime: number;
  tags: string[];
}

export interface ArticleFormData {
  title: string;
  content: string;
  excerpt: string;
  tags: string[];
  thumbnail?: string;
}

// Editor-specific types
export interface EditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  editable?: boolean;
}

export interface MediaInsertionData {
  type: "image" | "video";
  url: string;
  alt?: string;
  caption?: string;
  width?: number;
  height?: number;
}

// API response types
export interface ArticleListResponse {
  articles: ArticleSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface ArticleFilters {
  status?: "draft" | "published" | "archived";
  author?: string;
  tags?: string[];
  search?: string;
  sortBy?: "createdAt" | "updatedAt" | "publishedAt" | "title";
  sortOrder?: "asc" | "desc";
}

// Validation result types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Article status types
export type ArticleStatus = "draft" | "published" | "archived";

// Media types
export type MediaType = "image" | "video";

// Author interface for better type safety
export interface Author {
  id: string;
  name: string;
  avatar?: string;
}

// Comment interface
export interface Comment {
  id: string;
  articleId: string;
  userId: string;
  userName: string;
  avatar: string;
  text: string;
  createdAt: Date;
  updatedAt: Date;
}

// Article creation payload
export interface CreateArticlePayload {
  title: string;
  content: string;
  excerpt?: string;
  tags: string[];
  thumbnail?: string;
  status: ArticleStatus;
}

// Article update payload
export interface UpdateArticlePayload extends Partial<CreateArticlePayload> {
  id: string;
}

// Bulk operations
export interface BulkArticleOperation {
  articleIds: string[];
  operation: "publish" | "unpublish" | "archive" | "delete";
}

// Search and pagination
export interface ArticleSearchParams {
  query?: string;
  status?: ArticleStatus;
  tags?: string[];
  authorId?: string;
  page?: number;
  limit?: number;
  sortBy?: keyof Article;
  sortOrder?: "asc" | "desc";
}
