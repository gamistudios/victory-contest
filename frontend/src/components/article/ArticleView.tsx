import { useEffect, useState } from "react";
import { Calendar, Clock, Tag, Bookmark, ArrowUp, Eye } from "lucide-react";
import { Article, Comment } from "../../types/article";
import { useNavigate, useParams } from "react-router-dom";
import { AvatarFallback, Avatar, AvatarImage } from "../ui/avatar";
import {
  getArticleById,
  getArticleComments,
  postComment,
  toggleStat,
} from "../../services/articleService";
import { toast } from "sonner";
import ChatIcon from "../../assets/bubble-chat-stroke-rounded.svg?react";
import HeartIcon from "../../assets/heart-check-stroke-rounded.svg?react";
import BookMarkIcon from "../../assets/bookmark-check-02-stroke-rounded.svg?react";
import ShareIconSvg from "../../assets/share-01-stroke-rounded.svg?react";
import { Separator } from "../ui/separator";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "../ui/drawer";
import { useTelegram } from "../../hooks/useTelegram";
import { Input } from "../ui/input";
import ErrorMessage from "../ErrorComponent";
import { InlineQueryResultArticle } from "../../types";

// Helper functions (unchanged)
function formatNumber(num: number): string {
  if (num < 1000) return num.toString();
  if (num < 1_000_000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  if (num < 1_000_000_000)
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num < 1_000_000_000_000)
    return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  return (num / 1_000_000_000_000).toFixed(1).replace(/\.0$/, "") + "T";
}

