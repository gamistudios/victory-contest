import React from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Calendar, User, Clock, Tag } from "lucide-react";

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
    <div className={`article-preview w-full max-w-4xl mx-auto px-1 ${className}`}>
      {/* Article Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight break-words">
          {article.title}
        </h1>

        {article.excerpt && (
          <p className="text-base sm:text-xl text-gray-600 mb-6 leading-relaxed break-words">
            {article.excerpt}
          </p>
        )}

        {/* Article Meta */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-500 mb-6">
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
          <div className="flex items-center gap-2 mb-6 min-w-0">
            <Tag className="w-4 h-4 text-gray-400 flex-shrink-0" />
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
      <div className="prose sm:prose-lg max-w-none min-w-0">
        <div
          className="article-content"
          dangerouslySetInnerHTML={{ __html: article.content }}
          style={{
            fontSize: "clamp(1rem, 2.5vw, 1.125rem)",
            lineHeight: "1.75",
            color: "hsl(var(--gray-700))",
          }}
        />
      </div>

      {/* Responsive Design Styles */}
      <style>
        {`
          .article-content {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: hsl(var(--gray-700));
            overflow-wrap: break-word;
            word-break: break-word;
          }
          .article-content h1, .article-content h2, .article-content h3, .article-content h4, .article-content h5, .article-content h6 {
            margin-top: 1.5rem;
            margin-bottom: 0.75rem;
            font-weight: 600;
            color: hsl(var(--gray-900));
          }
          .article-content h1 { font-size: 1.75rem; }
          .article-content h2 { font-size: 1.5rem; }
          .article-content h3 { font-size: 1.3125rem; }
          .article-content h4 { font-size: 1.125rem; }
          .article-content h5 { font-size: 1rem; }
          .article-content h6 { font-size: 0.875rem; }
          @media (min-width: 640px) {
            .article-content h1 { font-size: 2rem; }
            .article-content h2 { font-size: 1.75rem; }
            .article-content h3 { font-size: 1.5rem; }
            .article-content h4 { font-size: 1.25rem; }
            .article-content h5 { font-size: 1.125rem; }
            .article-content h6 { font-size: 1rem; }
          }
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
            border-left: 4px solid hsl(var(--border));
            padding-left: 1rem;
            margin: 1rem 0;
            font-style: italic;
            color: hsl(var(--muted-foreground));
          }
          .article-content img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            margin: 1rem 0;
            box-shadow: 0 2px 8px hsl(var(--shadow-color) / 0.1);
          }
          .article-content iframe {
            max-width: 100%;
            border-radius: 8px;
            margin: 1rem 0;
            box-shadow: 0 2px 8px hsl(var(--shadow-color) / 0.1);
          }
          .article-content .youtube-wrapper,
          .article-content div[class*='youtube'] {
            max-width: 100%;
          }
          .article-content a {
            color: hsl(var(--blue-600));
            text-decoration: underline;
          }
          .article-content a:hover {
            color: hsl(var(--blue-700));
          }
          .article-content code {
            background-color: hsl(var(--muted));
            padding: 0.125rem 0.25rem;
            border-radius: 0.25rem;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.875rem;
          }
          .article-content pre {
            background-color: hsl(var(--muted));
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
