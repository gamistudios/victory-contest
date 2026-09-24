import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

// Your services and data
import { getAllStudents } from "@/services/studentServices";

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
import { Search, Info, AlertTriangle } from "lucide-react";
import { DataTablePagination } from "../questions/QuestionTable";
import { Student } from "@/types/models";

// Type definitions
type Status = "pending" | "success" | "error";
interface Filters {
  search: string;
  grade: string;
  city: string;
  school: string;
}

const grades = ["Grade 12", "Grade 11", "Grade 10", "Default"];

const cities = ["Adama", "Addis Ababa", "Dire Dewa", "Bishoftu", "Default"];

// Helper function for better readability
const getPaymentStatus = (
  student: Student
): { label: string; variant: "default" | "secondary" | "destructive" } => {
  if (!student.payment?.payment_date) {
    return { label: "Unpaid", variant: "destructive" };
  }

  try {
    const paymentDate = new Date(student.payment.payment_date);
    if (isNaN(paymentDate.getTime())) {
      return { label: "Invalid Date", variant: "secondary" };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    paymentDate.setHours(0, 0, 0, 0);

    if (paymentDate >= today) {
      return { label: "Paid", variant: "default" };
    } else {
      return { label: "Expired", variant: "destructive" };
    }
  } catch (error) {
    console.warn("Error processing payment date:", error);
    return { label: "Error", variant: "secondary" };
  }
};

export default function UserListPage() {
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [status, setStatus] = useState<Status>("pending");
  const [filters, setFilters] = useState<Filters>({
    search: "",
    grade: "default",
    city: "default",
    school: "default",
  });

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
    setFilters((prev) => ({ ...prev, [filterName]: value }));
  };

  // Memoized filtering for performance
  const filteredStudents = useMemo(() => {
    return (
      students
        .filter(
          (student) =>
            filters.grade === "default" ||
            student.grade.toString().toLowerCase() === filters.grade
        )
        .filter(
          (student) =>
            filters.city === "default" ||
            (student.city ?? "").toLowerCase() === filters.city
        )
        // .filter(student => filters.school === 'default' || student.school.toLowerCase() === filters.school) // Add school to your Student type if needed
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
          <TableCell className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-24" />
          </TableCell>
          <TableCell>
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
            <div className="flex items-center gap-4">
              <Avatar>
                <AvatarImage src={student.imgurl} alt={student.name} />
                <AvatarFallback>{student.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="font-medium">{student.name}</span>
            </div>
          </TableCell>
          <TableCell>{student.grade}</TableCell>
          <TableCell>{student.city}</TableCell>
          <TableCell>{student.sex}</TableCell>
          <TableCell>
            <Badge variant={payment.variant}>{payment.label}</Badge>
          </TableCell>
          <TableCell className="text-right">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
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
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground">
          Search, filter, and manage all registered students.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name..."
                className="pl-9"
                value={filters.search}
                onChange={(e) => handleFilterChange("search", e.target.value)}
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              {[
                {
                  name: "grade",
                  placeholder: "Filter by grade",
                  options: grades,
                },
                {
                  name: "city",
                  placeholder: "Filter by city",
                  options: cities,
                },
                // { name: 'school', placeholder: 'Filter by school', options: schools },
              ].map((filter) => (
                <Select
                  key={filter.name}
                  onValueChange={(value) =>
                    handleFilterChange(filter.name as keyof Filters, value)
                  }
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder={filter.placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {filter.options.map((option) => (
                        <SelectItem key={option} value={option.toLowerCase()}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Name</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Gender</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Info</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>{renderTableContent()}</TableBody>
            </Table>
          </div>
          <DataTablePagination
            pageIndex={pageIndex}
            pageCount={pageCount}
            pageSize={pageSize}
            setPageIndex={setPageIndex}
            setPageSize={setPageSize}
            itemCount={filteredStudents.length}
          />
        </CardContent>
      </Card>
    </div>
  );
}
