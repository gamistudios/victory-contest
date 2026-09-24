import * as React from "react";
import { getQuestions } from "@/lib/utils"; // Your server action
import { Question } from "@/types/models";

// Shadcn/ui & Lucide Icons
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ListFilter, AlertTriangle } from "lucide-react";
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

  // Memoize the filtered results for performance
  const filteredQuestions = React.useMemo(() => {
    return questions.filter((question) => {
      const subjectMatch =
        filters.subjects.length === 0 ||
        filters.subjects.includes(question.subject);
      const gradeMatch =
        filters.grades.length === 0 ||
        filters.grades.some((g) => g.split(" ")[1] === question.grade);

      return subjectMatch && gradeMatch;
    });
  }, [questions, filters]);

  const handleQuestionDeleted = (deletedQuestionId: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== deletedQuestionId));
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
        <h1 className="text-3xl font-bold tracking-tight">Questions</h1>
        <p className="text-muted-foreground">
          Browse, filter, and manage all questions.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Questions ({filteredQuestions.length})</CardTitle>
            <div className="flex items-center gap-2">
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
                <DropdownMenuContent align="end">
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
                <DropdownMenuContent align="end">
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
          </div>
        </CardHeader>
        <CardContent>{renderContent()}</CardContent>
      </Card>
    </div>
  );
}
