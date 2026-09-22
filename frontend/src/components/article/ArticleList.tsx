import { useState, useMemo, useEffect, useCallback } from "react";
import { ArticleCard } from "./ArticleCard";
import { ArticleFilters } from "./ArticleFilters";
import { Article } from "../../types/article";
import { FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getArticles } from "../../services/articleService";
import { toast } from "sonner";
import { ArticleListSkeletonMobile } from "./ArticleSkeleton";
import { useTelegram } from "../../hooks/useTelegram";
import ErrorMessage from "../ErrorComponent";

export function ArticleList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"favourite" | "all">("all");
  const [authorFilter, setAuthorFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [sortBy, setSortBy] = useState("publishedAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [articles, setArticles] = useState<Article[] | []>([]);
  const [loading, setLoading] = useState(true);
  const [bookmarkedArticles, setBookmarkedIds] = useState<string[]>([]);
  const navigate = useNavigate();
  const { showBackButton, getCloudData, setCloudData } = useTelegram();

  useEffect(() => {
    getCloudData("bookmarkedArticles", (bookmarked: string[] | null) => {
      if (bookmarked) {
        if (Array.isArray(bookmarked)) {
          setBookmarkedIds(bookmarked);
        } else {
          setCloudData("bookmarkedArticles", []);
        }
      } else {
        setBookmarkedIds([]);
      }
    });
  }, [getCloudData]);

  useEffect(() => {
    const fetchArticles = async () => {
      try {
        const data = await getArticles();
        // Convert date strings to Date objects
        const parsed = data.map((article: any) => ({
          ...article,
          publishedAt: article.publishedAt
            ? new Date(article.publishedAt)
            : undefined,
          createdAt: article.createdAt
            ? new Date(article.createdAt)
            : undefined,
          updatedAt: article.updatedAt
            ? new Date(article.updatedAt)
            : undefined,
        }));
        setArticles(parsed);
      } catch (error) {
        toast.error("Failed to fetch articles. Please try again later.", {
          style: { backgroundColor: "red", color: "white" },
        });
      } finally {
        setLoading(false);
      }
    };
    fetchArticles();
  }, []);
  showBackButton(() => navigate(-1));

  const handleArticleClick = (article: Article) => {
    navigate(`/article/${article.id}`);
  };

  const availableAuthors = useMemo(() => {
    const authors = articles.map((article) => article.author.name);
    return [...new Set(authors)].sort();
  }, [articles]);

  const availableTags = useMemo(() => {
    const tags = articles.flatMap((article) => article.tags);
    return [...new Set(tags)].sort();
  }, [articles]);

  const filteredArticles = useMemo(() => {
    let filtered = articles.filter((article) => {
      const matchesSearch =
        searchTerm === "" ||
        article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.excerpt.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.content.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || bookmarkedArticles.includes(article.id);
      const matchesAuthor =
        authorFilter === "" || article.author.name === authorFilter;
      const matchesTag = tagFilter === "" || article.tags.includes(tagFilter);

      return matchesSearch && matchesStatus && matchesAuthor && matchesTag;
    });

    // Sort articles
    filtered.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case "title":
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case "readTime":
          aValue = a.readTime;
          bValue = b.readTime;
          break;
        case "createdAt":
          aValue = a.createdAt.getTime();
          bValue = b.createdAt.getTime();
          break;
        case "updatedAt":
          aValue = a.updatedAt.getTime();
          bValue = b.updatedAt.getTime();
          break;
        case "publishedAt":
        default:
          aValue = a.publishedAt?.getTime() || 0;
          bValue = b.publishedAt?.getTime() || 0;
          break;
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    return filtered;
  }, [
    articles,
    searchTerm,
    statusFilter,
    authorFilter,
    tagFilter,
    sortBy,
    sortOrder,
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Filters */}
      <ArticleFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        authorFilter={authorFilter}
        onAuthorFilterChange={setAuthorFilter}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortOrder={sortOrder}
        onSortOrderChange={setSortOrder}
        availableAuthors={availableAuthors}
        availableTags={availableTags}
        tagFilter={tagFilter}
        onTagFilterChange={setTagFilter}
      />

      {/* Results Summary */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <p className="text-sm text-gray-600">
          {filteredArticles.length} of {articles.length} articles
        </p>
      </div>

      {/* Articles List */}
      {loading ? (
        <ArticleListSkeletonMobile />
      ) : (
        <div className="px-4 py-2">
          {filteredArticles.length > 0 ? (
            filteredArticles.map((article) => (
              <ArticleCard
                key={article.id}
                article={article}
                onClick={() => handleArticleClick(article)}
              />
            ))
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-base font-medium text-gray-900 mb-2">
                No articles found
              </h3>
              <p className="text-sm text-gray-500 px-4">
                Try adjusting your filters or search terms to find what you're
                looking for.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export function ArticleListForHome() {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setError] = useState<string | null>(null);
  const [triggerLoading, setTriggerLoading] = useState(false);
  const navigate = useNavigate();

  const handleArticleClick = (article: Article) => {
    navigate(`/article/${article.id}`);
  };

  useEffect(() => {
    fetchArticles();
  }, [triggerLoading]);

  const fetchArticles = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getArticles("3");
      const parsed = data.map((article: any) => ({
        ...article,
        publishedAt: article.publishedAt
          ? new Date(article.publishedAt)
          : undefined,
        createdAt: article.createdAt ? new Date(article.createdAt) : undefined,
        updatedAt: article.updatedAt ? new Date(article.updatedAt) : undefined,
      }));
      setArticles(parsed);
      setError(null);
    } catch (error) {
      setError("Something went wront. Please try again!");
    } finally {
      setLoading(false);
    }
  }, []);
  if (loading) {
    return <ArticleSkeleton />;
  }

  if (err != null) {
    return <ErrorMessage message={err} onRetry={fetchArticles} />;
  }

  return (
    <div className="">
      {articles?.map((ar) => {
        return (
          <ArticleCard
            key={ar.id}
            article={ar}
            onClick={() => handleArticleClick(ar)}
          />
        );
      })}
      <div
        onClick={() => navigate("/article")}
        className="text-center flex items-center justify-center gap-2"
      >
        <div className="flex gap-2 bg-blue-100 text-blue-600 font-bold text-sm py-3 px-5 rounded-full">
          <span>Read More </span>

          <svg
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            role="img"
            width="0.8em"
            height="0.8em"
            viewBox="0 0 24 24"
            fill="none"
            className="h-5 w-5 text-blue-800"
          >
            <g fill="none">
              <path
                fill="currentColor"
                d="M4 4.001h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"
                opacity=".16"
              ></path>
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M11 4H4v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M9 15L20 4m-5 0h5v5"
              ></path>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

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
