export type ArticleStatus = "draft" | "published" | "archived";

export interface Author {
  id: string;
  name: string;
  avatar?: string;
}

export interface Article {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  author: Author;
  status: ArticleStatus;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  thumbnail?: string;
  readTime: number;
  likeCount: number;
  viewCount: number;
  commentCount: number;
}
export interface Comment {
  id: string;
  articleId: string;
  user_name: string;
  user_id: string;
  avatar: string;
  text: string;
  createdAt?: string;
  updatedAt?: string;
}
