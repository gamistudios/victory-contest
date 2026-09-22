import { Search, SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Button } from "../ui/button";

interface ArticleFiltersProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  statusFilter: "favourite" | "all";
  onStatusFilterChange: (status: "favourite" | "all") => void;
  authorFilter: string;
  onAuthorFilterChange: (author: string) => void;
  sortBy: string;
  onSortByChange: (sortBy: string) => void;
  sortOrder: "asc" | "desc";
  onSortOrderChange: (order: "asc" | "desc") => void;
  availableAuthors: string[];
  availableTags: string[];
  tagFilter: string;
  onTagFilterChange: (tag: string) => void;
}

export function ArticleFilters({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  authorFilter,
  onAuthorFilterChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
  availableAuthors,
  availableTags,
  tagFilter,
  onTagFilterChange,
}: ArticleFiltersProps) {
  const hasActiveFilters =
    statusFilter !== "all" || authorFilter !== "all" || tagFilter !== "all";

  return (
    <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
      {/* Search and Filter Row */}
      <div className="p-4 space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search articles..."
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-gray-50 outline-none"
          />
        </div>

        {/* Quick Filters Row */}
        <div className="flex items-center gap-2">
          {/* Status Quick Filter */}
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              onStatusFilterChange(value as "favourite" | "all")
            }
          >
            <SelectTrigger className="w-[120px] h-9 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="favourite">Favourite</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort Quick Filter */}
          <Select
            value={`${sortBy}-${sortOrder}`}
            onValueChange={(value) => {
              const [newSortBy, newSortOrder] = value.split("-");
              onSortByChange(newSortBy);
              onSortOrderChange(newSortOrder as "asc" | "desc");
            }}
          >
            <SelectTrigger className="w-[130px] h-9 text-xs">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="publishedAt-desc">Latest</SelectItem>
              <SelectItem value="publishedAt-asc">Oldest</SelectItem>
              <SelectItem value="title-asc">A-Z</SelectItem>
              <SelectItem value="title-desc">Z-A</SelectItem>
              <SelectItem value="readTime-asc">Quick Read</SelectItem>
              <SelectItem value="readTime-desc">Long Read</SelectItem>
            </SelectContent>
          </Select>

          {/* Advanced Filters Sheet */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 px-3">
                <SlidersHorizontal className="w-4 h-4 mr-1" />
                Filters
                {hasActiveFilters && (
                  <span className="ml-1 w-2 h-2 bg-blue-500 rounded-full"></span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh]">
              <SheetHeader className="mb-6">
                <SheetTitle className="text-left">Advanced Filters</SheetTitle>
              </SheetHeader>

              <div className="space-y-6">
                {/* Status Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Article Status
                  </label>
                  <Select
                    value={statusFilter}
                    onValueChange={(value) =>
                      onStatusFilterChange(value as "favourite" | "all")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="favourite">Favourite</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Author Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Author
                  </label>
                  <Select
                    value={authorFilter || "all"}
                    onValueChange={onAuthorFilterChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select author" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Authors</SelectItem>
                      {availableAuthors.map((author) => (
                        <SelectItem key={author} value={author}>
                          {author}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Tag Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Tags
                  </label>
                  <Select
                    value={tagFilter || "all"}
                    onValueChange={onTagFilterChange}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select tag" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tags</SelectItem>
                      {availableTags.map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          #{tag}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Sort Options */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Sort By
                  </label>
                  <Select value={sortBy} onValueChange={onSortByChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="publishedAt">
                        Published Date
                      </SelectItem>
                      <SelectItem value="createdAt">Created Date</SelectItem>
                      <SelectItem value="updatedAt">Updated Date</SelectItem>
                      <SelectItem value="title">Title</SelectItem>
                      <SelectItem value="readTime">Read Time</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Sort Order
                  </label>
                  <Select
                    value={sortOrder}
                    onValueChange={(value) =>
                      onSortOrderChange(value as "asc" | "desc")
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sort order" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Descending</SelectItem>
                      <SelectItem value="asc">Ascending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Clear Filters */}
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      onStatusFilterChange("all");
                      onAuthorFilterChange("all");
                      onTagFilterChange("all");
                    }}
                    className="w-full"
                  >
                    Clear All Filters
                  </Button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  );
}
