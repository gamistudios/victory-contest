import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Image as ImageIcon, Youtube, X, Video } from "lucide-react";
import { MediaItem } from "@/types/article";
import { toast } from "sonner";

interface MediaInsertionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (media: MediaItem) => void;
  type: "image" | "video";
}

const MediaInsertionModal: React.FC<MediaInsertionModalProps> = ({
  isOpen,
  onClose,
  onInsert,
  type,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [isValidUrl, setIsValidUrl] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const validateUrl = (urlString: string): boolean => {
    try {
      const urlObj = new URL(urlString);
      if (type === "image") {
        return urlObj.protocol === "http:" || urlObj.protocol === "https:";
      } else {
        // YouTube URL validation
        const youtubeRegex =
          /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
        return youtubeRegex.test(urlString);
      }
    } catch {
      return false;
    }
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setIsValidUrl(validateUrl(value));
  };

  const handleInsert = async () => {
    setIsLoading(true);

    try {
      let mediaUrl = "";
      let mediaId = "";

      if (uploadedFile) {
        // In a real app, you would upload the file to your server
        // For now, we'll create a local URL
        mediaUrl = URL.createObjectURL(uploadedFile);
        mediaId = `local-${Date.now()}`;
      } else if (url && isValidUrl) {
        mediaUrl = url;
        mediaId = `url-${Date.now()}`;
      } else {
        toast.error("Please provide valid media");
        setIsLoading(false);
        return;
      }

      const mediaItem: MediaItem = {
        id: mediaId,
        type,
        url: mediaUrl,
        alt: type === "image" ? alt : undefined,
        caption: caption || undefined,
        width: width ? parseInt(width) : undefined,
        height: height ? parseInt(height) : undefined,
      };

      onInsert(mediaItem);
      handleClose();
    } catch (error) {
      toast.error("Failed to insert media");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setIsDragOver(false);
    setUploadedFile(null);
    setUrl("");
    setAlt("");
    setCaption("");
    setWidth("");
    setHeight("");
    setIsValidUrl(false);
    onClose();
  };

  const extractYouTubeId = (url: string): string | null => {
    const regExp =
      /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogTitle />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {type === "image" ? (
              <ImageIcon className="w-5 h-5" />
            ) : (
              <Video className="w-5 h-5" />
            )}
            Insert {type === "image" ? "Image" : "Video"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="media-url">
            {type === "image" ? "Image" : "YouTube"} URL *
          </Label>
          <div className="relative">
            <Input
              id="media-url"
              type="url"
              placeholder={
                type === "image"
                  ? "https://example.com/image.jpg"
                  : "https://www.youtube.com/watch?v=..."
              }
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              className={`pr-10 ${url && !isValidUrl ? "border-red-500" : ""}`}
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
              Please enter a valid {type === "image" ? "image" : "YouTube"} URL
            </p>
          )}
        </div>

        {url && isValidUrl && type === "video" && (
          <Card>
            <CardContent className="pt-4">
              <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <Youtube className="w-12 h-12 text-red-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">YouTube Video Preview</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {extractYouTubeId(url)
                      ? "Valid YouTube URL"
                      : "Invalid YouTube URL"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Media Options */}
        <div className="space-y-4">
          {type === "image" && (
            <div className="space-y-2">
              <Label htmlFor="alt-text">Alt Text</Label>
              <Input
                id="alt-text"
                placeholder="Description for accessibility"
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="caption">Caption (Optional)</Label>
            <Textarea
              id="caption"
              placeholder="Caption for the media"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="width">Width (px)</Label>
              <Input
                id="width"
                type="number"
                placeholder="Auto"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="height">Height (px)</Label>
              <Input
                id="height"
                type="number"
                placeholder="Auto"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleInsert}
            disabled={isLoading || !url || !isValidUrl}
          >
            {isLoading ? "Inserting..." : "Insert Media"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MediaInsertionModal;
