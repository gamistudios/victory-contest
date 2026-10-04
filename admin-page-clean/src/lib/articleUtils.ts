import {
  Article,
  ArticleData,
  ArticleSummary,
  MediaItem,
} from "@/types/article";

/**
 * Calculate estimated reading time based on content length
 * @param content - HTML content string
 * @returns Reading time in minutes
 */
export const calculateReadingTime = (content: string): number => {
  // Remove HTML tags and count words
  const textContent = content.replace(/<[^>]*>/g, "");
  const wordCount = textContent.trim().split(/\s+/).length;

  // Average reading speed is 200-250 words per minute
  const wordsPerMinute = 225;
  const readingTime = Math.ceil(wordCount / wordsPerMinute);

  return Math.max(1, readingTime); // Minimum 1 minute
};

/**
 * Generate article excerpt from content
 * @param content - HTML content string
 * @param maxLength - Maximum length of excerpt (default: 150)
 * @returns Excerpt string
 */
export const generateExcerpt = (
  content: string,
  maxLength: number = 150
): string => {
  // Remove HTML tags
  const textContent = content.replace(/<[^>]*>/g, "");

  if (textContent.length <= maxLength) {
    return textContent;
  }

  // Find the last complete word within the limit
  const truncated = textContent.substring(0, maxLength);
  const lastSpaceIndex = truncated.lastIndexOf(" ");

  if (lastSpaceIndex > 0) {
    return truncated.substring(0, lastSpaceIndex) + "...";
  }

  return truncated + "...";
};

/**
 * Extract first image URL from article content
 * @param content - HTML content string
 * @returns First image URL or undefined
 */
export const extractThumbnail = (content: string): string | undefined => {
  const imgRegex = /<img[^>]+src="([^">]+)"/i;
  const match = content.match(imgRegex);
  return match ? match[1] : undefined;
};

/**
 * Validate article data
 * @param articleData - Article data to validate
 * @returns Validation result with errors
 */
export const validateArticleData = (
  articleData: ArticleData
): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (!articleData.title.trim()) {
    errors.push("Title is required");
  }

  if (articleData.title.length > 200) {
    errors.push("Title must be less than 200 characters");
  }

  if (!articleData.content.trim()) {
    errors.push("Content is required");
  }

  if (articleData.content.length < 50) {
    errors.push("Content must be at least 50 characters long");
  }

  if (articleData.excerpt && articleData.excerpt.length > 300) {
    errors.push("Excerpt must be less than 300 characters");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Convert Article to ArticleSummary
 * @param article - Full article object
 * @returns Article summary object
 */
export const articleToSummary = (article: Article): ArticleSummary => {
  return {
    id: article.id,
    title: article.title,
    excerpt: article.excerpt,
    author: article.author,
    publishedAt: article.publishedAt,
    thumbnail: article.thumbnail,
    readTime: article.readTime,
    tags: article.tags,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
    status: article.status,
  };
};

/**
 * Format date for display
 * @param date - Date to format
 * @returns Formatted date string
 */
export const formatArticleDate = (date: Date): string => {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
};

/**
 * Generate article slug from title
 * @param title - Article title
 * @returns URL-friendly slug
 */
export const generateSlug = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove special characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .trim();
};

/**
 * Validate complete Article object
 * @param article - Article object to validate
 * @returns Validation result with errors
 */
