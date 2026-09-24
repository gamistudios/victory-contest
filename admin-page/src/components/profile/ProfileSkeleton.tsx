import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl">
        {/* Header Skeleton */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between">
              <div>
                <Skeleton className="h-8 w-48 mb-2" />
                <Skeleton className="h-4 w-64" />
              </div>
            </div>
          </div>
        </div>
        {/* Profile Card Skeleton */}
        <div className="bg-white shadow-sm border border-gray-200 rounded-lg overflow-hidden">
          {/* Profile Header Skeleton */}
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-8 py-12">
            <div className="flex items-center space-x-6">
              <Skeleton className="w-24 h-24 rounded-full bg-emerald-500" />
              <div className="flex-1">
                <Skeleton className="h-8 w-48 mb-2 bg-emerald-500" />
                <div className="flex items-center space-x-6">
                  <Skeleton className="h-4 w-20 bg-emerald-500" />
                  <Skeleton className="h-4 w-16 bg-emerald-500" />
                  <Skeleton className="h-4 w-24 bg-emerald-500" />
                </div>
              </div>
              <Skeleton className="h-8 w-32 bg-emerald-500" />
            </div>
          </div>

          {/* Profile Details Skeleton */}
          <div className="bg-gray-50 px-8 py-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-4">
                  <Skeleton className="h-4 w-32" />
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-8 pb-8 mt-8">
          {/* Stats Cards Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {Array.from({ length: 4 }).map((_, index) => (
              <Card key={index} className="bg-white border border-gray-200">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-10 rounded-lg" />
                </CardHeader>
                <CardContent className="pt-0">
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Main Content Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Payment Management Skeleton */}
            <div className="lg:col-span-1">
              <Card className="bg-white border border-gray-200">
                <CardHeader className="border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-emerald-100">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="h-10 w-10 rounded-xl" />
                    <div>
                      <Skeleton className="h-6 w-40 mb-2" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-4">
                    <Skeleton className="h-32 w-full rounded-xl" />
                    <div className="space-y-4">
                      <Skeleton className="h-6 w-32" />
                      <div className="space-y-4">
                        <Skeleton className="h-20 w-full rounded-xl" />
                        <Skeleton className="h-20 w-full rounded-xl" />
                      </div>
                    </div>
                    <Skeleton className="h-20 w-full rounded-xl" />
                    <div className="space-y-4">
                      <Skeleton className="h-12 w-full rounded-xl" />
                      <Skeleton className="h-12 w-full rounded-xl" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Contest Statistics Skeleton */}
            <div className="lg:col-span-2">
              <Card className="bg-white border border-gray-200">
                <CardHeader className="border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <Skeleton className="h-6 w-48" />
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-6">
                    <Skeleton className="h-10 w-full rounded-lg" />
                    <Skeleton className="h-80 w-full rounded-lg" />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <Skeleton
                          key={index}
                          className="h-24 w-full rounded-lg"
                        />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
