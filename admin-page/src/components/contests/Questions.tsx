// src/components/questions/SelectableQuestionsTable.tsx
import { useState, useEffect, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";

// Shadcn/ui & Lucide Icons
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Search, AlertTriangle, Inbox } from "lucide-react";
import { getQuestions } from "@/lib/utils";
import { Question } from "@/types/models";
import { DataTablePagination } from "../questions/QuestionTable";

// Reusable Pagination Component from previous step

// Type Definitions
type Status = "pending" | "success" | "error";
interface Filters {
  grade: string;
  subject: string;
  searchText: string;
}
interface SelectableQuestionsTableProps {
  onSelectionChange: (selectedQuestions: Question[]) => void;
}

export default function SelectableQuestionsTable({
  onSelectionChange,
}: SelectableQuestionsTableProps) {
  const [status, setStatus] = useState<Status>("pending");
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const [filters, setFilters] = useState<Filters>({
    grade: "all",
    subject: "all",
    searchText: "",
  });

  const debouncedSearchText = useDebounce(filters.searchText, 300);

  useEffect(() => {
    const fetchQuestions = async () => {
      setStatus("pending");
      try {
        const data = await getQuestions();
        setAllQuestions(data);
        setStatus("success");
      } catch (error) {
        console.error("Failed to fetch questions:", error);
        setStatus("error");
      }
    };
    fetchQuestions();
  }, []);

  const filteredQuestions = useMemo(() => {
    return allQuestions.filter(
      (q) =>
        (filters.grade === "all" || q.grade === filters.grade) &&
        (filters.subject === "all" || q.subject === filters.subject) &&
        q.question_text
          .toLowerCase()
          .includes(debouncedSearchText.toLowerCase())
    );
  }, [allQuestions, filters.grade, filters.subject, debouncedSearchText]);

  useEffect(() => {
    const selectedIds = Object.keys(rowSelection).filter(
      (id) => rowSelection[id]
    );
    const selectedQuestions = allQuestions.filter((q) =>
      selectedIds.includes(q.id!)
    );
    onSelectionChange(selectedQuestions);
  }, [rowSelection, allQuestions, onSelectionChange]);

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const pageCount = Math.ceil(filteredQuestions.length / pageSize);
  const paginatedQuestions = useMemo(() => {
    const start = pageIndex * pageSize;
    return filteredQuestions.slice(start, start + pageSize);
  }, [filteredQuestions, pageIndex, pageSize]);

  const uniqueSubjects = useMemo(
    () => [...new Set(allQuestions.map((q) => q.subject))],
    [allQuestions]
  );
  const uniqueGrades = useMemo(
    () => [...new Set(allQuestions.map((q) => q.grade))].sort(),
    [allQuestions]
  );

  const renderContent = () => {
    if (status === "pending") {
      return [...Array(pageSize)].map((_, i) => (
        <TableRow key={i}>
          <TableCell className="w-12">
            <Skeleton className="h-5 w-5" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>{" "}
          {/* NEW */}
        </TableRow>
      ));
    }

    if (status === "error") {
      return (
        <TableRow>
          <TableCell colSpan={5}>
            {" "}
            {/* UPDATED */}
            <Alert variant="destructive" className="my-8">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Fetching Questions</AlertTitle>
              <AlertDescription>
                There was a problem. Please try refreshing the page.
              </AlertDescription>
            </Alert>
          </TableCell>
        </TableRow>
      );
    }

    if (paginatedQuestions.length === 0) {
      return (
        <TableRow>
          <TableCell colSpan={5} className="h-48 text-center">
            {" "}
            {/* UPDATED */}
            <Inbox className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No Questions Found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search or filter criteria.
            </p>
          </TableCell>
        </TableRow>
      );
    }

    return paginatedQuestions.map((q) => (
      <TableRow key={q.id}>
        <TableCell>
          <Checkbox
            checked={rowSelection[q.id!] || false}
            onCheckedChange={(value) =>
              setRowSelection((prev) => ({ ...prev, [q.id!]: !!value }))
            }
          />
        </TableCell>
        <TableCell className="font-medium">{q.question_text}</TableCell>
        <TableCell>{q.subject}</TableCell>
        <TableCell>{q.grade}</TableCell>
        <TableCell>{q.chapter}</TableCell> {/* NEW */}
      </TableRow>
    ));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Questions</CardTitle>
        <CardDescription>
          Filter and select questions to add to the contest.
        </CardDescription>
        <div className="mt-4 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by question text..."
              className="pl-9"
              value={filters.searchText}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, searchText: e.target.value }))
              }
            />
          </div>
          <Select
            value={filters.subject}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, subject: value }))
            }
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by subject" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All Subjects</SelectItem>
                {uniqueSubjects.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={filters.grade}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, grade: value }))
            }
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Filter by grade" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All Grades</SelectItem>
                {uniqueGrades.map((g) => (
                  <SelectItem key={g} value={g}>
                    Grade {g}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      Object.keys(rowSelection).length > 0 &&
                      Object.keys(rowSelection).length ===
                        filteredQuestions.length
                    }
                    onCheckedChange={(value) => {
                      const newSelection: Record<string, boolean> = {};
                      if (!!value) {
                        filteredQuestions.forEach(
                          (q) => (newSelection[q.id!] = true)
                        );
                      }
                      setRowSelection(newSelection);
                    }}
                  />
                </TableHead>
                <TableHead className="w-[50%]">Question</TableHead>{" "}
                {/* UPDATED */}
                <TableHead>Subject</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Chapter</TableHead> {/* NEW */}
              </TableRow>
            </TableHeader>
            <TableBody>{renderContent()}</TableBody>
          </Table>
        </div>
        <DataTablePagination
          pageIndex={pageIndex}
          pageCount={pageCount}
          pageSize={pageSize}
          setPageIndex={setPageIndex}
          setPageSize={setPageSize}
          itemCount={filteredQuestions.length}
        />
      </CardContent>
    </Card>
  );
}
