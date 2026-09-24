import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Quote, // 1. Import Quote icon
  ChevronDown,
  Link,
  Unlink,
  Image,
  Youtube,
  Undo,
  Redo,
} from "lucide-react";
import { Editor } from "@tiptap/react";
import ColorPicker from "./ColorPicker";
import LinkInsertionModal from "./LinkInsertionModal";
import MediaInsertionModal from "./MediaInsertionModal";

interface EditorToolbarProps {
  editor: Editor | null;
}

const fontFamilies = [
  { label: "Default", value: "" },
  { label: "Inter", value: "Inter, ui-sans-serif, system-ui, sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Georgia", value: "Georgia, 'Times New Roman', serif" },
  { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
  { label: "Garamond", value: "Garamond, serif" },
  { label: "Courier New", value: "'Courier New', Courier, monospace" },
  {
    label: "Fira Code",
    value: "'Fira Code', ui-monospace, SFMono-Regular, monospace",
  },
  { label: "Comic Sans", value: "'Comic Sans MS', cursive, sans-serif" },
  {
    label: "Noto Emoji",
    value: "'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji'",
  },
];

const listStyles = [
  { label: "Default Bullets", value: "list-disc" },
  { label: "Circle Bullets", value: "list-circle" },
  { label: "Square Bullets", value: "list-square" },
  { label: "Arrows →", value: "list-arrow" },
  { label: "Checks ✓", value: "list-check" },
  { label: "Stars ★", value: "list-star" },
  { label: "Rocket 🚀", value: "list-rocket" },
  { label: "Heart ❤", value: "list-heart" },
];

const EditorToolbar: React.FC<EditorToolbarProps> = ({ editor }) => {
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [renderTick, setRenderTick] = useState(0);

  // Force re-render on editor changes so active states and color indicators update
  React.useEffect(() => {
    if (!editor) return;
    const handler = () => setRenderTick((v) => v + 1);
    editor.on("selectionUpdate", handler);
    editor.on("transaction", handler);
    editor.on("update", handler);
    return () => {
      editor.off("selectionUpdate", handler);
      editor.off("transaction", handler);
      editor.off("update", handler);
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  const headingLevels = [
    { level: 1 as const, label: "Heading 1", size: "text-2xl" },
    { level: 2 as const, label: "Heading 2", size: "text-xl" },
    { level: 3 as const, label: "Heading 3", size: "text-lg" },
    { level: 4 as const, label: "Heading 4", size: "text-base" },
    { level: 5 as const, label: "Heading 5", size: "text-sm" },
    { level: 6 as const, label: "Heading 6", size: "text-xs" },
  ];

  const getCurrentHeading = () => {
    for (let level = 1; level <= 6; level++) {
      if (editor.isActive("heading", { level })) {
        return `H${level}`;
      }
    }
    return editor.isActive("paragraph") ? "Normal" : "Normal";
  };

  const applyFontFamily = (value: string) => {
    if (!value) {
      // remove only font-family from textStyle, keep others like color
      const attrs = editor.getAttributes("textStyle") || {};
      delete attrs.fontFamily;
      editor.chain().focus().setMark("textStyle", attrs).run();
      return;
    }
    editor.chain().focus().setMark("textStyle", { fontFamily: value }).run();
  };

  const applyListStyle = (className: string) => {
    // Ensure we're in a bullet list, then set/update attributes/class
    editor.chain().focus().toggleBulletList().run();
    editor
      .chain()
      .focus()
      .updateAttributes("bulletList", { class: className })
      .run();
  };

  return (
    <div className="editor-toolbar border-b bg-gray-50 p-2">
      <div className="flex items-center gap-1 flex-wrap">
        {/* Heading Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="min-w-[80px]">
              {getCurrentHeading()}
              <ChevronDown className="w-4 h-4 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => editor.chain().focus().setParagraph().run()}
              className={editor.isActive("paragraph") ? "bg-gray-100" : ""}
            >
              <span className="text-base">Normal</span>
            </DropdownMenuItem>
            {headingLevels.map(({ level, label, size }) => (
              <DropdownMenuItem
                key={level}
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level }).run()
                }
                className={
                  editor.isActive("heading", { level }) ? "bg-gray-100" : ""
                }
              >
                <span className={size}>{label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-6" />

        {/* Font Family Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="min-w-[140px]">
              Font
              <ChevronDown className="w-4 h-4 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-auto">
            {fontFamilies.map((f) => (
              <DropdownMenuItem
                key={f.label}
                onClick={() => applyFontFamily(f.value)}
              >
                <span style={{ fontFamily: f.value || undefined }}>
                  {f.label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-6" />

        {/* Text Formatting Controls */}
        <Button
          variant={editor.isActive("bold") ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </Button>

        <Button
          variant={editor.isActive("italic") ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (Ctrl+I)"
        >
          <Italic className="w-4 h-4" />
        </Button>

        <Button
          variant={editor.isActive("underline") ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (Ctrl+U)"
        >
          <Underline className="w-4 h-4" />
        </Button>

        <Button
          variant={editor.isActive("strike") ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* Color Controls */}
        <ColorPicker editor={editor} type="text" />
        <ColorPicker editor={editor} type="highlight" />

        <Separator orientation="vertical" className="h-6" />

        {/* Text Alignment Controls */}
        <Button
          variant={
            editor.isActive({ textAlign: "left" }) ? "default" : "outline"
          }
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          title="Align Left"
        >
          <AlignLeft className="w-4 h-4" />
        </Button>

        <Button
          variant={
            editor.isActive({ textAlign: "center" }) ? "default" : "outline"
          }
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          title="Align Center"
        >
          <AlignCenter className="w-4 h-4" />
        </Button>

        <Button
          variant={
            editor.isActive({ textAlign: "right" }) ? "default" : "outline"
          }
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          title="Align Right"
        >
          <AlignRight className="w-4 h-4" />
        </Button>

        <Button
          variant={
            editor.isActive({ textAlign: "justify" }) ? "default" : "outline"
          }
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          title="Justify"
        >
          <AlignJustify className="w-4 h-4" />
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* List Controls */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={editor.isActive("bulletList") ? "default" : "outline"}
              size="sm"
            >
              <List className="w-4 h-4 mr-1" />
              Bullets
              <ChevronDown className="w-4 h-4 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {listStyles.map((s) => (
              <DropdownMenuItem
                key={s.value}
                onClick={() => applyListStyle(s.value)}
              >
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant={editor.isActive("orderedList") ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </Button>

        {/* 2. Add Blockquote button */}
        <Button
          variant={editor.isActive("blockquote") ? "default" : "outline"}
          size="sm"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="Blockquote"
        >
          <Quote className="w-4 h-4" />
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* Link Controls */}
        <Button
          variant={editor.isActive("link") ? "default" : "outline"}
          size="sm"
          onClick={() => setIsLinkModalOpen(true)}
          title="Insert Link"
        >
          <Link className="w-4 h-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => editor.chain().focus().unsetLink().run()}
          disabled={!editor.isActive("link")}
          title="Remove Link"
        >
          <Unlink className="w-4 h-4" />
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* Media Controls */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsImageModalOpen(true)}
          title="Insert Image"
        >
          <Image className="w-4 h-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsVideoModalOpen(true)}
          title="Insert YouTube Video"
        >
          <Youtube className="w-4 h-4" />
        </Button>

        <Separator orientation="vertical" className="h-6" />

        {/* Undo/Redo Controls */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo (Ctrl+Z)"
        >
          <Undo className="w-4 h-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo (Ctrl+Y)"
        >
          <Redo className="w-4 h-4" />
        </Button>
      </div>

      {/* Modals are unchanged... */}
      <LinkInsertionModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        onInsert={(url, text) => {
          if (text) {
            editor
              .chain()
              .focus()
              .setLink({ href: url })
              .insertContent(text)
              .run();
          } else {
            editor.chain().focus().setLink({ href: url }).run();
          }
        }}
      />

      <MediaInsertionModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        onInsert={(media) => {
          if (media.type === "image") {
            editor
              .chain()
              .focus()
              .setImage({
                src: media.url,
                alt: media.alt || "",
                title: media.caption || "",
              })
              .run();
          }
        }}
        type="image"
      />

      <MediaInsertionModal
        isOpen={isVideoModalOpen}
        onClose={() => setIsVideoModalOpen(false)}
        onInsert={(media) => {
          if (media.type === "video") {
            // Extract YouTube video ID from URL
            const videoId = extractYouTubeId(media.url);
            if (videoId) {
              editor
                .chain()
                .focus()
                .setYoutubeVideo({
                  src: `https://www.youtube.com/embed/${videoId}`,
                  width: media.width || 640,
                  height: media.height || 480,
                })
                .run();
            }
          }
        }}
        type="video"
      />
    </div>
  );
};

// Helper function to extract YouTube video ID
const extractYouTubeId = (url: string): string | null => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

export default EditorToolbar;
