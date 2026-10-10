import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Calendar,
  Clock,
  Tag,
  Bookmark,
  ArrowLeft,
  ThumbsUp,
  Bird,
  Briefcase,
  Copy,
} from "lucide-react";
import { Article } from "@/types/article";
import { toast } from "sonner";

interface ArticleViewerProps {
  article: Article;
  onBackToList: () => void;
  onShare?: (platform: string) => void;
}

const ArticleViewer: React.FC<ArticleViewerProps> = ({
  article,
  onBackToList,
  onShare,
}) => {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const handleShare = (platform: string) => {
    const url = window.location.href;
    const title = article.title;

    let shareUrl = "";
    switch (platform) {
      case "facebook":
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
          url
        )}`;
        break;
      case "twitter":
        shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(
          url
        )}&text=${encodeURIComponent(title)}`;
        break;
      case "linkedin":
        shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
          url
        )}`;
        break;
      case "copy":
        navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard!");
        return;
      default:
        break;
    }

    if (shareUrl) {
      window.open(shareUrl, "_blank", "width=600,height=400");
    }

    onShare?.(platform);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        onClick={onBackToList}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Articles
      </Button>

      {/* Article Header */}
      <div className="space-y-6">
        {/* Title */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 leading-tight break-words">
          {article.title}
        </h1>

        {/* Excerpt */}
        {article.excerpt && (
          <p className="text-base sm:text-xl text-gray-600 leading-relaxed max-w-3xl break-words">
            {article.excerpt}
          </p>
        )}

        {/* Article Meta */}
        <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            {article.author.avatar && (
              <img
                src={article.author.avatar}
                alt={article.author.name}
                className="w-8 h-8 rounded-full"
              />
            )}
            <span className="font-medium">{article.author.name}</span>
          </div>

          {article.publishedAt && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(article.publishedAt)}</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            <span>{article.readTime} min read</span>
          </div>
        </div>

        {/* Tags */}
        {article.tags && article.tags.length > 0 && (
          <div className="flex items-center gap-2 min-w-0">
            <Tag className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div className="flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-sm break-words max-w-full">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Share and Bookmark */}
        <div className="flex flex-wrap items-center gap-4 pt-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Share:</span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleShare("facebook")}
                className="text-blue-600 hover:text-blue-700"
              >
                <ThumbsUp className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleShare("twitter")}
                className="text-blue-400 hover:text-blue-500"
              >
                <Bird className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleShare("linkedin")}
                className="text-blue-700 hover:text-blue-800"
              >
                <Briefcase className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleShare("copy")}
                className="text-gray-600 hover:text-gray-700"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="text-gray-600 hover:text-gray-700"
          >
            <Bookmark className="w-4 h-4 mr-2" />
            Bookmark
          </Button>
        </div>
      </div>

      <Separator />

      {/* Featured Image */}
      {article.thumbnail && (
        <div className="my-8">
          <img
            src={article.thumbnail}
            alt={article.title}
            className="w-full h-auto rounded-lg shadow-lg"
          />
        </div>
      )}

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

      {/* Article Footer */}
      <Separator />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between py-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm text-gray-500">Share this article:</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShare("facebook")}
            >
              <ThumbsUp className="w-4 h-4 mr-2" />
              Facebook
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShare("twitter")}
            >
              <Bird className="w-4 h-4 mr-2" />
              Twitter
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleShare("linkedin")}
            >
              <Briefcase className="w-4 h-4 mr-2" />
              LinkedIn
            </Button>
          </div>
        </div>

        <Button variant="outline" onClick={onBackToList} className="w-full sm:w-auto justify-center">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Articles
        </Button>
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

export default ArticleViewer;
