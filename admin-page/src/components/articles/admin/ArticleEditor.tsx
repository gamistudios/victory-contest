import React, { useState, useEffect, useCallback, useRef } from "react";

import { useEditor, EditorContent } from "@tiptap/react";

import StarterKit from "@tiptap/starter-kit";

import Color from "@tiptap/extension-color";

import Highlight from "@tiptap/extension-highlight";

import Image from "@tiptap/extension-image";

import Youtube from "@tiptap/extension-youtube";

import Underline from "@tiptap/extension-underline";

import TextAlign from "@tiptap/extension-text-align";

import Link from "@tiptap/extension-link";

import { TextStyle } from "@tiptap/extension-text-style";

import BulletList from "@tiptap/extension-bullet-list";

import HardBreak from "@tiptap/extension-hard-break";

import { Article } from "@/types/article";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import EditorToolbar from "../editor/EditorToolbar";
import ImagesDrawer from "./ImagesDrawer";
import { getArticleById } from "@/services/articleServices";
import { Eye, Save, Send } from "lucide-react";
import { useSearchParams } from "react-router-dom";

interface ArticleEditorProps {
  articleId: string;
  onSave: (article: Article) => void;
  onPublish: (article: Article) => void;
}

// Initial state for the form data
const initialArticleState: Article = {
  id: "",
  title: "",
  content: "<p></p>", // Default empty content for the editor
  excerpt: "",
  author: { id: "", name: "", avatar: "" }, // Assuming Author type {id, name, avatar}
  status: "draft",
  publishedAt: undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
  tags: [],
  thumbnail: "",
  readTime: 0,
  viewCount: 0,
  likeCount: 0,
};

