import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, User, ArrowRight } from "lucide-react";
import { ArticleSummary } from "@/types/article";

interface ArticleCardProps {
  article: ArticleSummary;
  onClick: () => void;
  viewMode: "grid" | "list";
}

const ArticleCard: React.FC<ArticleCardProps> = ({
  article,
  onClick,
  viewMode,
}) => {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  if (viewMode === "list") {
    return (
      <Card
        className="hover:shadow-md transition-shadow cursor-pointer"
        onClick={onClick}
      >
        <CardContent className="p-6">
          <div className="flex gap-6">
            {/* Thumbnail */}
            <div className="flex-shrink-0">
              <div className="w-32 h-24 bg-gray-200 rounded-lg overflow-hidden">
                {article.thumbnail ? (
                  <img
                    src={article.thumbnail}
                    alt={article.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                    <span className="text-2xl">📝</span>
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-semibold text-gray-900 mb-2 line-clamp-2">
                    {article.title}
                  </h3>
                  <p className="text-gray-600 mb-3 line-clamp-2">
                    {article.excerpt}
                  </p>

                  {/* Meta information */}
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      <span>{article.author.name}</span>
                    </div>
                    {article.publishedAt && (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(article.publishedAt)}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      <span>{article.readTime} min read</span>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2">
                    {article.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {article.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{article.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Read button */}
                <div className="flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-blue-600 hover:text-blue-700"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Grid view
  return (
    <Card
      className="hover:shadow-lg transition-all duration-200 cursor-pointer group h-full flex flex-col"
      onClick={onClick}
    >
      <CardContent className="p-6 flex flex-col h-full">
        {/* Thumbnail */}
        <div className="mb-4">
          <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden mb-4">
            {article.thumbnail ? (
              <img
                src={article.thumbnail}
                alt={article.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                <span className="text-4xl">📝</span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col">
          <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
            {article.title}
          </h3>

          <p className="text-gray-600 mb-4 line-clamp-3 flex-1">
            {article.excerpt}
          </p>

          {/* Meta information */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <User className="w-4 h-4" />
                <span className="truncate">{article.author.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{article.readTime} min</span>
              </div>
            </div>

            {article.publishedAt && (
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(article.publishedAt)}</span>
              </div>
            )}

            {/* Tags */}
            <div className="flex flex-wrap gap-1">
              {article.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
              {article.tags.length > 2 && (
                <Badge variant="outline" className="text-xs">
                  +{article.tags.length - 2}
                </Badge>
              )}
            </div>

            {/* Read more button */}
            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-blue-600 hover:text-blue-700 group-hover:bg-blue-50"
              >
                Read Article
                <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ArticleCard;
