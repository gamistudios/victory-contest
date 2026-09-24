import React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Type, Highlighter } from "lucide-react";
import { Editor } from "@tiptap/react";

interface ColorPickerProps {
  editor: Editor;
  type: "text" | "highlight";
}

const ColorPicker: React.FC<ColorPickerProps> = ({ editor, type }) => {
  const textColors = [
    { name: "Default", value: null, color: "#000000" },
    { name: "Red", value: "#ef4444", color: "#ef4444" },
    { name: "Orange", value: "#f97316", color: "#f97316" },
    { name: "Amber", value: "#f59e0b", color: "#f59e0b" },
    { name: "Yellow", value: "#eab308", color: "#eab308" },
    { name: "Lime", value: "#84cc16", color: "#84cc16" },
    { name: "Green", value: "#22c55e", color: "#22c55e" },
    { name: "Emerald", value: "#10b981", color: "#10b981" },
    { name: "Teal", value: "#14b8a6", color: "#14b8a6" },
    { name: "Cyan", value: "#06b6d4", color: "#06b6d4" },
    { name: "Sky", value: "#0ea5e9", color: "#0ea5e9" },
    { name: "Blue", value: "#3b82f6", color: "#3b82f6" },
    { name: "Indigo", value: "#6366f1", color: "#6366f1" },
    { name: "Violet", value: "#8b5cf6", color: "#8b5cf6" },
    { name: "Purple", value: "#a855f7", color: "#a855f7" },
    { name: "Fuchsia", value: "#d946ef", color: "#d946ef" },
    { name: "Pink", value: "#ec4899", color: "#ec4899" },
    { name: "Rose", value: "#f43f5e", color: "#f43f5e" },
    { name: "Gray", value: "#6b7280", color: "#6b7280" },
    { name: "Slate", value: "#64748b", color: "#64748b" },
  ];

  const highlightColors = [
    { name: "None", value: null, color: "transparent" },
    { name: "Yellow", value: "#fef08a", color: "#fef08a" },
    { name: "Green", value: "#bbf7d0", color: "#bbf7d0" },
    { name: "Blue", value: "#bfdbfe", color: "#bfdbfe" },
    { name: "Purple", value: "#e9d5ff", color: "#e9d5ff" },
    { name: "Pink", value: "#fbcfe8", color: "#fbcfe8" },
    { name: "Orange", value: "#fed7aa", color: "#fed7aa" },
    { name: "Red", value: "#fecaca", color: "#fecaca" },
    { name: "Gray", value: "#e5e7eb", color: "#e5e7eb" },
  ];

  const colors = type === "text" ? textColors : highlightColors;

  const handleColorSelect = (colorValue: string | null) => {
    if (type === "text") {
      if (colorValue) {
        editor.chain().focus().setColor(colorValue).run();
      } else {
        editor.chain().focus().unsetColor().run();
      }
    } else {
      if (colorValue) {
        editor.chain().focus().setHighlight({ color: colorValue }).run();
      } else {
        editor.chain().focus().unsetHighlight().run();
      }
    }
  };

  const getCurrentColor = () => {
    if (type === "text") {
      const color = editor.getAttributes("textStyle").color;
      return color || "#000000";
    } else {
      const highlight = editor.getAttributes("highlight");
      return highlight.color || "transparent";
    }
  };

  const isActive = () => {
    if (type === "text") {
      return editor.isActive("textStyle");
    } else {
      return editor.isActive("highlight");
    }
  };

  const currentColor = getCurrentColor();
  const Icon = type === "text" ? Type : Highlighter;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={isActive() ? "default" : "outline"}
          size="sm"
          className="relative"
          title={type === "text" ? "Text Color" : "Highlight Color"}
        >
          <Icon className="w-4 h-4" />
          <div
            className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-3 h-1 rounded-sm"
            style={{
              backgroundColor: currentColor,
              border:
                currentColor === "transparent" ? "1px solid #ccc" : "none",
            }}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64 p-2">
        <div className="grid grid-cols-5 gap-1">
          {colors.map((color) => (
            <button
              key={color.name}
              onClick={() => handleColorSelect(color.value)}
              className={`
                w-8 h-8 rounded border-2 hover:scale-110 transition-transform
                ${
                  currentColor ===
                  (color.value || (type === "text" ? "#000000" : "transparent"))
                    ? "border-gray-800 ring-2 ring-blue-500"
                    : "border-gray-300 hover:border-gray-400"
                }
              `}
              style={{
                backgroundColor: color.color,
                backgroundImage:
                  color.color === "transparent"
                    ? "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)"
                    : undefined,
                backgroundSize:
                  color.color === "transparent" ? "4px 4px" : undefined,
                backgroundPosition:
                  color.color === "transparent"
                    ? "0 0, 0 2px, 2px -2px, -2px 0px"
                    : undefined,
              }}
              title={color.name}
            />
          ))}
        </div>
        <div className="mt-2 pt-2 border-t">
          <p className="text-xs text-gray-600 text-center">
            {type === "text" ? "Text Color" : "Highlight Color"}
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ColorPicker;
