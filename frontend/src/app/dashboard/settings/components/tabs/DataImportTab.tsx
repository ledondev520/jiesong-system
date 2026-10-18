/** Input: operator-selected CSV/xlsx; Output: templates, read-only preview and explicit import. */
"use client";
import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  downloadCatalogTemplate,
  previewCatalog,
  executeCatalog,
  type CatalogKind,
  type CatalogPreview,
} from "@/services/catalog-import.service";
const kinds: Array<{ value: CatalogKind; label: string }> = [
  { value: "products", label: "商品" },
  { value: "suppliers", label: "供应商" },
  { value: "stores", label: "门店" },
  { value: "opening-inventory", label: "库存期初" },
];
const messageOf = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "操作失败，请重试";
export function DataImportTab() {
  const [kind, setKind] = useState<CatalogKind>("products");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CatalogPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const reset = () => {
    setPreview(null);
    setConfirmed(false);
    setMessage("");
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(messageOf(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>批量导入</CardTitle>
        <CardDescription>
          下载 CSV 或 xlsx 模板，填写后先预览。预览不保存任何数据。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="catalog-kind">导入类型</Label>
            <select
              id="catalog-kind"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as CatalogKind);
                setFile(null);
                reset();
              }}
            >
              {kinds.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["csv", "xlsx"] as const).map((format) => (
              <Button
                key={format}
                variant="outline"
                onClick={() =>
                  void run(async () => {
                    await downloadCatalogTemplate(kind, format);
                  })
                }
              >
                下载 {format.toUpperCase()} 模板
              </Button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            先导入商品、供应商和门店。门店港口代码须已存在。库存期初的商品 ID
            可从商品导出中取得，单位须与档案一致。
          </p>
          <div className="space-y-2">
            <Label htmlFor="catalog-file">CSV 或 xlsx 文件</Label>
            <Input
              key={kind}
              id="catalog-file"
              type="file"
              accept=".csv,.xlsx"
              onChange={(event) => {
                setFile(event.target.files?.[0] || null);
                reset();
              }}
            />
          </div>
          <Button
            disabled={!file || busy}
            onClick={() =>
              void run(async () => {
                if (file) {
                  setPreview(null);
                  setConfirmed(false);
                  setPreview(await previewCatalog(kind, file));
                }
              })
            }
          >
            校验并预览（不落库）
          </Button>
          {preview && (
            <div className="space-y-3">
              <p role="status">
                共 {preview.summary.total} 行，有效 {preview.summary.valid}{" "}
                行，错误 {preview.summary.invalid} 行。
              </p>
              <div className="max-h-80 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <caption className="p-2 text-left text-muted-foreground">
                    预览前 50 行，执行时再次校验全部数据。
                  </caption>
                  <thead>
                    <tr>
                      <th className="p-2 text-left">行号</th>
                      <th className="p-2 text-left">内容</th>
                      <th className="p-2 text-left">校验结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 50).map((row) => (
                      <tr key={row.row} className="border-t">
                        <td className="p-2">{row.row}</td>
                        <td className="max-w-md break-words p-2">
                          {Object.entries(row.values)
                            .map(([key, value]) => `${key}：${value}`)
                            .join("；")}
                        </td>
                        <td className="p-2">
                          {row.errors.join("；") || "通过"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {kind === "opening-inventory" && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="opening-confirm"
                    checked={confirmed}
                    onCheckedChange={(value) => setConfirmed(value === true)}
                  />
                  <Label htmlFor="opening-confirm">
                    我已盘点核对期初数量，并确认期初编号未重复使用
                  </Label>
                </div>
              )}
              <Button
                disabled={
                  !preview.canImport ||
                  busy ||
                  (kind === "opening-inventory" && !confirmed)
                }
                onClick={() =>
                  void run(async () => {
                    if (!file) return;
                    try {
                      const count = await executeCatalog(kind, file, confirmed);
                      setMessage(`已导入 ${count} 行。`);
                    } finally {
                      setPreview(null);
                      setConfirmed(false);
                    }
                  })
                }
              >
                确认导入
              </Button>
            </div>
          )}
        </fieldset>
        {message && (
          <p role="alert" className="text-sm">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