function stripProseWrapper(html: string): string {
  const match = html.match(
    /^<div[^>]*class=["'][^"']*prose[^"']*["]{1}[^>]*>([\s\S]*)<\/div>$/i
  );
  let content = match ? match[1].trim() : html;
  content = content.replace(/<\/p>/gi, "</p><br>");
  return content;
}

export function ArticleView() {
  const [article, setArticle] = useState<Article | null>(null);
  const { id: articleId } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentLoading, setCommentLoading] = useState(false);
  const [drawerHeight, setDrawerHeight] = useState(window.innerHeight * 0.65);

  const {
    user,
    PrepareAndShareMessageShare,
    getCloudData,
    setCloudData,
    showBackButton,
  } = useTelegram();
  const navigate = useNavigate();

  showBackButton(() => navigate(-1));
  useEffect(() => {
    const handleResize = () => {
      setDrawerHeight(window.innerHeight * 0.65);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  // MODIFIED: Bookmark logic now uses a list (array)
  const handleBookmark = () => {
    if (!articleId) return;
    getCloudData("bookmarkedArticles", (bookmarkedIds: string[] | null) => {
      const currentBookmarks = bookmarkedIds || [];
      let updatedBookmarks: string[];
      let newBookmarked: boolean;

      if (currentBookmarks.includes(articleId)) {
        // Remove from list
        updatedBookmarks = currentBookmarks.filter((id) => id !== articleId);
        newBookmarked = false;
      } else {
        // Add to list
        updatedBookmarks = [...currentBookmarks, articleId];
        newBookmarked = true;
      }
      setCloudData("bookmarkedArticles", updatedBookmarks, () => {
        setBookmarked(newBookmarked);
      });
    });
  };

  const handleAddComment = async () => {
    // ... (This function is unchanged)
    if (!newComment.trim() || newComment.trim().length < 4) return;
    const newEntry: Comment = {
      id: String(comments?.length ?? 0 + 1),
      articleId: article?.id || "",
      user_name: user?.first_name ?? "" + user?.last_name ?? "shuluqa",
      user_id: user?.id.toString() ?? "12",
      avatar: user?.photo_url ?? "",
      text: newComment,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setComments([newEntry, ...(comments ?? [])]);
    setNewComment("");
    try {
      await postComment(articleId ?? "", newEntry);
      setCommentError(null);
    } catch (error) {
      toast.error("Failed to post comment. Please try again later.", {
        style: { backgroundColor: "red", color: "white" },
      });
    }
  };

  // MODIFIED: View count logic now uses a list (array)
  const handleViewCount = async () => {
    if (!articleId) return;
    getCloudData("viewedArticles", async (viewedIds: string[] | null) => {
      const currentViews: string[] = Array.isArray(viewedIds)
        ? viewedIds
        : viewedIds
        ? Object.keys(viewedIds)
        : [];

      if (currentViews.includes(articleId)) return; // Already viewed

      const updatedViews = [...currentViews, articleId];
      setCloudData("viewedArticles", updatedViews, async () => {
        const payload = { type: "view" as const, action: "increment" as const };
        try {
          await toggleStat(articleId, payload);
          setArticle((prev) =>
            prev
              ? {
                  ...prev,
                  viewCount: prev.viewCount + 1,
                }
              : prev
          );
        } catch (err) {
          console.log("Failed to increment view count");
        }
      });
    });
  };

  // MODIFIED: Like logic now uses a list (array)
  const handleLike = async () => {
    if (!articleId) return;

    try {
      getCloudData("likedArticles", async (likedIds: string[] | null) => {
        const currentLikes: string[] = Array.isArray(likedIds)
          ? likedIds
          : likedIds
          ? Object.keys(likedIds)
          : [];

        let updatedLikes: string[];
        let newLiked: boolean;

        if (currentLikes.includes(articleId)) {
          // Unlike: remove from list
          updatedLikes = currentLikes.filter((id) => id !== articleId);
          newLiked = false;
        } else {
          // Like: add to list
          updatedLikes = [...currentLikes, articleId];
          newLiked = true;
        }

        const action = newLiked ? "increment" : "decrement";
        const payload = {
          type: "like" as const,
          action: action as "increment" | "decrement",
        };

        setCloudData("likedArticles", updatedLikes, async () => {
          setLiked(newLiked);
          setArticle((prev) =>
            prev
              ? {
                  ...prev,
                  likeCount: newLiked ? prev.likeCount + 1 : prev.likeCount - 1,
                }
              : prev
          );
          await toggleStat(articleId, payload);
        });
      });
    } catch (err) {
      toast.error("Failed to update like status. Please try again later.", {
        style: { backgroundColor: "red", color: "white" },
      });
    }
  };

  // ... (handleArticleShare and formatDate are unchanged)
  const handleArticleShare = async () => {
    if (article?.title && article?.excerpt) {
      const payload: InlineQueryResultArticle = {
        type: "article",
        id: article.id, // 1-64 chars
        title: article.title,
        input_message_content: {
          message_text: `<strong>${article.title}</strong>\n\n${article.excerpt}\n\n<a href="https://victory-contest.vercel.app/article/${article.id}">Read more</a>\n `,
          parse_mode: "HTML",
          link_preview_options: {
            is_disabled: false,
            url: "https://t.me/VictoryLearningBot/learn",
            prefer_large_media: false,
            prefer_small_media: true,
          },
        },
        description: article.excerpt,
        thumbnail_url: article.thumbnail || "https://picsum.photos/200/300",
      };

      try {
        await PrepareAndShareMessageShare(payload);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unknown error", {
          style: { backgroundColor: "red", color: "white" },
        });
      }
    }
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return "Not published";
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  };
  useEffect(() => {
    // ... (This useEffect for scroll and comments is unchanged)
    const checkScrollTop = () => {
      if (window.scrollY > 100) {
        setShowScrollButton(true);
      } else {
        setShowScrollButton(false);
      }
    };
    window.addEventListener("scroll", checkScrollTop);
    const fetchComments = async () => {
      if (!articleId) return;
      setCommentLoading(true);
      try {
        const data = await getArticleComments(articleId);
        setComments(data);
      } catch (error) {
        setCommentError("Something went wrong while fetching comments.");
      } finally {
        setCommentLoading(false);
      }
    };
    fetchComments();
    return () => window.removeEventListener("scroll", checkScrollTop);
  }, [articleId]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    if (articleId) {
      const fetchArticle = async () => {
        try {
          const data = await getArticleById(articleId);
          const finalData = {
            ...data,
            publishedAt: data.publishedAt
              ? new Date(data.publishedAt)
              : new Date(),
            createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
            updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
          };
          setArticle(finalData);
        } catch (error) {
          toast.error("Failed to fetch article. Please try again later.", {
            style: { backgroundColor: "red", color: "white" },
          });
        } finally {
          setLoading(false);
        }
      };
      fetchArticle();
    }
  }, [articleId]);

  useEffect(() => {
    if (!articleId) return;
    handleViewCount();

    getCloudData("likedArticles", (likedIds: string[] | null) => {
      setLiked(!!likedIds?.includes(articleId));
    });

    getCloudData("bookmarkedArticles", (bookmarkedIds: string[] | null) => {
      setBookmarked(!!bookmarkedIds?.includes(articleId));
    });
  }, [articleId, getCloudData]);

  if (loading) {
    // ... (Loading state JSX is unchanged)
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="article relative bg-white font-nunito-sans">
      {/* Article Content */}
      <article className="px-4 py-6">
        {/* Status and Meta */}
        <div className="flex items-center justify-between mb-4">
          <div
            className={`px-3 py-1 rounded-full bg-blue-100 text-sm font-medium border`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 bg">
                <button
                  onClick={handleArticleShare}
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <ShareIconSvg className="w-6 h-6 text-black" />
                </button>
                <button
                  className={`p-2 hover:text-blue-600 focus:outline-none ${
                    bookmarked ? "text-blue-600" : "text-gray-400"
                  }`}
                  onClick={handleBookmark}
                  aria-pressed={bookmarked}
                  title={bookmarked ? "Remove Bookmark" : "Add to Bookmarks"}
                >
                  {bookmarked ? (
                    <BookMarkIcon className="w-6 h-6 text-yellow-500" />
                  ) : (
                    <Bookmark
                      className={`w-5 h-5 text-black ${
                        bookmarked ? "fill-blue-600" : ""
                      }`}
                    />
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center text-gray-500 text-sm">
            <Clock className="w-4 h-4 mr-1" />
            {article?.readTime} min read
          </div>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold font-nunito text-gray-900 mb-4 leading-tight">
          {article?.title}
        </h1>

        {/* Excerpt */}
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
          {article?.excerpt}
        </p>

        {/* Author and Date */}
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Avatar>
              <AvatarImage src={article?.author.avatar} />
              <AvatarFallback>{article?.author.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center text-gray-900 font-semibold text-sm">
                {article?.author.name}
              </div>
              <div className="flex items-center text-gray-500 text-xs mt-1">
                <Calendar className="w-3 h-3 mr-1" />
                {article?.status === "published"
                  ? formatDate(article?.publishedAt)
                  : formatDate(article?.updatedAt)}
              </div>
            </div>
          </div>
          <div className="flex items-center text-gray-500 text-sm gap-1 mr-2">
            <Eye className="w-4 h-4 text-gray-400" />
            {formatNumber(Number(article?.viewCount) ?? 0)} views
          </div>
        </div>

        {/* Tags */}
        {(article?.tags || []).length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Tags</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {article?.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 bg-blue-50 text-blue-600 text-sm rounded-full font-medium"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Thumbnail */}
        {article?.thumbnail && (
          <div className="mb-6">
            <img
              src={article?.thumbnail}
              alt={article?.title}
              className="w-full rounded-lg object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div
          className="article-content prose prose-sm max-w-none
              prose-headings:text-gray-900 prose-headings:font-bold
              prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4
              prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
              prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-4
              a:text-blue-600 prose-a:no-underline hover:prose-a:underline
              prose-strong:text-gray-900 prose-strong:font-semibold
              prose-ul:mb-4 prose-ol:mb-4
              prose-li:text-gray-700 prose-li:mb-1
              prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:text-sm prose-pre:rounded-lg
              code:bg-gray-100 code:text-gray-800 code:px-1 code:py-0.5 code:rounded code:text-sm
              prose-img:rounded-lg prose-img:shadow-sm
              "
          dangerouslySetInnerHTML={{
            __html: stripProseWrapper(article?.content || ""),
          }}
        />
      </article>

      {/* Bottom Actions */}
      {/* FIXED, CIRCULAR SCROLL-TO-TOP BUTTON */}
      <button
        onClick={scrollToTop}
        aria-label="Scroll to top"
        className={`
          fixed bottom-20 right-6 p-3 bg-blue-600 text-white rounded-full shadow-lg
          hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75
          transition-all duration-300 ease-in-out
          ${
            showScrollButton
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-4 pointer-events-none"
          }
        `}
      >
        <ArrowUp className="w-6 h-6" />
      </button>
      {/* Like and Comment ACTIONS */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 flex items-center rounded-full text-white px-4 py-1 bg-blue-600 gap-2">
        <button
          className={`flex items-center gap-2 p-2 focus:outline-none`}
          onClick={handleLike}
          aria-pressed={liked}
        >
          {liked ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 640 640"
              fill="red"
              className="w-7 h-7"
            >
              <path
                fill="red"
                d="M305 151.1L320 171.8L335 151.1C360 116.5 400.2 96 442.9 96C516.4 96 576 155.6 576 229.1L576 231.7C576 343.9 436.1 474.2 363.1 529.9C350.7 539.3 335.5 544 320 544C304.5 544 289.2 539.4 276.9 529.9C203.9 474.2 64 343.9 64 231.7L64 229.1C64 155.6 123.6 96 197.1 96C239.8 96 280 116.5 305 151.1z"
              />
            </svg>
          ) : (
            <HeartIcon
              className={`w-5 h-5 ${liked ? "text-pink-300" : "text-white"}`}
            />
          )}

          <span>{formatNumber(Number(article?.likeCount ?? 0)) ?? "Like"}</span>
        </button>
        <Separator orientation="vertical" className="h-6 w-px bg-white" />
        <Drawer>
          <DrawerTrigger asChild>
            <div className="flex items-center gap-2 p-2 dark:hover:bg-gray-800 cursor-pointer">
              <ChatIcon className="w-5 h-5" />
              <span className="font-medium">
                {comments !== null
                  ? formatNumber(comments.length ?? 0) ?? "Comments"
                  : "Comments"}
              </span>
            </div>
          </DrawerTrigger>

          <DrawerContent
            style={{ height: drawerHeight }}
            className="flex flex-col"
          >
            <DrawerHeader>
              <DrawerTitle className="text-lg font-semibold">
                Comments
              </DrawerTitle>
              <DrawerDescription>
                Share your thoughts about this article.
              </DrawerDescription>
            </DrawerHeader>

            {/* Comment List */}
            <div className="flex-1 p-4 space-y-6 overflow-y-auto">
              {commentLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <CommentSkeleton key={i} />
                ))
              ) : commentError ? (
                <ErrorMessage
                  message="Failed to load comments."
                  onRetry={() => {}}
                />
              ) : (comments ?? []).length === 0 ? (
                <p className="text-gray-500">No comments yet.</p>
              ) : (
                (comments ?? []).map((comment) => (
                  <div key={comment.id} className="flex items-start gap-3">
                    <Avatar>
                      <AvatarImage src={comment.avatar} />
                      <AvatarFallback>
                        {comment.user_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-sm">
                          {comment.user_name}
                        </p>
                        <span className="text-xs text-gray-500">
                          {new Date(
                            comment.createdAt ?? ""
                          ).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                        {comment.text}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Comment Input */}
            <div className="p-4 border-t bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage
                    src={user?.photo_url ?? "https://i.pravatar.cc/51"}
                    alt="your avatar"
                  />
                  <AvatarFallback>{user?.first_name.charAt(0)}</AvatarFallback>
                </Avatar>
                <Input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="flex-1 p-4 text-sm border rounded-full focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <div
                  onClick={handleAddComment}
                  className={`px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-full hover:bg-blue-500 transition ${
                    newComment.trim().length > 4
                      ? ""
                      : "opacity-50 cursor-not-allowed"
                  }`}
                >
                  Post
                </div>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    </div>
  );
}

const CommentSkeleton = () => {
  // ... (CommentSkeleton is unchanged)
  return (
    <div className="flex items-start gap-3 animate-pulse">
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700" />

      {/* Content */}
      <div className="flex-1">
        {/* Username + Date */}
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>

        {/* Comment text */}
        <div className="mt-2 space-y-2">
          <div className="h-3 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-3 w-1/2 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    </div>
  );
};
