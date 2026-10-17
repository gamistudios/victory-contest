// Download a server-generated CSV (`?format=csv`) through the authenticated axios
// client (the admin cookie rides along, so a plain <a href> would not work cross-origin).
import api from "@/services/api";

export type QueryValue = string | number | string[] | undefined | null;

/** Drops empty values and joins arrays with commas (the BE splits comma lists). */
export function cleanParams(p: Record<string, QueryValue>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      const joined = v.filter(Boolean).join(",");
      if (joined) out[k] = joined;
    } else if (v !== "") {
      out[k] = v;
    }
  }
  return out;
}

export async function downloadCsv(path: string, params: Record<string, QueryValue>, filename: string): Promise<void> {
  const res = await api.get(path, { params: { ...cleanParams(params), format: "csv" }, responseType: "blob" });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
