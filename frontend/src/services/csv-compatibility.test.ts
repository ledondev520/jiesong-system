/** CSV downloads preserve BOM bytes; existing spreadsheet readers ignore it in headers. */
import { Buffer } from "node:buffer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { downloadCatalogTemplate } from "./catalog-import.service";
import { exportSystemData, exportSystemLogsCsv } from "./system.service";
import { taxRefundService } from "./taxRefund.service";

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock("@/lib/axios", () => ({ default: { get: apiGet } }));
vi.mock("@/lib/auth-token", () => ({ getAuthToken: () => null }));
vi.mock("@/lib/browser-session", () => ({
  getBrowserSessionHeaders: () => ({}),
}));

const csv = "\uFEFF报关名,数量\r\n中文商品,001\r\n";
const bytes = Buffer.from(csv, "utf8");
const createObjectURL = vi.fn<(blob: Blob) => string>(
  () => "blob:synthetic-csv",
);

beforeEach(() => {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it.each([
  ["sales", () => exportSystemData("sales")],
  ["products", () => exportSystemData("products")],
  ["operation logs", () => exportSystemLogsCsv()],
  ["tax refunds", () => taxRefundService.exportDeclarationCsv()],
  ["catalog template", () => downloadCatalogTemplate("products", "csv")],
] as const)(
  "%s downloads preserve the original BOM-bearing Blob",
  async (_name, download) => {
    const blob = new Blob([new Uint8Array(bytes)], {
      type: "text/csv; charset=utf-8",
    });
    apiGet.mockResolvedValue(blob);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "Content-Type": "text/csv; charset=utf-8" }),
        blob: async () => blob,
      }),
    );
    await download();
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(blob);
    const downloaded = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(createObjectURL.mock.calls[0][0]);
    });
    expect([...new Uint8Array(downloaded).slice(0, 3)]).toEqual([
      0xef, 0xbb, 0xbf,
    ]);
    expect(Buffer.from(downloaded).equals(bytes)).toBe(true);
  },
);

it.each(["binary", "array"] as const)(
  "SheetJS %s import keeps the Chinese first header and data with BOM",
  (type) => {
    const data =
      type === "binary" ? bytes.toString("binary") : new Uint8Array(bytes);
    const workbook = XLSX.read(data, { type });
    expect(
      XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {
        raw: false,
      }),
    ).toEqual([{ 报关名: "中文商品", 数量: "001" }]);
  },
);
