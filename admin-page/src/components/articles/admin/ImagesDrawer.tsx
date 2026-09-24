import { useEffect, useState } from "react";
import { deleteImage, listImages } from "@/services/imageServices";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import ImageUploader from "./ImageUploader"; // 👈 Import the new component

type ImagesDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder?: string;
};

export default function ImagesDrawer({
  open,
  onOpenChange,
  folder = "articles",
}: ImagesDrawerProps) {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchImages = () => {
    setLoading(true);
    listImages(folder)
      .then(setImages)
      .catch(() => toast.error("Failed to fetch images"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) {
      fetchImages();
    }
  }, [open, folder]);

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast.success("Copied image URL");
  };

  const handleDelete = async (url: string) => {
    // Optimistically remove the image from the UI
    setImages((prev) => prev.filter((u) => u !== url));
    const promise = deleteImage(url);

    toast.promise(promise, {
      loading: "Deleting image...",
      success: "Image deleted",
      error: (err) => {
        // If the delete fails, add the image back to the list
        fetchImages();
        return `Failed to delete image: ${err.message}`;
      },
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <div className="mx-auto w-full max-w-2xl">
          <DrawerHeader>
            <DrawerTitle>Media Library</DrawerTitle>
          </DrawerHeader>

          <div className="p-4">
            <Tabs defaultValue="all-images">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="all-images">All Images</TabsTrigger>
                <TabsTrigger value="upload">Upload New</TabsTrigger>
              </TabsList>

              {/* === All Images Tab === */}
              <TabsContent value="all-images">
                <div className="mt-4 max-h-[60vh] overflow-y-auto">
                  {loading ? (
                    <p className="text-center">Loading...</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {images.map((url) => (
                        <div
                          key={url}
                          className="group relative border rounded-md overflow-hidden"
                        >
                          <img
                            src={url}
                            alt="img"
                            className="w-full h-32 object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleCopy(url)}
                            >
                              Copy
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(url)}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* === Upload Image Tab === */}
              <TabsContent value="upload">
                <div className="mt-4">
                  <ImageUploader
                    folder={folder}
                    onUploadSuccess={() => {
                      // Optional: a better user experience would be to
                      // automatically switch to the 'all-images' tab and refresh the list.
                      // For now, we can just trigger a refetch for next time.
                      fetchImages();
                    }}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
