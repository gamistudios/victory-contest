import { Skeleton } from "./ui/skeleton";
import { Card, CardContent, CardFooter, CardHeader } from "./ui/card";

export function ContestCardSkeleton() {
  return (
    // Manually add dark mode classes for background and border
    <Card className="overflow-hidden border border-gray-200 rounded-lg mb-3 animate-pulse">
      <CardHeader>
        <div className="flex items-center justify-between">
          {/* Manually set light and dark colors for skeletons */}
          <Skeleton className="h-6 w-3/5 rounded-md bg-gray-200" />
          <Skeleton className="h-6 w-16 rounded-full bg-gray-200" />
        </div>
        <div className="space-y-2 pt-2">
          <Skeleton className="h-4 w-full rounded-md bg-gray-200" />
          <Skeleton className="h-4 w-4/5 rounded-md bg-gray-200" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[76px] w-full rounded-lg bg-gray-200" />
      </CardContent>

      <CardFooter>
        <Skeleton className="h-12 w-full rounded-md bg-gray-200" />
      </CardFooter>
    </Card>
  );
}
