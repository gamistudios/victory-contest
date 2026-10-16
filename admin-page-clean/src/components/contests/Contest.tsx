// src/pages/ContestPage.tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListFilter } from "lucide-react";
import { ContestList } from "@/components/contests/ContestList";
import { Leaderboard } from "@/components/contests/Leaderboard";
import { useCatalogLists } from "@/hooks/useCatalogLists";
import { useScopeFilterOptions } from "@/hooks/useScopeFilter";

// Define the filter state type
interface ContestFilters {
  grades: string[];
  subjects: string[];
  programs: string[];
  kinds: string[];
}

export default function ContestPage() {
  const { grades, Subjects } = useCatalogLists();
  const scopeOptions = useScopeFilterOptions();
  const [filters, setFilters] = useState<ContestFilters>({
    grades: [],
    subjects: [],
    programs: [],
    kinds: [],
  });

  const handleFilterChange = (
    category: keyof ContestFilters,
    value: string
  ) => {
    setFilters((prev) => {
      const currentValues = prev[category];
      const newValues = currentValues.includes(value)
        ? currentValues.filter((v) => v !== value)
        : [...currentValues, value];
      return { ...prev, [category]: newValues };
    });
  };

  const clearFilters = () => setFilters({ grades: [], subjects: [], programs: [], kinds: [] });
  const hasFilters =
    filters.grades.length > 0 || filters.subjects.length > 0 || filters.programs.length > 0 || filters.kinds.length > 0;

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Contests
          </h1>
          <p className="text-muted-foreground">
            Browse contests and view top player rankings.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-0">
          {/* Grade Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-1">
                <ListFilter className="h-3.5 w-3.5" />
                <span>
                  Grade{" "}
                  {filters.grades.length > 0 && `(${filters.grades.length})`}
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
                  onCheckedChange={() => handleFilterChange("grades", grade)}
                >
                  {grade}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Subject Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-1">
                <ListFilter className="h-3.5 w-3.5" />
                <span>
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

          {/* Program (scope) Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-1">
                <ListFilter className="h-3.5 w-3.5" />
                <span>Program {filters.programs.length > 0 && `(${filters.programs.length})`}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by Program</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {scopeOptions.programs.map((p) => (
                <DropdownMenuCheckboxItem key={p.id} checked={filters.programs.includes(p.id)} onCheckedChange={() => handleFilterChange("programs", p.id)}>
                  {p.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Kind Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-1">
                <ListFilter className="h-3.5 w-3.5" />
                <span>Kind {filters.kinds.length > 0 && `(${filters.kinds.length})`}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Filter by Kind</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {scopeOptions.kinds.map((k) => (
                <DropdownMenuCheckboxItem key={k} checked={filters.kinds.includes(k)} onCheckedChange={() => handleFilterChange("kinds", k)}>
                  {k.replace("_", " ")}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {hasFilters && (
            <Button variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3 lg:gap-8">
        <div className="lg:col-span-2">
          <ContestList filters={filters} />
        </div>
        <div className="lg:col-span-1">
          <Leaderboard />
        </div>
      </div>
    </div>
  );
}
