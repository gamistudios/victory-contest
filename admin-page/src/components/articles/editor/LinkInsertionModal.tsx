import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Link, X } from "lucide-react";
import { toast } from "sonner";

interface LinkInsertionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (url: string, text?: string) => void;
  initialUrl?: string;
  initialText?: string;
}

const LinkInsertionModal: React.FC<LinkInsertionModalProps> = ({
  isOpen,
  onClose,
  onInsert,
  initialUrl = "",
  initialText = "",
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [text, setText] = useState(initialText);
  const [isValidUrl, setIsValidUrl] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setUrl(initialUrl);
      setText(initialText);
    }
  }, [isOpen, initialUrl, initialText]);

  const validateUrl = (urlString: string): boolean => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.protocol === "http:" || urlObj.protocol === "https:";
    } catch {
      return false;
    }
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setIsValidUrl(validateUrl(value));
  };

  const handleInsert = () => {
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }

    if (!isValidUrl) {
      toast.error("Please enter a valid URL");
      return;
    }

    onInsert(url.trim(), text.trim() || undefined);
    onClose();
  };

  const handleClose = () => {
    setUrl("");
    setText("");
    setIsValidUrl(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link className="w-5 h-5" />
            Insert Link
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">URL *</Label>
            <div className="relative">
              <Input
                id="url"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => handleUrlChange(e.target.value)}
                className={`pr-10 ${
                  url && !isValidUrl ? "border-red-500" : ""
                }`}
              />
              {url && (
                <button
                  type="button"
                  onClick={() => setUrl("")}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {url && !isValidUrl && (
              <p className="text-sm text-red-500">
                Please enter a valid URL starting with http:// or https://
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="text">Link Text (Optional)</Label>
            <Input
              id="text"
              placeholder="Display text for the link"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              If left empty, the URL will be used as the display text
            </p>
          </div>

          {url && isValidUrl && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium mb-1">Preview:</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
              >
                {text || url}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleInsert} disabled={!url.trim() || !isValidUrl}>
            Insert Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LinkInsertionModal;
