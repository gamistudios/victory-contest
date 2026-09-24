// src/components/contests/ContestList.tsx
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

// Shadcn/ui & Lucide Icons
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Calendar,
  Circle,
  ArrowRight,
  AlertTriangle,
  Inbox,
} from "lucide-react";
import { getContests } from "@/services/contestServices";

// Helper to determine contest status
const getContestStatus = (
  contestDateStr: string | undefined
): { text: string; variant: "default" | "destructive" | "secondary" } => {
  if (!contestDateStr) return { text: "No Date", variant: "secondary" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const contestDate = new Date(contestDateStr);
  contestDate.setHours(0, 0, 0, 0);

  return contestDate >= today
    ? { text: "Active", variant: "default" }
    : { text: "Past", variant: "destructive" };
};

export function ContestList({
  filters,
}: {
  filters: { grades: string[]; subjects: string[] };
}) {
  const { data: contests, status } = useQuery({
    queryKey: ["contests"],
    queryFn: getContests,
  });

  const filteredContests = useMemo(() => {
    if (!contests) return [];
    return contests.filter((contest) => {
      const gradeMatch =
        filters.grades.length === 0 || filters.grades.includes(contest.grade);
      const subjectMatch =
        filters.subjects.length === 0 ||
        filters.subjects.includes(contest.subject);
      return gradeMatch && subjectMatch;
    });
  }, [contests, filters]);

  if (status === "pending") {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (status === "error") {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          Failed to load contests. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  if (filteredContests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 rounded-lg border-2 border-dashed h-64">
        <Inbox className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">No Contests Found</h3>
        <p className="text-muted-foreground">
          Try adjusting your filters or check back later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filteredContests.map((contest) => {
        const status = getContestStatus(contest.start_time);
        return (
          <Link
            to={`/dashboard/contest/${contest.id}`}
            key={contest.id}
            className="block group"
          >
            <Card className="transition-all duration-200 group-hover:border-primary group-hover:shadow-md">
              <CardHeader>
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <CardTitle className="text-lg font-bold group-hover:text-primary">
                      {contest.title}
                    </CardTitle>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {contest.start_time
                            ? new Date(contest.start_time).toLocaleDateString()
                            : "TBD"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Circle
                          className={`h-3 w-3 ${
                            status.variant === "default"
                              ? "text-green-500"
                              : "text-red-500"
                          }`}
                        />
                        <span>{status.text}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center h-full">
                    <ArrowRight className="h-5 w-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </div>
                </div>
              </CardHeader>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
