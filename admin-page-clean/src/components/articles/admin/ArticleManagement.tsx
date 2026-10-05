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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
  MessageSquare,
} from "lucide-react";
import { Article, ArticleStatus } from "@/types/article";
import { toast } from "sonner";
import {
  toggleArticleStatus,
  getArticleComments,
  updateArticleComment,
  deleteArticleComment,
  type ArticleComment,
} from "@/services/articleServices";
import { describeApiError } from "@/services/feedbackServices";

interface ArticleManagementProps {
  articles: Article[];
  onEdit: (articleId: string) => void;
  onDelete: (articleId: string) => void;
  onTogglePublish: (articleId: string) => void;
  /** Re-read the article rows so the server-maintained commentCount is fresh. */
  onRefresh?: () => void;
}

/** Admin moderation surface for one article's comments. */
const ArticleCommentsDialog: React.FC<{
  article: Article | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCountRefresh?: () => void;
}> = ({ article, open, onOpenChange, onCountRefresh }) => {
  const [comments, setComments] = useState<ArticleComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<ArticleComment | null>(null);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ArticleComment | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = React.useCallback(async () => {
    if (!article?.id) return;
    setLoading(true);
    setError(null);
    try {
      setComments(await getArticleComments(article.id));
    } catch (e) {
      setError(describeApiError(e, "Loading comments"));
    } finally {
      setLoading(false);
    }
  }, [article]);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = (comment: ArticleComment) => {
    setEditTarget(comment);
    setEditText(comment.text);
    setError(null);
  };

  const submitEdit = async () => {
    if (!article || !editTarget) return;
    const text = editText.trim();
    if (!text) {
      setError("Comment text is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateArticleComment(article.id, editTarget.id, {
        text,
      });
      setComments((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
      );
      setEditTarget(null);
    } catch (e) {
      setError(describeApiError(e, "Updating comment"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!article || !deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteArticleComment(article.id, deleteTarget.id);
      setComments((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      // commentCount is decremented server-side; the row is the source of truth.
      onCountRefresh?.();
    } catch (e) {
      setDeleteTarget(null);
      setError(describeApiError(e, "Deleting comment"));
    } finally {
      setDeleting(false);
      document.body.style.pointerEvents = "";
    }
  };

  const formatDate = (value: string) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base break-words">
              Comments — {article?.title}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {article?.commentCount ?? 0} on record · {comments.length} loaded.
              Edits and deletes apply immediately.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p className="text-xs text-red-600 break-words">{error}</p>
          )}

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : comments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No comments yet.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Author</TableHead>
                    <TableHead>Text</TableHead>
                    <TableHead className="w-[110px]">Created</TableHead>
                    <TableHead className="w-[90px] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comments.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm break-words">
                        {c.user_name || c.user_id || "—"}
                      </TableCell>
                      <TableCell className="max-w-[320px] text-sm">
                        <span className="break-words">{c.text}</span>
                      </TableCell>
                      <TableCell className="text-xs text-gray-500">
                        {formatDate(c.createdAt)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(c)}
                          title="Edit comment"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => setDeleteTarget(c)}
                          title="Delete comment"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inline edit */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(o) => !o && setEditTarget(null)}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Edit comment</DialogTitle>
            <DialogDescription className="text-xs">
              PUT /api/articles/{article?.id}/comments/{editTarget?.id} — body
              {"{ text }"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="comment-text">Text</Label>
            <Textarea
              id="comment-text"
              value={editText}
              rows={4}
              onChange={(e) => setEditText(e.target.value)}
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && !deleting && setDeleteTarget(null)}
      >
        <AlertDialogContent className="max-w-[calc(100vw-2rem)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {deleteTarget?.text}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const ArticleManagement: React.FC<ArticleManagementProps> = ({
  articles,
  onEdit,
  onDelete,
  onRefresh,
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
  const [commentsArticle, setCommentsArticle] = useState<Article | null>(null);

  // Monitor and force reset pointer-events on body
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const bodyStyle = window.getComputedStyle(document.body);
      if (
        bodyStyle.pointerEvents === "none" &&
        !deleteDialogOpen &&
        !commentsArticle
      ) {
        console.log("Forcing pointer-events reset");
        document.body.style.pointerEvents = "";
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style"],
    });

    return () => observer.disconnect();
  }, [deleteDialogOpen, commentsArticle]);

  // Additional cleanup when dialog closes
  useEffect(() => {
    if (!deleteDialogOpen && !commentsArticle) {
      const cleanup = () => {
        document.body.style.pointerEvents = "";
      };

      // Multiple cleanup attempts to ensure it works
      cleanup();
      setTimeout(cleanup, 50);
      setTimeout(cleanup, 150);
      setTimeout(cleanup, 300);
    }
  }, [deleteDialogOpen, commentsArticle]);
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

  // Read the dialog's count off the freshest row copy so the server-side
  // commentCount decrement shows up after a moderation action.
  const liveCommentsArticle = commentsArticle
    ? articles.find((a) => a.id === commentsArticle.id) ?? commentsArticle
    : null;

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
            <Table className="min-w-[1000px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-[90px]">Comments</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedArticles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
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
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 px-2 text-xs"
                          onClick={() => setCommentsArticle(article)}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          {article.commentCount ?? 0}
                        </Button>
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
                              onClick={() => setCommentsArticle(article)}
                            >
                              <MessageSquare className="w-4 h-4 mr-2" />
                              Comments
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

      {/* Comment moderation */}
      <ArticleCommentsDialog
        article={liveCommentsArticle}
        open={commentsArticle !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCommentsArticle(null);
            document.body.style.pointerEvents = "";
          }
        }}
        onCountRefresh={onRefresh}
      />
    </div>
  );
};

export default ArticleManagement;
