import api from "./api";

export type ImageItem = {
  url: string;
};

export async function uploadImage(
  file: File,
  folder = "articles"
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folder);
  const { data } = await api.post("/api/images/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data.url as string;
}

export async function listImages(
  folder = "articles",
  max = 100
): Promise<string[]> {
  const { data } = await api.get(`/api/images/list`, {
    params: { folder, max },
  });
  return data.images as string[];
}

export async function deleteImage(idOrUrl: string): Promise<void> {
  await api.delete(`/api/images/delete`, { params: { id: idOrUrl } });
}
