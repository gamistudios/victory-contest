import React, { useState, useEffect } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Filter,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Plus,
  Calendar,
  Clock,
  Archive,
} from "lucide-react";
import { Article, ArticleStatus } from "@/types/article";
import { toast } from "sonner";
import { toggleArticleStatus } from "@/services/articleServices";

interface ArticleManagementProps {
  articles: Article[];
  onEdit: (articleId: string) => void;
  onDelete: (articleId: string) => void;
  onTogglePublish: (articleId: string) => void;
}

const ArticleManagement: React.FC<ArticleManagementProps> = ({
  articles,
  onEdit,
  onDelete,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<ArticleStatus | "all">(
    "all"
  );
  const [sortBy, setSortBy] = useState<
    "createdAt" | "updatedAt" | "publishedAt" | "title"
  >("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isLoading, setIsLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState<Article | null>(null);

  // Monitor and force reset pointer-events on body
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const bodyStyle = window.getComputedStyle(document.body);
      if (bodyStyle.pointerEvents === "none" && !deleteDialogOpen) {
        console.log("Forcing pointer-events reset");
        document.body.style.pointerEvents = "";
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style"],
    });

    return () => observer.disconnect();
  }, [deleteDialogOpen]);

  // Additional cleanup when dialog closes
  useEffect(() => {
    if (!deleteDialogOpen) {
      const cleanup = () => {
        document.body.style.pointerEvents = "";
      };

      // Multiple cleanup attempts to ensure it works
      cleanup();
      setTimeout(cleanup, 50);
      setTimeout(cleanup, 150);
      setTimeout(cleanup, 300);
    }
  }, [deleteDialogOpen]);
  const filteredArticles = articles.filter((article) => {
    const matchesSearch =
      article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      article.tags.some((tag) =>
        tag.toLowerCase().includes(searchTerm.toLowerCase())
      );

    const matchesStatus =
      statusFilter === "all" || article.status === statusFilter;

    return matchesSearch && matchesStatus;
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

  const handleDeleteClick = (article: Article) => {
    setArticleToDelete(article);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!articleToDelete) return;

    setIsLoading(true);
    try {
      onDelete(articleToDelete.id);
      toast.success("Article deleted successfully");
    } catch {
      toast.error("Failed to delete article");
    } finally {
      setIsLoading(false);
      setDeleteDialogOpen(false);
      setArticleToDelete(null);
      // Force reset pointer-events
      document.body.style.pointerEvents = "";
    }
  };

  const handleToggleStatus = async (article: Article) => {
    const newStatus = article.status === "published" ? "draft" : "published";

    try {
      await toggleArticleStatus(article.id, newStatus);
      toast.success(`Article ${newStatus} successfully`);
    } catch {
      toast.error("Failed to update article status");
    } finally {
      // Always reset pointer-events
      document.body.style.pointerEvents = "";
    }
  };

  const getStatusBadge = (status: ArticleStatus) => {
    const variants = {
      published: "default",
      draft: "secondary",
      archived: "destructive",
    } as const;

    return (
      <Badge variant={variants[status]}>
        {status === "published" ? (
          <>
            <Eye className="w-4 h-4 mr-2" />
            Published
          </>
        ) : status === "draft" ? (
          <>
            <EyeOff className="w-4 h-4 mr-2" />
            Draft
          </>
        ) : (
          <Archive className="w-4 h-4 mr-2" />
        )}
      </Badge>
    );
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const truncateText = (text: string, maxLength: number = 100) => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + "...";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold break-words">Article Management</h1>
          <p className="text-gray-600 mt-1">
            Manage your articles, drafts, and published content
          </p>
        </div>
        <Button
          onClick={() => onEdit("new")}
          className="flex items-center gap-2 w-full sm:w-auto justify-center"
        >
          <Plus className="w-4 h-4" />
          New Article
        </Button>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters & Search
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  id="search"
                  placeholder="Search articles..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as ArticleStatus | "all")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sortBy">Sort By</Label>
              <Select
                value={sortBy}
                onValueChange={(value) =>
                  setSortBy(value as "createdAt" | "updatedAt" | "publishedAt" | "title")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="createdAt">Created Date</SelectItem>
                  <SelectItem value="updatedAt">Updated Date</SelectItem>
                  <SelectItem value="publishedAt">Published Date</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sortOrder">Order</Label>
              <Select
                value={sortOrder}
                onValueChange={(value) => setSortOrder(value as "asc" | "desc")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Newest First</SelectItem>
                  <SelectItem value="asc">Oldest First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Articles Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Articles ({filteredArticles.length} of {articles.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedArticles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="text-gray-500">
                        {searchTerm || statusFilter !== "all"
                          ? "No articles match your filters"
                          : "No articles found. Create your first article!"}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedArticles.map((article) => (
                    <TableRow key={article.id}>
                      <TableCell>
                        <div className="min-w-0 max-w-[280px]">
                          <div className="font-medium break-words">{article.title}</div>
                          <div className="text-sm text-gray-500 mt-1 break-words">
                            {truncateText(article.excerpt, 80)}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {article.author.avatar && (
                            <img
                              src={article.author.avatar}
                              alt={article.author.name}
                              className="w-6 h-6 rounded-full"
                            />
                          )}
                          <span className="text-sm">{article.author.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(article.status)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {article.tags.slice(0, 2).map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="text-xs"
                            >
                              {tag}
                            </Badge>
                          ))}
                          {article.tags.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{article.tags.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Calendar className="w-3 h-3" />
                          {formatDate(article.createdAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Clock className="w-3 h-3" />
                          {formatDate(article.updatedAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => onEdit(article.id)}
                            >
                              <Edit className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleToggleStatus(article)}
                            >
                              {article.status === "published" ? (
                                <>
                                  <EyeOff className="w-4 h-4 mr-2" />
                                  Unpublish
                                </>
                              ) : (
                                <>
                                  <Eye className="w-4 h-4 mr-2" />
                                  Publish
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteClick(article)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>Delete Article</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{articleToDelete?.title}"? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isLoading}
            >
              {isLoading ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ArticleManagement;
