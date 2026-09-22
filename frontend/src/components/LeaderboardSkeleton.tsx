import { Skeleton } from "../components/ui/skeleton";

export function LeaderboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-4xl px-3 sm:px-6 lg:px-8">
      <main className="mt-6 pb-4">
        {/* Podium Skeleton */}
        <div className="flex justify-center items-end gap-2 sm:gap-4 md:gap-8 mb-10 animate-pulse">
          {/* 2nd Place */}
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-14 w-14 sm:h-20 sm:w-20 rounded-full dark:bg-gray-700 mb-1" />
            <Skeleton className="h-5 w-20 sm:w-28 rounded-md dark:bg-gray-700" />
            <Skeleton className="h-4 w-14 sm:w-20 rounded-md dark:bg-gray-700" />
          </div>

          {/* 1st Place */}
          <div className="flex flex-col items-center gap-2 z-10">
            <Skeleton className="h-16 w-16 sm:h-24 sm:w-24 mb-1 rounded-full dark:bg-gray-700" />
            <Skeleton className="h-5 w-24 sm:w-32 rounded-md dark:bg-gray-700" />
            <Skeleton className="h-4 w-16 sm:w-24 rounded-md dark:bg-gray-700" />
          </div>

          {/* 3rd Place */}
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-14 w-14 sm:h-20 sm:w-20 mb-1 rounded-full dark:bg-gray-700" />
            <Skeleton className="h-5 w-20 sm:w-28 rounded-md dark:bg-gray-700" />
            <Skeleton className="h-4 w-14 sm:w-20 rounded-md dark:bg-gray-700" />
          </div>
        </div>

        {/* Rankings List */}
        <div>
          <Skeleton className="h-7 w-36 mb-4 rounded-md dark:bg-gray-700" />
          <div className="space-y-2 rounded-xl">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="p-3 sm:p-4 rounded-xl bg-card dark:bg-gray-800 flex items-center justify-between"
              >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                  <Skeleton className="h-6 w-6 dark:bg-gray-700 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <Skeleton className="h-5 w-24 sm:w-32 mb-1.5 rounded-md dark:bg-gray-700" />
                    <Skeleton className="h-4 w-16 sm:w-20 rounded-md dark:bg-gray-700" />
                  </div>
                </div>
                <div className="flex items-center space-x-2 sm:space-x-4">
                  <Skeleton className="h-8 w-16 sm:w-20 rounded-md dark:bg-gray-700" />
                  <Skeleton className="h-8 w-16 sm:w-20 rounded-md dark:bg-gray-700" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Performance Summary */}
      <div className="mt-6 p-3 sm:p-4 rounded-xl border">
        <Skeleton className="h-5 w-32 mb-4 dark:bg-gray-700 rounded-md" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="text-center flex flex-col items-center gap-2">
            <Skeleton className="h-7 w-10 sm:w-12 rounded-md dark:bg-gray-700" />
            <Skeleton className="h-4 w-20 rounded-md dark:bg-gray-700" />
          </div>
          <div className="text-center flex flex-col items-center gap-2">
            <Skeleton className="h-7 w-12 sm:w-16 rounded-md dark:bg-gray-700" />
            <Skeleton className="h-4 w-14 sm:w-16 rounded-md dark:bg-gray-700" />
          </div>
        </div>
      </div>
    </div>
  );
}
