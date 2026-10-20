/** Input: catalog upload; Output: validated preview, execution result or template. */
import api, { type ApiRequestConfig } from "@/lib/axios";
import { saveBlobToFile } from "./fileDownload";
export type CatalogKind =
  "products" | "suppliers" | "stores" | "opening-inventory";
export interface CatalogPreview {
  canImport: boolean;
  summary: { total: number; valid: number; invalid: number };
  rows: Array<{
    row: number;
    values: Record<string, string>;
    errors: string[];
  }>;
}
export async function downloadCatalogTemplate(
  kind: CatalogKind,
  format: "csv" | "xlsx",
) {
  const blob = await api.get<Blob, Blob>(
    `/import/templates/${kind}?format=${format}`,
    { responseType: "blob", cache: { enabled: false } } as ApiRequestConfig,
  );
  saveBlobToFile(blob, `${kind}-template.${format}`);
}
export async function previewCatalog(
  kind: CatalogKind,
  file: File,
): Promise<CatalogPreview> {
  const form = new FormData();
  form.append("file", file);
  const response = await api.post<unknown, { data: CatalogPreview }>(
    `/import/catalog/${kind}/preview`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response.data;
}
export async function executeCatalog(
  kind: CatalogKind,
  file: File,
  confirmOpening: boolean,
): Promise<number> {
  const form = new FormData();
  form.append("file", file);
  form.append("confirmOpening", String(confirmOpening));
  const response = await api.post<unknown, { data: { imported: number } }>(
    `/import/catalog/${kind}/execute`,
    form,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response.data.imported;
}
