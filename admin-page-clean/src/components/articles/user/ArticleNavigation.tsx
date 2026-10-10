import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight, Home, Calendar, Clock, ArrowRight, BookOpen, FileText } from "lucide-react";
import { ArticleSummary } from "@/types/article";

interface ArticleNavigationProps {
  currentArticle: ArticleSummary;
  previousArticle?: ArticleSummary;
  nextArticle?: ArticleSummary;
  relatedArticles?: ArticleSummary[];
  onNavigate: (articleId: string) => void;
  onBackToList: () => void;
}

const ArticleNavigation: React.FC<ArticleNavigationProps> = ({
  currentArticle,
  previousArticle,
  nextArticle,
  relatedArticles = [],
  onNavigate,
  onBackToList,
}) => {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-8">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center space-x-2 text-sm text-gray-500 min-w-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBackToList}
          className="flex items-center gap-1 hover:text-gray-700 flex-shrink-0"
        >
          <Home className="w-4 h-4" />
          <span>Articles</span>
        </Button>
        <span>/</span>
        <span className="text-gray-900 font-medium truncate min-w-0">
          {currentArticle.title}
        </span>
      </nav>

      {/* Previous/Next Navigation: horizontally scrollable on phones */}
      <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1 [&>*]:flex-shrink-0">
        <div className="min-w-0">
          {previousArticle && (
            <Button
              variant="outline"
              onClick={() => onNavigate(previousArticle.id)}
              className="flex items-center gap-2 text-left max-w-full"
            >
              <ChevronLeft className="w-4 h-4 flex-shrink-0" />
              <div className="flex flex-col items-start min-w-0">
                <span className="text-xs text-gray-500">Previous</span>
                <span className="font-medium truncate max-w-[140px] sm:max-w-[200px]">
                  {previousArticle.title}
                </span>
              </div>
            </Button>
          )}
        </div>

        <div className="flex justify-end min-w-0">
          {nextArticle && (
            <Button
              variant="outline"
              onClick={() => onNavigate(nextArticle.id)}
              className="flex items-center gap-2 text-right max-w-full"
            >
              <div className="flex flex-col items-end min-w-0">
                <span className="text-xs text-gray-500">Next</span>
                <span className="font-medium truncate max-w-[140px] sm:max-w-[200px]">
                  {nextArticle.title}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
            </Button>
          )}
        </div>
      </div>

      {/* Related Articles */}
      {relatedArticles.length > 0 && (
        <>
          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              <h3 className="text-xl font-semibold">Related Articles</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {relatedArticles.slice(0, 3).map((article) => {
                const articleTags = article.tags ?? [];
                return (
                  <Card
                    key={article.id}
                    className="hover:shadow-md transition-shadow cursor-pointer group"
                    onClick={() => onNavigate(article.id)}
                  >
                    <CardContent className="p-4">
                      {/* Thumbnail */}
                      <div className="aspect-video bg-gray-200 rounded-lg overflow-hidden mb-3">
                        {article.thumbnail ? (
                          <img
                            src={article.thumbnail}
                            alt={article.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                            <FileText className="h-6 w-6 text-blue-700" aria-hidden="true" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="space-y-2">
                        <h4 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
                          {article.title}
                        </h4>

                        <p className="text-sm text-gray-600 line-clamp-2">
                          {article.excerpt}
                        </p>

                        {/* Meta */}
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {article.publishedAt &&
                              formatDate(article.publishedAt)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {article.readTime} min
                          </div>
                        </div>

                        {/* Tags */}
                        {articleTags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {articleTags.slice(0, 2).map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-xs"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {articleTags.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{articleTags.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Read more */}
                        <div className="pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-blue-600 hover:text-blue-700 group-hover:bg-blue-50"
                          >
                            Read Article
                            <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Back to Articles */}
      <Separator />

      <div className="text-center">
        <Button
          variant="outline"
          size="lg"
          onClick={onBackToList}
          className="flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to All Articles
        </Button>
      </div>
    </div>
  );
};

export default ArticleNavigation;
