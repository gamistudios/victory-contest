import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, User, Clock, Tag } from "lucide-react";
import { Article } from "@/types/article";

interface ArticlePreviewProps {
  article: {
    title: string;
    content: string;
    excerpt: string;
    tags: string[];
    author?: {
      name: string;
      avatar?: string;
    };
    publishedAt?: Date;
    readTime?: number;
  };
  className?: string;
}

const ArticlePreview: React.FC<ArticlePreviewProps> = ({
  article,
  className = "",
}) => {
  const calculateReadTime = (content: string): number => {
    const wordsPerMinute = 200;
    const wordCount = content.replace(/<[^>]*>/g, "").split(/\s+/).length;
    return Math.ceil(wordCount / wordsPerMinute);
  };

  const readTime = article.readTime || calculateReadTime(article.content);

  return (
    <div className={`article-preview max-w-4xl mx-auto ${className}`}>
      {/* Article Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4 leading-tight">
          {article.title}
        </h1>

        {article.excerpt && (
          <p className="text-xl text-gray-600 mb-6 leading-relaxed">
            {article.excerpt}
          </p>
        )}

        {/* Article Meta */}
        <div className="flex items-center gap-6 text-sm text-gray-500 mb-6">
          {article.author && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4" />
              <span>{article.author.name}</span>
            </div>
          )}

          {article.publishedAt && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>{readTime} min read</span>
          </div>
        </div>

        {/* Tags */}
        {article.tags && article.tags.length > 0 && (
          <div className="flex items-center gap-2 mb-6">
            <Tag className="w-4 h-4 text-gray-400" />
            <div className="flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      <Separator className="mb-8" />

      {/* Article Content */}
      <div className="prose prose-lg max-w-none">
        <div
          className="article-content"
          dangerouslySetInnerHTML={{ __html: article.content }}
          style={{
            fontSize: "1.125rem",
            lineHeight: "1.75",
            color: "#374151",
          }}
        />
      </div>

      {/* Responsive Design Styles */}
      <style>
        {`
          .article-content {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #374151;
          }
          .article-content h1, .article-content h2, .article-content h3, .article-content h4, .article-content h5, .article-content h6 {
            margin-top: 1.5rem;
            margin-bottom: 0.75rem;
            font-weight: 600;
            color: #111827;
          }
          .article-content h1 { font-size: 2rem; }
          .article-content h2 { font-size: 1.75rem; }
          .article-content h3 { font-size: 1.5rem; }
          .article-content h4 { font-size: 1.25rem; }
          .article-content h5 { font-size: 1.125rem; }
          .article-content h6 { font-size: 1rem; }
          .article-content p {
            margin-bottom: 1rem;
            line-height: 1.7;
          }
          .article-content ul, .article-content ol {
            margin-bottom: 1rem;
            padding-left: 1.5rem;
          }
          .article-content li {
            margin-bottom: 0.25rem;
          }
          .article-content blockquote {
            border-left: 4px solid #e5e7eb;
            padding-left: 1rem;
            margin: 1rem 0;
            font-style: italic;
            color: #6b7280;
          }
          .article-content img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin: 1rem 0;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          .article-content iframe {
            max-width: 100%;
            border-radius: 8px;
            margin: 1rem 0;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
          .article-content a {
            color: #2563eb;
            text-decoration: underline;
          }
          .article-content a:hover {
            color: #1d4ed8;
          }
          .article-content code {
            background-color: #f3f4f6;
            padding: 0.125rem 0.25rem;
            border-radius: 0.25rem;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.875rem;
          }
          .article-content pre {
            background-color: #f3f4f6;
            padding: 1rem;
            border-radius: 0.5rem;
            overflow-x: auto;
            margin: 1rem 0;
          }
          .article-content pre code {
            background-color: transparent;
            padding: 0;
          }
        `}
      </style>
    </div>
  );
};

export default ArticlePreview;
