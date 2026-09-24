import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { uploadImage } from "@/services/imageServices";

// Mock upload service for demonstration.
// Replace this with your actual image upload service call.

type ImageUploaderProps = {
  folder: string;
  // Optional: A callback to run after a successful upload
  onUploadSuccess?: (url: string) => void;
};

export default function ImageUploader({
  folder,
  onUploadSuccess,
}: ImageUploaderProps) {
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setImageUrl(null); // Reset previous URL when a new file is selected
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Please select a file first.");
      return;
    }

    setLoading(true);
    const promise = uploadImage(file, folder);

    toast.promise(promise, {
      loading: "Uploading your image...",
      success: (url) => {
        setImageUrl(url);
        setFile(null); // Clear the input after successful upload
        onUploadSuccess?.(url);
        return "Image uploaded successfully!";
      },
      error: "Failed to upload image.",
      finally: () => setLoading(false),
    });
  };

  const handleCopyUrl = async () => {
    if (!imageUrl) return;
    await navigator.clipboard.writeText(imageUrl);
    toast.success("Image URL copied to clipboard!");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid w-full max-w-sm items-center gap-1.5">
        <Input
          id="picture"
          type="file"
          accept="image/png, image/jpeg, image/gif"
          onChange={handleFileChange}
          disabled={loading}
        />
      </div>
      <Button onClick={handleUpload} disabled={!file || loading}>
        {loading ? "Uploading..." : "Upload Image"}
      </Button>

      {imageUrl && (
        <div className="mt-4 p-3 border rounded-md bg-muted">
          <p className="text-sm font-medium mb-2">Upload successful!</p>
          <div className="flex items-center gap-2">
            <Input readOnly value={imageUrl} className="text-xs flex-grow" />
            <Button variant="outline" size="sm" onClick={handleCopyUrl}>
              Copy
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
