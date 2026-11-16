/**
 * Input: 出货汇总 Excel 与本票人工价格
 * Output: 自动识别合同、计算价格、原版四单下载；多票和缺项在界面处理
 * Pos: 出口列表的 Excel 制单入口，复用现有四单服务
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  exportPacketService,
  type ExcelPacketInput,
  type ExcelPacketPreview,
} from "@/services/exportPacket.service";
import { saveBlobToFile } from "@/services/fileDownload";

const money = (value: number) =>
  value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const percent = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(2)}%`;
const message = (error: unknown) =>
  error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "四单生成失败，请重试";

export function ExportPacketExcelDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ExcelPacketPreview | null>(null);
  const [input, setInput] = useState<ExcelPacketInput>({});
  const [manualPrices, setManualPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const request = useRef(0);
  const abort = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      request.current += 1;
      abort.current?.abort();
    },
    [],
  );

  const close = (next: boolean) => {
    if (!next) {
      request.current += 1;
      abort.current?.abort();
    }
    onOpenChange(next);
  };
  const download = async (
    source: File,
    result: ExcelPacketPreview,
    id: number,
    signal: AbortSignal,
  ) => {
    if (!result.packet?.ready || !result.selectedContractNo) return;
    const blob = await exportPacketService.generateExcel(
      source,
      {
        ...result.input,
        contractNo: result.selectedContractNo,
        sourceVersion: result.sourceVersion,
        packetVersion: result.packetVersion,
      },
      signal,
    );
    if (id !== request.current || signal.aborted) return;
    saveBlobToFile(blob, `出口四单+${result.selectedContractNo}.xlsx`);
    setDownloaded(true);
    toast.success("合同、发票、箱单、报关预录信息已生成并下载");
  };
  const read = async (
    source: File,
    options: ExcelPacketInput,
    autoDownload: boolean,
  ) => {
    const id = ++request.current;
    abort.current?.abort();
    abort.current = new AbortController();
    const signal = abort.current.signal;
    setBusy(true);
    setError("");
    setDownloaded(false);
    setPreview(null);
    try {
      const response = await exportPacketService.previewExcel(
        source,
        options,
        signal,
      );
      if (id !== request.current || signal.aborted) return;
      setPreview(response.data);
      setInput({
        ...response.data.input,
        contractNo: response.data.selectedContractNo || undefined,
      });
      setDirty(false);
      if (autoDownload && response.data.packet?.ready)
        await download(source, response.data, id, signal);
    } catch (failure) {
      if (id === request.current && !signal.aborted) setError(message(failure));
    } finally {
      if (id === request.current) setBusy(false);
    }
  };
  const onFile = (source: File) => {
    setFile(source);
    setManualPrices({});
    setInput({});
    setDirty(false);
    void read(source, {}, true);
  };
  const acceptFiles = (files: FileList | null) => {
    const source = files?.[0];
    if (
      !source ||
      files?.length !== 1 ||
      !/\.xlsx$/i.test(source.name) ||
      source.size > 10 * 1024 * 1024
    ) {
      setError("请上传一个不超过10MB的 .xlsx 文件");
      return;
    }
    onFile(source);
  };
  const update = (key: keyof ExcelPacketInput, value: string | number) => {
    setInput((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setDownloaded(false);
  };
  const recalculate = () => {
    if (!file) return;
    const priceOverrides = Object.entries(manualPrices).map(
      ([packingItemId, value]) => ({
        packingItemId,
        unitPriceUsd: Number(value),
      }),
    );
    if (
      priceOverrides.some(
        (entry) =>
          !Number.isFinite(entry.unitPriceUsd) || entry.unitPriceUsd <= 0,
      )
    ) {
      setError("人工单价必须大于0；清空可恢复Excel或自动建议价");
      return;
    }
    void read(file, { ...input, priceOverrides }, false);
  };
  const generate = async () => {
    if (!file || !preview?.packet?.ready || dirty || busy) return;
    const id = ++request.current;
    abort.current?.abort();
    abort.current = new AbortController();
    setBusy(true);
    setError("");
    try {
      await download(file, preview, id, abort.current.signal);
    } catch (failure) {
      if (id === request.current && !abort.current.signal.aborted)
        setError(message(failure));
    } finally {
      if (id === request.current) setBusy(false);
    }
  };
  const packet = preview?.packet;
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-6xl lg:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Excel 出四单
          </DialogTitle>
          <DialogDescription>
            上传出货汇总，自动生成合同、发票、箱单和报关预录信息。文件包含多票时选择本次
            EXP。生成时会记住本票人工单价，供下次同品名、同规格报价参考。
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <label
            htmlFor="excel-packet-file"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              acceptFiles(event.dataTransfer.files);
            }}
            className="block cursor-pointer rounded-lg border-2 border-dashed p-6 text-center focus-within:outline focus-within:outline-2 focus-within:outline-ring"
          >
            <input
              id="excel-packet-file"
              name="shipmentWorkbook"
              type="file"
              accept=".xlsx"
              className="sr-only"
              aria-label="上传出货汇总Excel"
              onChange={(event) => {
                acceptFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm">
              {file ? file.name : "拖入 Excel，或点击选择文件"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              .xlsx，最大10MB
            </p>
          </label>
          {busy && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在读取并生成四单…
            </p>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {preview && preview.contracts.length > 1 && (
            <div className="space-y-1.5">
              <label
                htmlFor="excel-packet-contract"
                className="text-sm font-medium"
              >
                本次合同号
              </label>
              <Select
                value={preview.selectedContractNo || ""}
                disabled={busy}
                onValueChange={(value) => {
                  setManualPrices({});
                  if (file)
                    void read(
                      file,
                      { ...input, contractNo: value, priceOverrides: [] },
                      true,
                    );
                }}
              >
                <SelectTrigger id="excel-packet-contract">
                  <SelectValue placeholder="选择本次 EXP" />
                </SelectTrigger>
                <SelectContent>
                  {preview.contracts.map((entry) => (
                    <SelectItem key={entry.contractNo} value={entry.contractNo}>
                      {entry.contractNo}（{entry.rowCount}行）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {packet && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="excel-packet-buyer" className="text-sm">
                    买方
                  </label>
                  <Input
                    id="excel-packet-buyer"
                    disabled={busy}
                    value={input.buyerName || ""}
                    onChange={(event) =>
                      update("buyerName", event.target.value)
                    }
                  />
                </div>
                <div>
                  <label htmlFor="excel-packet-rate" className="text-sm">
                    本票现汇 CNY/USD
                  </label>
                  <Input
                    id="excel-packet-rate"
                    disabled={busy}
                    type="number"
                    step="0.0001"
                    value={input.spotRate ?? ""}
                    onChange={(event) =>
                      update("spotRate", Number(event.target.value))
                    }
                  />
                </div>
                <div>
                  <label htmlFor="excel-packet-date" className="text-sm">
                    单证日期
                  </label>
                  <Input
                    id="excel-packet-date"
                    disabled={busy}
                    type="date"
                    value={input.documentDate || ""}
                    onChange={(event) =>
                      update("documentDate", event.target.value)
                    }
                  />
                </div>
              </div>
              <dl className="grid gap-3 rounded-lg bg-muted/40 p-4 sm:grid-cols-4">
                {[
                  ["四单总额 USD", money(packet.summary.totalUsd)],
                  ["采购成本 CNY", money(packet.summary.purchaseCostCny)],
                  ["成本加价率", percent(packet.summary.costMarkupRate)],
                  ["销售毛利率", percent(packet.summary.salesGrossMarginRate)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-lg font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground">
                按调整汇率 {packet.pricingPolicy.effectiveRate}{" "}
                计算。加价率＝价差÷成本；毛利率＝价差÷销售额。未计退税、运费及手续费。税库：
                {preview.taxVersion}。
              </p>
              {preview.excludedRows.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  本票纳入 {packet.lines.length} 行；另有{" "}
                  {preview.excludedRows.length}{" "}
                  行标记为他方报关、不报关或埋单，未纳入本方四单。
                </p>
              )}
              {packet.issues.length > 0 && (
                <Alert variant={packet.ready ? "default" : "destructive"}>
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {packet.issues.map((issue, index) => (
                        <li key={`${issue.code}-${index}`}>
                          {issue.productName ? `${issue.productName}：` : ""}
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>商品</TableHead>
                      <TableHead>数量</TableHead>
                      <TableHead>HS</TableHead>
                      <TableHead>采用单价 USD</TableHead>
                      <TableHead>金额 USD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packet.lines.map((line) => (
                      <TableRow key={line.packingItemId}>
                        <TableCell className="min-w-36">
                          {line.index}. {line.productName}
                        </TableCell>
                        <TableCell>
                          {line.quantity} {line.unit}
                        </TableCell>
                        <TableCell>{line.hsCode || "待补"}</TableCell>
                        <TableCell>
                          <Input
                            className="min-w-32"
                            aria-label={`${line.productName}出口单价`}
                            disabled={busy}
                            type="number"
                            step="0.0001"
                            placeholder={String(line.unitPriceUsd)}
                            value={manualPrices[line.packingItemId] ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              setManualPrices((current) => {
                                const next = { ...current };
                                if (value === "")
                                  delete next[line.packingItemId];
                                else next[line.packingItemId] = value;
                                return next;
                              });
                              setDirty(true);
                              setDownloaded(false);
                            }}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            {line.pricingSource === "manual"
                              ? "保留人工价"
                              : line.pricingSource === "history"
                                ? "同规格历史价"
                                : "成本建议价"}
                            ：{line.unitPriceUsd}
                          </p>
                        </TableCell>
                        <TableCell>{money(line.totalUsd)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {downloaded && (
                <p role="status" className="text-sm text-emerald-700">
                  四单已生成并下载，共 {packet.lines.length} 行、
                  {packet.summary.boxes} 箱。
                </p>
              )}
              {dirty && (
                <p role="status" className="text-sm text-muted-foreground">
                  参数已修改，请重新计算后下载。
                </p>
              )}
            </>
          )}
        </div>
        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => close(false)}>
            关闭
          </Button>
          <Button
            variant="outline"
            disabled={!file || busy}
            onClick={recalculate}
          >
            重新计算
          </Button>
          <Button disabled={!packet?.ready || dirty || busy} onClick={generate}>
            下载四单
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