export const validateArticle = (
  article: Partial<Article>
): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (!article.id?.trim()) {
    errors.push("Article ID is required");
  }

  if (!article.title?.trim()) {
    errors.push("Title is required");
  } else if (article.title.length > 200) {
    errors.push("Title must be less than 200 characters");
  }

  if (!article.content?.trim()) {
    errors.push("Content is required");
  } else if (article.content.length < 50) {
    errors.push("Content must be at least 50 characters long");
  }

  if (!article.author?.id?.trim()) {
    errors.push("Author ID is required");
  }

  if (!article.author?.name?.trim()) {
    errors.push("Author name is required");
  }

  if (!article.status) {
    errors.push("Article status is required");
  } else if (!["draft", "published", "archived"].includes(article.status)) {
    errors.push("Invalid article status");
  }

  if (!article.createdAt) {
    errors.push("Created date is required");
  }

  if (!article.updatedAt) {
    errors.push("Updated date is required");
  }

  if (article.status === "published" && !article.publishedAt) {
    errors.push("Published date is required for published articles");
  }

  if (article.excerpt && article.excerpt.length > 300) {
    errors.push("Excerpt must be less than 300 characters");
  }

  if (article.tags && article.tags.length > 10) {
    errors.push("Maximum 10 tags allowed");
  }

  if (article.readTime && article.readTime < 1) {
    errors.push("Reading time must be at least 1 minute");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate MediaItem object
 * @param mediaItem - MediaItem object to validate
 * @returns Validation result with errors
 */
export const validateMediaItem = (
  mediaItem: Partial<MediaItem>
): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (!mediaItem.id?.trim()) {
    errors.push("Media ID is required");
  }

  if (!mediaItem.type) {
    errors.push("Media type is required");
  } else if (!["image", "video"].includes(mediaItem.type)) {
    errors.push("Invalid media type");
  }

  if (!mediaItem.url?.trim()) {
    errors.push("Media URL is required");
  } else {
    // Basic URL validation
    try {
      new URL(mediaItem.url);
    } catch {
      errors.push("Invalid media URL format");
    }
  }

  // Validate YouTube URLs for video type
  if (mediaItem.type === "video" && mediaItem.url) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    if (!youtubeRegex.test(mediaItem.url)) {
      errors.push("Only YouTube URLs are supported for videos");
    }
  }

  // Validate image URLs for image type
  if (mediaItem.type === "image" && mediaItem.url) {
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg)$/i;
    const isDataUrl = mediaItem.url.startsWith("data:image/");
    if (!imageExtensions.test(mediaItem.url) && !isDataUrl) {
      errors.push("Invalid image URL format");
    }
  }

  if (mediaItem.width && mediaItem.width <= 0) {
    errors.push("Width must be a positive number");
  }

  if (mediaItem.height && mediaItem.height <= 0) {
    errors.push("Height must be a positive number");
  }

  if (mediaItem.alt && mediaItem.alt.length > 200) {
    errors.push("Alt text must be less than 200 characters");
  }

  if (mediaItem.caption && mediaItem.caption.length > 500) {
    errors.push("Caption must be less than 500 characters");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate article tags
 * @param tags - Array of tag strings
 * @returns Validation result with errors
 */
export const validateTags = (
  tags: string[]
): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (tags.length > 10) {
    errors.push("Maximum 10 tags allowed");
  }

  tags.forEach((tag, index) => {
    if (!tag.trim()) {
      errors.push(`Tag ${index + 1} cannot be empty`);
    } else if (tag.length > 50) {
      errors.push(`Tag "${tag}" must be less than 50 characters`);
    } else if (!/^[a-zA-Z0-9\s-_]+$/.test(tag)) {
      errors.push(`Tag "${tag}" contains invalid characters`);
    }
  });

  // Check for duplicate tags
  const uniqueTags = new Set(tags.map((tag) => tag.toLowerCase().trim()));
  if (uniqueTags.size !== tags.length) {
    errors.push("Duplicate tags are not allowed");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Sanitize and normalize article data
 * @param articleData - Raw article data
 * @returns Sanitized article data
 */
export const sanitizeArticleData = (articleData: ArticleData): ArticleData => {
  return {
    title: articleData.title.trim(),
    content: articleData.content.trim(),
    excerpt:
      articleData.excerpt?.trim() || generateExcerpt(articleData.content),
    tags: articleData.tags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
    status: articleData.status,
    thumbnail:
      articleData.thumbnail?.trim() || extractThumbnail(articleData.content),
  };
};

/**
 * Check if article is ready for publishing
 * @param articleData - Article data to check
 * @returns Boolean indicating if article can be published
 */
export const canPublishArticle = (articleData: ArticleData): boolean => {
  const validation = validateArticleData(articleData);
  return (
    validation.isValid &&
    articleData.title.trim().length > 0 &&
    articleData.content.trim().length >= 100
  ); // Minimum content for publishing
};
