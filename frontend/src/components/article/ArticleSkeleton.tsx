/**
 * A skeleton component optimized for mobile screens that mimics the
 * layout of the ArticleList while data is loading.
 */
export function ArticleListSkeletonMobile() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Skeleton for Articles List */}
      <div className="px-4 py-2 space-y-3">
        {/* Render multiple card skeletons to simulate a list */}
        {Array.from({ length: 5 }).map((_, index) => (
          <ArticleSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

/**
 * A skeleton component for a single ArticleCard, optimized for mobile.
 */
const ArticleSkeleton = () => {
  return (
    <article className="relative border border-gray-200 rounded-lg p-4 mb-3 animate-pulse">
      <div className="flex gap-3">
        {/* Thumbnail Skeleton */}
        <div className="flex-shrink-0">
          <div className="w-16 h-16 rounded-lg bg-gray-200" />
        </div>

        {/* Content Skeleton */}
        <div className="flex-1 min-w-0">
          {/* Read Time */}
          <div className="flex absolute right-3 top-3 items-center text-gray-300 text-xs">
            <div className="w-10 h-3 rounded bg-gray-200" />
          </div>

          {/* Title */}
          <div className="h-4 bg-gray-200 rounded mb-2 w-3/4" />
          <div className="h-4 bg-gray-200 rounded mb-3 w-1/2" />

          {/* Author and Date */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-gray-200" />
              <div className="h-3 w-20 bg-gray-200 rounded" />
            </div>
            <div className="h-3 w-14 bg-gray-200 rounded" />
          </div>

          {/* Tags */}
          <div className="flex gap-2 mt-2">
            <div className="h-4 w-12 bg-gray-200 rounded" />
            <div className="h-4 w-10 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    </article>
  );
};
