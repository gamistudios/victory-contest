import { Calendar, Clock, Tag } from "lucide-react";
import { Article } from "../../types/article";
import NewBadge from "../ui/newBadge";

interface ArticleCardProps {
  article: Article;
  onClick: () => void;
}

export function ArticleCard({ article, onClick }: ArticleCardProps) {
  const formatDate = (date: Date | undefined) => {
    if (!date) return "Not published";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  };
  const isNew = article.publishedAt
    ? Date.now() - new Date(article.publishedAt).getTime() <=
      1 * 24 * 60 * 60 * 1000
    : false;

  return (
    <article
      className="relative first-letter:bg-card border border-gray-200 rounded-lg p-4 mb-3 active:bg-gray-50 transition-colors"
      onClick={onClick}
    >
      {isNew && <NewBadge className="absolute top-[-10px] left-[-10px]" />}
      <div className="flex gap-3">
        {/* Thumbnail, with a local offline placeholder when missing */}
        {article.thumbnail ? (
          <div className="flex-shrink-0">
            <img
              src={article.thumbnail}
              alt={article.title}
              className="w-16 h-16 rounded-lg object-cover"
            />
          </div>
        ) : (
          <div
            className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-100 via-gray-100 to-purple-100"
            role="img"
            aria-label={article.title}
          >
            <span className="text-2xl font-bold text-gray-400">
              {article.title?.charAt(0).toUpperCase() || ""}
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Read Time */}
          <div className="flex items-center justify-end mb-2">
            <div className="flex absolute right-3 top-3 items-center text-gray-500 text-xs">
              <Clock className="w-3 h-3 mr-1" />
              {article.readTime}m
            </div>
          </div>

          {/* Title */}
          <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-1 line-clamp-2">
            {article.title}
          </h3>

          {/* Author and Date */}
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              {article?.author.avatar && (
                <img
                  src={article?.author.avatar}
                  alt={article?.author.name}
                  className="w-4 h-4 rounded-full flex-shrink-0"
                />
              )}
              <span className="truncate">{article.author.name}</span>
            </div>
            <div className="flex items-center ml-2 flex-shrink-0">
              <Calendar className="w-3 h-3 mr-1" />
              {article.status === "published"
                ? formatDate(article.publishedAt)
                : formatDate(article.updatedAt)}
            </div>
          </div>

          {/* Tags */}
          {article.tags.length > 0 && (
            <div className="flex items-center gap-1 mb-1">
              <Tag className="w-3 h-3 text-gray-400 flex-shrink-0" />
              <div className="flex gap-1 overflow-hidden">
                {article.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-xs rounded font-medium"
                  >
                    #{tag}
                  </span>
                ))}
                {article.tags.length > 2 && (
                  <span className="text-xs text-gray-500 self-center">
                    +{article.tags.length - 2}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
