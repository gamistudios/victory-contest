import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
} from "lucide-react";
import React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Question } from "@/types/models";
import { deleteQusetion } from "@/lib/utils";

interface QuestionTableProps {
  questions: Question[];
  onQuestionDeleted: (questionId: string) => void;
}

export default function QuestionTable({
  questions,
  onQuestionDeleted,
}: QuestionTableProps) {
  const [pageIndex, setPageIndex] = React.useState(0);
  const [pageSize, setPageSize] = React.useState(10);

  const pageCount = Math.ceil(questions.length / pageSize);

  const paginatedQuestions = React.useMemo(() => {
    const start = pageIndex * pageSize;
    return questions.slice(start, start + pageSize);
  }, [questions, pageIndex, pageSize]);

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[60%]">Question</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Chapter</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedQuestions.map((question) => (
              <TableRow key={question.id}>
                <TableCell className="font-medium truncate max-w-sm">
                  {question.question_text}
                </TableCell>
                <TableCell>{question.subject}</TableCell>
                <TableCell>{question.grade}</TableCell>
                <TableCell>{question.chapter}</TableCell>
                <TableCell className="text-right">
                  <QuestionActions
                    question={question}
                    onQuestionDeleted={onQuestionDeleted}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <DataTablePagination
        pageIndex={pageIndex}
        pageCount={pageCount}
        pageSize={pageSize}
        setPageIndex={setPageIndex}
        setPageSize={setPageSize}
        itemCount={questions.length}
      />
    </div>
  );
}
interface QuestionActionsProps {
  question: Question;
  onQuestionDeleted: (questionId: string) => void;
}

export function QuestionActions({
  question,
  onQuestionDeleted,
}: QuestionActionsProps) {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [alertOpen, setAlertOpen] = React.useState(false);

  // Monitor and force reset pointer-events on body
  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      const bodyStyle = window.getComputedStyle(document.body);
      if (bodyStyle.pointerEvents === "none" && !dialogOpen && !alertOpen) {
        console.log("Forcing pointer-events reset in QuestionTable");
        document.body.style.pointerEvents = "";
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style"],
    });

    return () => observer.disconnect();
  }, [dialogOpen, alertOpen]);

  // Additional cleanup when dialogs close
  React.useEffect(() => {
    if (!dialogOpen && !alertOpen) {
      const cleanup = () => {
        document.body.style.pointerEvents = "";
      };

      cleanup();
      setTimeout(cleanup, 50);
      setTimeout(cleanup, 150);
      setTimeout(cleanup, 300);
    }
  }, [dialogOpen, alertOpen]);

  const handleEdit = () => {
    const params = new URLSearchParams();
    params.set("edit", "true");
    params.set("question", JSON.stringify(question));
    navigate(`/dashboard/addquestion?${params.toString()}`);
  };

  const handleDelete = async () => {
    if (!question.id) return;
    setIsDeleting(true);
    const promise = deleteQusetion(question.id);

    toast.promise(promise, {
      loading: "Deleting question...",
      success: () => {
        onQuestionDeleted(question.id!);
        setAlertOpen(false);
        document.body.style.pointerEvents = "";
        return "Question deleted successfully.";
      },
      error: "Failed to delete question.",
      finally: () => {
        setIsDeleting(false);
        document.body.style.pointerEvents = "";
      },
    });
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>

            {/* NEW: View Details Item */}
            <DialogTrigger asChild>
              <DropdownMenuItem>
                <Eye className="mr-2 h-4 w-4" />
                <span>View Details</span>
              </DropdownMenuItem>
            </DialogTrigger>

            <DropdownMenuItem onClick={handleEdit}>
              <Pencil className="mr-2 h-4 w-4" />
              <span>Edit</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <AlertDialogTrigger asChild>
              <DropdownMenuItem className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Delete</span>
              </DropdownMenuItem>
            </AlertDialogTrigger>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              question.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg leading-relaxed">
            {question.question_text}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 pt-2">
            <Badge variant="outline">{question.subject}</Badge>
            <Badge variant="outline">Grade {question.grade}</Badge>
            <Badge variant="outline">{question.chapter}</Badge>
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-6">
          <div>
            <h4 className="font-semibold mb-3">Options</h4>
            <div className="space-y-2">
              {question.multiple_choice.map((choice, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-3 p-3 rounded-md border ${
                    question.answer === index + 1
                      ? "border-green-300 bg-green-50"
                      : ""
                  }`}
                >
                  {question.answer === index + 1 && (
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  )}
                  <p className="flex-1">{choice}</p>
                </div>
              ))}
            </div>
          </div>

          {question.explanation && (
            <div>
              <h4 className="font-semibold mb-2">Explanation</h4>
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                {question.explanation}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
// components/ui/DataTablePagination.tsx

interface DataTablePaginationProps {
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  setPageIndex: (index: number) => void;
  setPageSize: (size: number) => void;
  itemCount: number;
}

export function DataTablePagination({
  pageIndex,
  pageCount,
  pageSize,
  setPageIndex,
  setPageSize,
  itemCount,
}: DataTablePaginationProps) {
  return (
    <div className="flex items-center justify-between px-2 py-4">
      <div className="flex-1 text-sm text-muted-foreground">
        {itemCount} total rows
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium">Rows per page</p>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => setPageSize(Number(value))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((size) => (
                <SelectItem key={size} value={`${size}`}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-[100px] items-center justify-center text-sm font-medium">
          Page {pageIndex + 1} of {pageCount}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => setPageIndex(0)}
            disabled={pageIndex === 0}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => setPageIndex(pageIndex - 1)}
            disabled={pageIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => setPageIndex(pageIndex + 1)}
            disabled={pageIndex >= pageCount - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0"
            onClick={() => setPageIndex(pageCount - 1)}
            disabled={pageIndex >= pageCount - 1}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
