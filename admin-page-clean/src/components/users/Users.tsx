import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

// Your services and data
import { getAllStudents } from "@/services/studentServices";
import { getAdminCatalog, type AdminCatalog } from "@/services/catalogServices";
import { UserAccessSheet } from "./UserAccessSheet";

// Shadcn/ui & Lucide Icons
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Info,
  ShieldCheck,
  AlertTriangle,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";
import { Student } from "@/types/models";

// Type definitions
type Status = "pending" | "success" | "error";
interface Filters {
  search: string;
  grade: string;
  program: string;
  stream: string;
  region: string;
  city: string;
  payment: string;
}

const ALL = "all";

// GET /api/student/ derives is_premium server-side from the student's
// unexpired approved payments; the list row carries no payment object, so any
// payment_date-style field read here would always be undefined.
const getPaymentStatus = (
  student: Student
): { label: string; variant: "default" | "secondary" | "destructive" } => {
  if (student.is_premium) {
    return { label: "Paid", variant: "default" };
  }
  return { label: "Unpaid", variant: "destructive" };
};

export default function UserListPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [status, setStatus] = useState<Status>("pending");
  const [filters, setFilters] = useState<Filters>({
    search: "",
    grade: ALL,
    program: ALL,
    stream: ALL,
    region: ALL,
    city: ALL,
    payment: ALL,
  });
  const [catalog, setCatalog] = useState<AdminCatalog | null>(null);
  const [accessFor, setAccessFor] = useState<Student | null>(null);
  useEffect(() => {
    getAdminCatalog().then(setCatalog).catch(() => setCatalog(null));
  }, []);

  // Data fetching
  useEffect(() => {
    const fetchStudents = async () => {
      setStatus("pending");
      try {
        const studentData = await getAllStudents();
        setStudents(studentData);
        setStatus("success");
      } catch (error) {
        console.error("Failed to fetch students:", error);
        setStatus("error");
      }
    };
    fetchStudents();
  }, []);

  // Handlers for updating filters
  const handleFilterChange = (filterName: keyof Filters, value: string) => {
    setFilters((prev) => {
      const next = { ...prev, [filterName]: value };
      if (filterName === "region") next.city = ALL; // cities depend on the region
      if (filterName === "program") next.stream = ALL;
      return next;
    });
    setPageIndex(0);
  };

  // Options come from the catalog (programs, streams, locations), never hardcoded.
  const gradeOptions = useMemo(() => {
    const g = new Set<string>();
    students.forEach((s) => s.grade != null && g.add(String(s.grade)));
    return [...g].sort((a, b) => Number(a) - Number(b));
  }, [students]);
  const programOptions = useMemo(() => (catalog?.programs ?? []).filter((p) => p.is_active), [catalog]);
  const streamOptions = useMemo(() => {
    const p = programOptions.find((x) => x.id === filters.program);
    return (catalog?.streams ?? []).filter((s) => (p ? (p.available_streams ?? []).includes(s.id) : true));
  }, [catalog, programOptions, filters.program]);
  const regionOptions = catalog?.locations?.regions ?? [];
  const cityOptions = regionOptions.find((r) => r.id === filters.region)?.cities ?? regionOptions.flatMap((r) => r.cities);

  // Memoized filtering for performance
  const filteredStudents = useMemo(() => {
    return (
      students
        .filter((student) => filters.grade === ALL || String(student.grade) === filters.grade)
        .filter((student) => {
          if (filters.program === ALL) return true;
          const enrolled = (student.enrollments ?? []).filter((e) => e.program_id === filters.program);
          const inProgram = student.primary_program_id === filters.program || enrolled.length > 0;
          if (!inProgram) return false;
          return filters.stream === ALL || enrolled.some((e) => e.stream_id === filters.stream);
        })
        .filter((student) => filters.region === ALL || student.region_id === filters.region)
        .filter((student) => filters.city === ALL || student.city_id === filters.city)
        .filter((student) => filters.payment === ALL || (filters.payment === "paid") === !!student.is_premium)
        .filter((student) =>
          student.name.toLowerCase().includes(filters.search.toLowerCase())
        )
    );
  }, [students, filters]);

  // Pagination State
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const pageCount = Math.ceil(filteredStudents.length / pageSize);
  const paginatedStudents = useMemo(() => {
    const start = pageIndex * pageSize;
    return filteredStudents.slice(start, start + pageSize);
  }, [filteredStudents, pageIndex, pageSize]);

  // Render different states: Loading, Error, Success
  const renderTableContent = () => {
    if (status === "pending") {
      return [...Array(pageSize)].map((_, i) => (
        <TableRow key={i}>
          <TableCell className="flex items-center gap-2 sm:gap-4">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-24 sm:w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell className="hidden sm:table-cell">
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell className="hidden md:table-cell">
            <Skeleton className="h-4 w-12" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-16 rounded-full" />
          </TableCell>
          <TableCell className="text-right">
            <Skeleton className="h-8 w-8 ml-auto" />
          </TableCell>
        </TableRow>
      ));
    }

    if (status === "error") {
      return (
        <TableRow>
          <TableCell colSpan={6}>
            <Alert variant="destructive" className="my-8">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error Fetching Data</AlertTitle>
              <AlertDescription>
                There was a problem retrieving the user list. Please try again
                later.
              </AlertDescription>
            </Alert>
          </TableCell>
        </TableRow>
      );
    }

    return paginatedStudents.map((student) => {
      const payment = getPaymentStatus(student);
      return (
        <TableRow key={student.id}>
          <TableCell>
            <div className="flex items-center gap-2 sm:gap-4">
              <Avatar className="h-9 w-9 shrink-0 sm:h-10 sm:w-10">
                <AvatarImage src={student.imgurl} alt={student.name} />
                <AvatarFallback>{student.name?.charAt(0) ?? "?"}</AvatarFallback>
              </Avatar>
              <span className="font-medium break-words">{student.name}</span>
            </div>
          </TableCell>
          <TableCell>{student.grade}</TableCell>
          <TableCell className="hidden sm:table-cell">{student.city}</TableCell>
          <TableCell className="hidden md:table-cell">
            {student.gender}
          </TableCell>
          <TableCell>
            <Badge variant={payment.variant}>{payment.label}</Badge>
          </TableCell>
          <TableCell className="text-right">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 sm:h-9 sm:w-9"
              aria-label={`Manage ${student.name}'s access`}
              onClick={() => setAccessFor(student)}
            >
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 sm:h-9 sm:w-9"
                    aria-label={`View ${student.name}'s profile`}
                    onClick={() =>
                      navigate(`/dashboard/user/${student.telegram_id}`)
                    }
                  >
                    <Info className="h-5 w-5 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>View Profile</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TableCell>
        </TableRow>
      );
    });
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Users
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Search, filter, and manage all registered students.
        </p>
      </div>

      <Card>
        <CardHeader className="p-4 pb-0 sm:p-6 sm:pb-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name..."
                className="pl-9"
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
              />
            </div>
            <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
              {(
                [
                  { name: "program", placeholder: "Program", options: programOptions.map((p) => ({ value: p.id, label: p.name })) },
                  { name: "stream", placeholder: "Stream", options: streamOptions.map((s) => ({ value: s.id, label: s.name })) },
                  { name: "grade", placeholder: "Grade", options: gradeOptions.map((g) => ({ value: g, label: `Grade ${g}` })) },
                  { name: "region", placeholder: "Region", options: regionOptions.map((r) => ({ value: r.id, label: r.name })) },
                  { name: "city", placeholder: "City", options: cityOptions.map((c) => ({ value: c.id, label: c.name })) },
                  { name: "payment", placeholder: "Payment", options: [{ value: "paid", label: "Paid" }, { value: "unpaid", label: "Unpaid" }] },
                ] as { name: keyof Filters; placeholder: string; options: { value: string; label: string }[] }[]
              ).map((filter) => (
                <Select
                  key={filter.name}
                  value={filters[filter.name]}
                  onValueChange={(value) => handleFilterChange(filter.name, value)}
                >
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder={filter.placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value={ALL}>All {filter.placeholder.toLowerCase()}s</SelectItem>
                      {filter.options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <div className="rounded-md border">
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[35%] min-w-[9rem]">Name</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="hidden sm:table-cell">City</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Gender
                  </TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{renderTableContent()}</TableBody>
            </Table>
          </div>
          {/* Responsive pagination: rows-per-page collapses to phone-safe
              layout, first/last buttons hide below sm. */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-2 py-4">
            <div className="text-sm text-muted-foreground">
              {filteredStudents.length} total rows
            </div>
            <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-6 lg:gap-8">
              <div className="flex items-center gap-2">
                <p className="hidden text-sm font-medium sm:block">
                  Rows per page
                </p>
                <Select
                  value={`${pageSize}`}
                  onValueChange={(value) => {
                    setPageSize(Number(value));
                    setPageIndex(0);
                  }}
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
              <div className="text-xs font-medium sm:text-sm sm:text-center">
                Page {pageIndex + 1} of {Math.max(pageCount, 1)}
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <Button
                  variant="outline"
                  className="hidden h-8 w-8 p-0 sm:inline-flex"
                  onClick={() => setPageIndex(0)}
                  disabled={pageIndex === 0}
                  aria-label="First page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setPageIndex(pageIndex - 1)}
                  disabled={pageIndex === 0}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="h-8 w-8 p-0"
                  onClick={() => setPageIndex(pageIndex + 1)}
                  disabled={pageIndex >= pageCount - 1}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="hidden h-8 w-8 p-0 sm:inline-flex"
                  onClick={() => setPageIndex(pageCount - 1)}
                  disabled={pageIndex >= pageCount - 1}
                  aria-label="Last page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <UserAccessSheet
        student={accessFor}
        catalog={catalog}
        onOpenChange={(o) => !o && setAccessFor(null)}
        onChanged={() => getAllStudents().then(setStudents).catch(() => undefined)}
      />
    </div>
  );
}
