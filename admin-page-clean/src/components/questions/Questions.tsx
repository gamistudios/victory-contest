import * as React from "react";
import {
  getQuestions,
  deleteQuestions,
  deleteAllQuestions,
  MAX_BULK_DELETE_IDS,
  type BulkDeleteQuestionsResult,
} from "@/services/questionServices"; // Full question rows (admin route)
import { describeApiError } from "@/services/feedbackServices";
import { Question } from "@/types/models";

// Shadcn/ui & Lucide Icons
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ListFilter,
  AlertTriangle,
  Trash2,
  Loader2,
} from "lucide-react";
import { grades, Subjects } from "./Data";
import QuestionTable from "./QuestionTable";

// Your existing table component

// Type for the fetching status
type Status = "pending" | "success" | "error";

// Type for our filter state
interface Filters {
  subjects: string[];
  grades: string[];
}

export default function QuestionsPage() {
  const [questions, setQuestions] = React.useState<Question[]>([]);
  const [status, setStatus] = React.useState<Status>("pending");
  const [filters, setFilters] = React.useState<Filters>({
    subjects: [],
    grades: [],
  });
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set()
  );
  const [bulkConfirmOpen, setBulkConfirmOpen] = React.useState(false);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [bulkError, setBulkError] = React.useState<string | null>(null);
  const [bulkResult, setBulkResult] =
    React.useState<BulkDeleteQuestionsResult | null>(null);

  // "Delete all" is a separate, more destructive action than deleting the
  // current selection: it removes every stored question in one call.
  const [deleteAllOpen, setDeleteAllOpen] = React.useState(false);
  const [deleteAllBusy, setDeleteAllBusy] = React.useState(false);

  // Fetch data on component mount
  React.useEffect(() => {
    const fetchQuestions = async () => {
      setStatus("pending");
      try {
        const data = await getQuestions();
        setQuestions(data);
        setStatus("success");
      } catch (error) {
        console.error("Failed to fetch questions:", error);
        setStatus("error");
      }
    };
    fetchQuestions();
  }, []);

  const toggleSelected = (questionId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
  };

  const toggleSelectedMany = (questionIds: string[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      questionIds.forEach((id) => (selected ? next.add(id) : next.delete(id)));
      return next;
    });
  };

  // Handler for updating a filter category
  const handleFilterChange = (category: keyof Filters, value: string) => {
    setFilters((prev) => {
      const currentValues = prev[category];
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value];
      return { ...prev, [category]: newValues };
    });
  };

  // Stored subjects are lowercase slugs ("math") while the filter list shows
  // display labels ("Mathematics"); normalize both sides before comparing.
  const subjectKey = (s: string) => {
    const k = s.toLowerCase().replace(/[^a-z]/g, "");
    return k.startsWith("math") ? "math" : k;
  };
  // Grades are stored as ranges ("9-10"); a filter matches any token.
  const gradeKeys = (g: string) => g.split(/[^0-9]+/).filter(Boolean);

  // Memoize the filtered results for performance
  const filteredQuestions = React.useMemo(() => {
    return questions.filter((question) => {
      const subjectMatch =
        filters.subjects.length === 0 ||
        filters.subjects.some((f) => subjectKey(f) === subjectKey(question.subject));
      const gradeMatch =
        filters.grades.length === 0 ||
        filters.grades.some((g) => gradeKeys(question.grade).includes(g));

      return subjectMatch && gradeMatch;
    });
  }, [questions, filters]);

  const handleQuestionDeleted = (deletedQuestionId: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== deletedQuestionId));
    toggleSelected(deletedQuestionId, false);
  };

  // Selection is scoped to the filtered list so the button count and the
  // request payload always agree.
  const selectedVisibleIds = React.useMemo(() => {
    const visible = new Set(
      filteredQuestions.map((q) => q.id).filter((id): id is string => Boolean(id))
    );
    return [...selectedIds].filter((id) => visible.has(id));
  }, [selectedIds, filteredQuestions]);

  // ONE round-trip to POST /api/question/multiple-delete for the whole selection.
  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    setBulkError(null);
    try {
      const result = await deleteQuestions(selectedVisibleIds);
      const removed = new Set(result.deleted);
      setQuestions((prev) => prev.filter((q) => !q.id || !removed.has(q.id)));
      setSelectedIds(new Set(result.failed.map((f) => f.id)));
      setBulkResult(result);
      setBulkConfirmOpen(false);
      document.body.style.pointerEvents = "";
    } catch (e) {
      setBulkResult(null);
      setBulkError(describeApiError(e, "Bulk delete"));
      setBulkConfirmOpen(false);
      document.body.style.pointerEvents = "";
    } finally {
      setBulkDeleting(false);
    }
  };

  // Remove every stored question. The backend chunks the work, so this is safe
  // for a large bank. On success the list empties (any ids that failed are
  // reported and the remaining rows stay).
  const handleDeleteAll = async () => {
    setDeleteAllBusy(true);
    setBulkError(null);
    try {
      const result = await deleteAllQuestions();
      const removed = new Set(result.deleted);
      setQuestions((prev) => prev.filter((q) => !q.id || !removed.has(q.id)));
      // Clear any selection; failed ids are surfaced via the result alert.
      setSelectedIds(new Set());
      setBulkResult(result);
      setDeleteAllOpen(false);
      document.body.style.pointerEvents = "";
    } catch (e) {
      setBulkResult(null);
      setBulkError(describeApiError(e, "Delete all"));
      setDeleteAllOpen(false);
      document.body.style.pointerEvents = "";
    } finally {
      setDeleteAllBusy(false);
    }
  };

  const renderContent = () => {
    switch (status) {
      case "pending":
        // Show skeleton loaders for a better loading experience
        return (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        );
      case "error":
        return (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              Failed to load questions. Please try refreshing the page.
            </AlertDescription>
          </Alert>
        );
      case "success":
        return filteredQuestions.length > 0 ? (
          <QuestionTable
            questions={filteredQuestions}
            onQuestionDeleted={handleQuestionDeleted}
            selectedIds={selectedIds}
            onToggleSelected={toggleSelected}
            onToggleSelectedMany={toggleSelectedMany}
          />
        ) : (
          <div className="text-center py-16">
            <h3 className="text-lg font-semibold">No Questions Found</h3>
            <p className="text-muted-foreground">
              Try adjusting your filters or adding new questions.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Questions</h1>
        <p className="text-muted-foreground">
          Browse, filter, and manage all questions.
        </p>
      </div>

      {bulkError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{bulkError}</AlertDescription>
        </Alert>
      )}

      {bulkResult && (
        <Alert variant={bulkResult.failed.length > 0 ? "destructive" : "default"}>
          <AlertDescription>
            <span>Deleted {bulkResult.deleted.length} question(s).</span>
            {bulkResult.failed.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="font-medium">
                  {bulkResult.failed.length} failed:
                </p>
                <ul className="list-disc space-y-0.5 pl-5 text-xs">
                  {bulkResult.failed.map((f) => (
                    <li key={f.id} className="break-all">
                      <span className="font-mono">{f.id}</span> — {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="min-w-0 break-words">
            All Questions ({filteredQuestions.length})
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {/* Bulk delete: single multiple-delete call for the selection */}
              <AlertDialog
                open={bulkConfirmOpen}
                onOpenChange={(open) => {
                  if (!bulkDeleting) setBulkConfirmOpen(open);
                }}
              >
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1"
                  disabled={selectedVisibleIds.length === 0 || bulkDeleting}
                  onClick={() => {
                    setBulkResult(null);
                    setBulkError(null);
                    setBulkConfirmOpen(true);
                  }}
                >
                  {bulkDeleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Delete selected ({selectedVisibleIds.length})
                </Button>
                <AlertDialogContent className="max-w-[calc(100vw-2rem)]">
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete {selectedVisibleIds.length} selected question(s)?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      This cannot be undone. Unsuccessful ids stay selected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleBulkDelete}
                    >
                      {bulkDeleting ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {selectedVisibleIds.length > MAX_BULK_DELETE_IDS && (
                <span className="text-xs text-destructive">
                  Max {MAX_BULK_DELETE_IDS} per request
                </span>
              )}

              {/* Delete all: removes every stored question, not just the selection */}
              <AlertDialog
                open={deleteAllOpen}
                onOpenChange={(open) => {
                  if (!deleteAllBusy) setDeleteAllOpen(open);
                }}
              >
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-1 border-destructive/50"
                  disabled={filteredQuestions.length === 0 || deleteAllBusy}
                  onClick={() => {
                    setBulkResult(null);
                    setBulkError(null);
                    setDeleteAllOpen(true);
                  }}
                >
                  {deleteAllBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Delete all
                </Button>
                <AlertDialogContent className="max-w-[calc(100vw-2rem)]">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all questions?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes every stored question
                      ({filteredQuestions.length} shown{filters.subjects.length || filters.grades.length ? " after filters" : " total"}). This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleDeleteAll}
                    >
                      {deleteAllBusy ? "Deleting..." : "Delete all"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Subject Filter Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-1">
                    <ListFilter className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                      Subject{" "}
                      {filters.subjects.length > 0 &&
                        `(${filters.subjects.length})`}
                    </span>
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  className="max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto"
                >
                  <DropdownMenuLabel>Filter by Subject</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {Subjects.map((subject) => (
                    <DropdownMenuCheckboxItem
                      key={subject}
                      checked={filters.subjects.includes(subject)}
                      onCheckedChange={() =>
                        handleFilterChange("subjects", subject)
                      }
                    >
                      {subject}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Grade Filter Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-1">
                    <ListFilter className="h-3.5 w-3.5" />
                    <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                      Grade{" "}
                      {filters.grades.length > 0 &&
                        `(${filters.grades.length})`}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto"
                >
                  <DropdownMenuLabel>Filter by Grade</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {grades.map((grade) => (
                    <DropdownMenuCheckboxItem
                      key={grade}
                      checked={filters.grades.includes(grade)}
                      onCheckedChange={() =>
                        handleFilterChange("grades", grade)
                      }
                    >
                      {grade}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Clear Filters Button */}
              {(filters.subjects.length > 0 || filters.grades.length > 0) && (
                <Button
                  variant="ghost"
                  onClick={() => setFilters({ subjects: [], grades: [] })}
                >
                  Clear filters
                </Button>
              )}
          </div>
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>
    </div>
  );
}
