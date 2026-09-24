import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, Grid3X3, List } from "lucide-react";
import { ArticleSummary } from "@/types/article";
import ArticleCard from "./ArticleCard";

interface ArticlesListProps {
  articles: ArticleSummary[];
  onArticleClick: (articleId: string) => void;
  isLoading?: boolean;
  onRefresh?: () => void;
}

const ArticlesList: React.FC<ArticlesListProps> = ({
  articles,
  onArticleClick,
  isLoading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"publishedAt" | "title">("publishedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Get unique tags from all articles
  const allTags = Array.from(
    new Set(articles.flatMap((article) => article.tags))
  ).sort();

  const filteredArticles = articles.filter((article) => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.excerpt.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.tags.some((tag) =>
        tag.toLowerCase().includes(searchTerm.toLowerCase())
      );

    const matchesTags =
      selectedTags.length === 0 ||
      selectedTags.some((tag) => article.tags.includes(tag));

    return matchesSearch && matchesTags;
  });

  const sortedArticles = [...filteredArticles].sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];

    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortOrder === "desc"
        ? bValue.localeCompare(aValue)
        : aValue.localeCompare(bValue);
    }

    if (aValue instanceof Date && bValue instanceof Date) {
      return sortOrder === "desc"
        ? bValue.getTime() - aValue.getTime()
        : aValue.getTime() - bValue.getTime();
    }

    return 0;
  });

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedTags([]);
    setSortBy("publishedAt");
    setSortOrder("desc");
  };

  const hasActiveFilters = searchTerm || selectedTags.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">Articles</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Discover insightful articles, tutorials, and guides written by our
          expert authors
        </p>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Search & Filter
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <Input
              placeholder="Search articles by title, content, or tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 text-lg"
            />
          </div>

          {/* Tags Filter */}
          {allTags.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Filter by Tags</Label>
              <div className="flex flex-wrap gap-2">
                {allTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant={selectedTags.includes(tag) ? "default" : "outline"}
                    className="cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => handleTagToggle(tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Sort and View Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Sort by:</Label>
                <Select
                  value={sortBy}
                  onValueChange={(value) => setSortBy(value as any)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="publishedAt">
                      Publication Date
                    </SelectItem>
                    <SelectItem value="title">Title</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))
                  }
                >
                  {sortOrder === "desc" ? "↓" : "↑"}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("grid")}
              >
                <Grid3X3 className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm text-gray-500">
                {filteredArticles.length} of {articles.length} articles
              </span>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear Filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Articles Grid/List */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                  <div className="flex gap-2">
                    <div className="h-6 bg-gray-200 rounded w-16"></div>
                    <div className="h-6 bg-gray-200 rounded w-20"></div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sortedArticles.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <div className="space-y-4">
              <div className="text-6xl">📝</div>
              <h3 className="text-xl font-semibold text-gray-900">
                {hasActiveFilters
                  ? "No articles found"
                  : "No articles published yet"}
              </h3>
              <p className="text-gray-600 max-w-md mx-auto">
                {hasActiveFilters
                  ? "Try adjusting your search terms or filters to find what you're looking for."
                  : "Check back soon for new articles and insights from our authors."}
              </p>
              {hasActiveFilters && (
                <Button onClick={clearFilters} variant="outline">
                  Clear All Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              : "space-y-4"
          }
        >
          {sortedArticles.map((article) => (
            <ArticleCard
              key={article.id}
              article={article}
              onClick={() => onArticleClick(article.id)}
              viewMode={viewMode}
            />
          ))}
        </div>
      )}

      {/* Results Summary */}
      {!isLoading && sortedArticles.length > 0 && (
        <div className="text-center text-sm text-gray-500">
          Showing {sortedArticles.length} of {articles.length} articles
          {hasActiveFilters && " (filtered)"}
        </div>
      )}
    </div>
  );
};

export default ArticlesList;