const ArticleEditor: React.FC<ArticleEditorProps> = ({ onSave, onPublish }) => {
  const articleId = useSearchParams()[0].get("edit") || "";
  const [formData, setFormData] = useState<Article>(initialArticleState);
  const [tagInput, setTagInput] = useState("");
  const [isPreview, setIsPreview] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const isContentLoaded = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: false,

        hardBreak: false,
      }),

      HardBreak.extend({
        addKeyboardShortcuts() {
          return {
            "Shift-Enter": () =>
              this.editor.chain().setHardBreak().setHardBreak().run(),
          };
        },
      }),

      BulletList.extend({
        addAttributes() {
          return {
            class: {
              default: null,

              renderHTML: (attributes) => {
                if (!attributes.class) return {};

                return { class: attributes.class };
              },
            },
          };
        },
      }),

      Underline,

      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),

      TextStyle,

      Color.configure({
        types: ["textStyle"],
      }),

      Highlight.configure({
        multicolor: true,
      }),

      Image.configure({
        HTMLAttributes: {
          class: "max-w-full h-auto rounded-lg mx-auto block",
        },
      }),

      Youtube.configure({
        width: 640,

        height: 480,

        HTMLAttributes: {
          class: "rounded-lg mx-auto block",
        },
      }),

      Link.configure({
        openOnClick: false,

        HTMLAttributes: {
          class: "text-blue-600 hover:text-blue-800 underline",
        },
      }),
    ],

    content: formData?.content ?? "<p>Start writing your article...</p>",

    editorProps: {
      attributes: {
        class:
          "tiptap prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none min-h-[400px] p-4 max-w-full break-words",
      },
    },
  });
  // Effect to fetch the article data when the component mounts or articleId changes
  useEffect(() => {
    const fetchArticle = async () => {
      if (!articleId || articleId === "new") {
        setFormData(initialArticleState); // Reset form for "new" article
        isContentLoaded.current = false; // Reset content-loaded flag
        editor?.commands.setContent("<p></p>"); // Clear editor
        setIsFetching(false);
        return;
      }
      try {
        const data = await getArticleById(articleId);
        setFormData(data);
        isContentLoaded.current = false;
      } catch {
        setFetchError("Could not load the article. Please try again.");
      } finally {
        setIsFetching(false);
      }
    };
    fetchArticle();
  }, [articleId, editor]);

  useEffect(() => {
    if (editor && !isContentLoaded.current && formData.id) {
      editor.commands.setContent(formData.content);
      isContentLoaded.current = true;
    }
  }, [formData, editor, articleId]);

  // ## 3. OPTIMIZED EVENT HANDLERS ##
  // A single, reusable handler for all form input changes
  const handleFormChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      if (name.startsWith("author")) {
        const authorField = name.split("author")[1].toLowerCase();
        setFormData((prev) => ({
          ...prev,
          author: {
            ...prev.author,
            [authorField]: value,
          },
        }));
        return;
      }
      setFormData((prev) => ({ ...prev, [name]: value }));
    },
    []
  );

  // Use useCallback to memoize functions and prevent unnecessary re-renders
  const buildArticlePayload = useCallback(
    (status: "draft" | "published"): Article => {
      // Simple validator
      if (!formData.title || formData.title.trim() === "") {
        throw new Error("Excerpt is required");
      }

      if (!formData.excerpt || formData.excerpt.trim() === "") {
        throw new Error("Excerpt is required");
      }

      if (!editor || !editor.getHTML().trim()) {
        throw new Error("Content is required");
      }

      if (!formData.author?.name || formData.author.name.trim() === "") {
        formData.author = { ...formData.author, name: "Admin User" }; // fallback
      }

      return {
        id: formData?.id || "",
        title: formData.title,
        content: editor ? editor.getHTML() : formData?.content || "",
        excerpt: formData.excerpt,
        tags: formData.tags,
        status,
        author: {
          id: formData?.author?.id || "1",
          name: formData.author.name || "Admin User",
          avatar: formData.author.avatar || "",
        },
        publishedAt:
          status === "published"
            ? formData?.publishedAt || new Date()
            : formData?.publishedAt,
        createdAt: formData?.createdAt || new Date(),
        updatedAt: new Date(),
        thumbnail: formData?.thumbnail,
        readTime: formData?.readTime || 0,
        viewCount: formData?.viewCount || 0,
        likeCount: formData?.likeCount || 0,
      };
    },
    [formData, editor]
  );

  const handleSave = useCallback(() => {
    if (!editor) return;
    onSave(buildArticlePayload("draft"));
  }, [editor, onSave, buildArticlePayload]);

  const handlePublish = useCallback(() => {
    if (!editor) return;
    onPublish(buildArticlePayload("published"));
  }, [editor, onPublish, buildArticlePayload]);

  const addTag = useCallback(() => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !formData.tags.includes(trimmedTag)) {
      setFormData((prev) => ({ ...prev, tags: [...prev.tags, trimmedTag] }));
      setTagInput("");
    }
  }, [tagInput, formData.tags]);

  const removeTag = useCallback((tagToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }));
  }, []);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTag();
      }
    },
    [addTag]
  );

  // Handle loading and error states for the initial fetch
  if (isFetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading article...</div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex items-center justify-center h-64 text-red-600">
        <div className="text-lg">{fetchError}</div>
      </div>
    );
  }

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Initializing editor...</div>
      </div>
    );
  }
  console.log("article title", formData?.title.trim());

  return (
    <div className="article-editor w-full max-w-6xl mx-auto space-y-6">
      {/* Header (No changes needed here, just ensure props are correct) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold break-words">
          {formData ? "Edit Article" : "Create New Article"}
        </h1>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button
            variant="outline"
            onClick={() => setShowImages(true)}
            disabled={isFetching}
          >
            Images
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsPreview(!isPreview)}
            disabled={isFetching}
          >
            <Eye className="w-4 h-4 mr-2" />

            {isPreview ? "Edit" : "Preview"}
          </Button>

          <Button
            variant="outline"
            onClick={handleSave}
            disabled={isFetching || !formData?.title.trim()}
          >
            <Save className="w-4 h-4 mr-2" />
            Save Draft
          </Button>

          <Button
            onClick={handlePublish}
            disabled={
              isFetching || !formData?.title.trim() || !editor.getText().trim()
            }
          >
            <Send className="w-4 h-4 mr-2" />
            Publish
          </Button>
        </div>
      </div>

      <Separator />

      {/* Article Metadata Card - Updated with consolidated state */}
      <Card>
        <CardHeader>
          <CardTitle>Article Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Title</label>
            <Input
              name="title"
              value={formData.title}
              onChange={handleFormChange}
              placeholder="Enter article title..."
              disabled={isFetching}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Excerpt</label>
            <Input
              name="excerpt"
              value={formData.excerpt}
              onChange={handleFormChange}
              placeholder="Brief description of the article..."
              disabled={isFetching}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Author Name
              </label>
              <Input
                name="authorName"
                value={formData.author.name}
                onChange={handleFormChange}
                placeholder="e.g., Jane Doe"
                disabled={isFetching}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Author Avatar URL
              </label>
              <Input
                name="authorAvatar"
                value={formData.author.avatar}
                onChange={handleFormChange}
                placeholder="https://..."
                disabled={isFetching}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Thumbnail</label>
            <Input
              name="thumbnail"
              value={formData.thumbnail}
              onChange={handleFormChange}
              placeholder="Put thumbnail image url"
              disabled={isFetching}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {formData.tags.map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="cursor-pointer"
                  onClick={() => removeTag(tag)}
                >
                  {tag} ×
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Add a tag..."
                disabled={isFetching}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addTag}
                disabled={!tagInput.trim() || isFetching}
              >
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ImagesDrawer
        open={showImages}
        onOpenChange={setShowImages}
        folder="articles"
      />

      <Card>
        <CardHeader>
          <CardTitle>Content</CardTitle>
        </CardHeader>
        <CardContent>
          {isPreview ? (
            <div className="prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto min-h-[400px] p-4 border rounded-lg max-w-full overflow-x-auto break-words">
              <div dangerouslySetInnerHTML={{ __html: editor.getHTML() }} />
            </div>
          ) : (
            <div className="border rounded-lg max-w-full overflow-x-auto">
              <EditorToolbar editor={editor} />
              <EditorContent editor={editor} />
              {/* ## 4. CSS BEST PRACTICES NOTE ## */}
              {/*
                Best Practice Note:
                Embedding CSS with a <style> tag is generally discouraged.
                Consider moving these styles to a global CSS file or configuring
                the Tailwind Typography plugin (`prose`) in `tailwind.config.js`
                to apply these styles to the editor's output automatically.
              */}
              <style>{/* ... (your styles) */}</style>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ... (Status Information Card) */}
    </div>
  );
};

export default ArticleEditor;
