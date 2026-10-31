/**
 * Input: 当前出口合同及用户确认的现汇、买方、包装种类、日期和价格覆盖
 * Output: 逐行定价/资料预检、确认生成并下载出口合同/商业发票/装箱单
 * Pos: 出口合同详情页的出口三单工作台
 */

"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { runAwait } from "@/lib/run-await";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  type ExportPacketInput,
  type ExportPacketPreview,
} from "@/services/exportPacket.service";
import type { SalesContract } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesContract: SalesContract;
  onGenerated?: () => void | Promise<void>;
}

const todayInShanghai = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const formatMoney = (value: number, currency: "USD" | "CNY") =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "USD" ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value || 0);

const isPreviewFormComplete = (form: ExportPacketInput) =>
  !!form.sellerName.trim() &&
  !!form.packageKind.trim() &&
  !!form.buyerName.trim() &&
  !!form.tradeTerm.trim();

const sourceLabel = {
  history: "历史同款",
  formula: "成本公式",
  manual: "人工确认",
};

export function ExportPacketWorkbenchDialog({
  open,
  onOpenChange,
  salesContract,
  onGenerated,
}: Props) {
  const [form, setForm] = useState<ExportPacketInput>({
    // 工作台填的是现汇；报价转换的订单 exchangeRate 存的是计价汇率，所以用详情接口给出的 spotRate 预填
    spotRate:
      (salesContract.rateBasis === "effective"
        ? salesContract.spotRate
        : salesContract.exchangeRate) || 6.8,
    sellerName: "上海捷淞国际物流有限公司",
    buyerName: "",
    packageKind: "",
    tradeTerm: "FOB",
    documentDate: todayInShanghai(),
    priceOverrides: [],
  });
  const [preview, setPreview] = useState<ExportPacketPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [manualPrices, setManualPrices] = useState<Record<string, string>>({});

  const input = useMemo<ExportPacketInput>(
    () => ({
      ...form,
      priceOverrides: Object.entries(manualPrices)
        .filter(([, value]) => Number(value) > 0)
        .map(([packingItemId, value]) => ({
          packingItemId,
          unitPriceUsd: Number(value),
        })),
    }),
    [form, manualPrices],
  );

  // 以下两处同步写入原先在 effect 内执行，改为渲染期执行：
  // 1. 参数变化时清空预检结果（挂载时 preview 初值即为 null）；
  // 2. 打开状态变化（含挂载）时：打开且已填包装种类时，其余必填缺失则清空预检结果，否则置 loading 并发起预检。
  const [prevInput, setPrevInput] = useState(input);
  if (prevInput !== input) {
    setPrevInput(input);
    setPreview(null);
  }
  const [openSync, setOpenSync] = useState<{
    open: boolean;
    kind: "request" | "invalid" | null;
  } | null>(null);
  if (openSync === null || openSync.open !== open) {
    const kind =
      !open || !form.packageKind.trim()
        ? null
        : isPreviewFormComplete(form)
          ? "request"
          : "invalid";
    setOpenSync({ open, kind });
    if (kind === "invalid") setPreview(null);
    else if (kind === "request") setLoading(true);
  }
  // 渲染期已写入、对应被动 effect 尚未执行的窗口内完成的旧预检：原 effect 会随后覆盖 preview（置 null）或
  // loading（置 true），因此窗口内跳过被覆盖的那项写入。
  const previewPendingRef = useRef(false);
  const loadingPendingRef = useRef(false);
  useLayoutEffect(() => {
    previewPendingRef.current = true;
  }, [input]);
  useLayoutEffect(() => {
    if (openSync?.kind === "invalid") previewPendingRef.current = true;
    else if (openSync?.kind === "request") loadingPendingRef.current = true;
  }, [openSync]);
  useEffect(() => {
    previewPendingRef.current = false;
  }, [input]);

  const requestPreview = () =>
    runAwait(
      () => exportPacketService.preview(salesContract.id, input),
      (response) => {
        if (!previewPendingRef.current) setPreview(response.data);
      },
      (error: unknown) => {
        const message =
          error && typeof error === "object" && "message" in error
            ? String(error.message)
            : "出口三单预检失败";
        toast.error(message);
      },
      () => {
        if (!loadingPendingRef.current) setLoading(false);
      },
    );

  const runPreview = () => {
    if (!isPreviewFormComplete(form)) {
      setPreview(null);
      return Promise.resolve();
    }
    setLoading(true);
    return requestPreview();
  };

  useEffect(() => {
    previewPendingRef.current = false;
    loadingPendingRef.current = false;
    if (openSync?.kind !== "request") return;
    void requestPreview();
    // 仅在打开时自动预检；人工价格在点击“重新预检”时提交，避免逐键请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSync]);

  const handleGenerate = async () => {
    if (!preview?.ready) return;
    setGenerating(true);
    try {
      const response = await exportPacketService.generate(
        salesContract.id,
        input,
      );
      await exportPacketService.download(
        response.data.file.id,
        response.data.file.fileName,
      );
      toast.success("出口合同、商业发票、装箱单已生成、归档并下载");
      await onGenerated?.();
      onOpenChange(false);
    } catch (error: unknown) {
      const message =
        error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "出口三单生成失败";
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[94vh] flex-col overflow-hidden sm:max-w-7xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            出口三单工作台 · {salesContract.contractNo}
          </DialogTitle>
          <DialogDescription>
            一次预检并生成外销合同、商业发票、装箱单。预览不改数据，确认生成后才回写采用价格并归档版本。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">当前现汇</label>
              <Input
                type="number"
                step="0.0001"
                min="0.2001"
                value={form.spotRate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    spotRate: Number(event.target.value),
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">卖方名称</label>
              <Input
                value={form.sellerName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sellerName: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">买方名称</label>
              <Input
                value={form.buyerName}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    buyerName: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">包装种类（须确认）</label>
              <Input
                placeholder="例如：纸箱、木箱或纸箱+木箱"
                value={form.packageKind}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    packageKind: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">贸易术语</label>
              <Input
                placeholder="例如：FOB"
                value={form.tradeTerm}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tradeTerm: event.target.value.toUpperCase(),
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">单证日期</label>
              <Input
                type="date"
                value={form.documentDate}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    documentDate: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          {(!form.sellerName.trim() ||
            !form.packageKind.trim() ||
            !form.buyerName.trim() ||
            !form.tradeTerm.trim()) && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                先确认买卖方、包装种类和贸易术语，再运行预检；系统不会替你猜正式单证信息。
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              调整汇率 = 现汇 − 0.2；可退税目标加价 30%；零退税不超过
              10%；历史价须同品名同规格且复算合规。
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={runPreview}
              disabled={
                loading ||
                !form.sellerName.trim() ||
                !form.packageKind.trim() ||
                !form.buyerName.trim() ||
                !form.tradeTerm.trim()
              }
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              重新预检
            </Button>
          </div>

          {preview && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">调整汇率</p>
                    <p className="mt-1 text-xl font-semibold">
                      {preview.pricingPolicy.effectiveRate}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">整票金额</p>
                    <p className="mt-1 text-xl font-semibold">
                      {formatMoney(preview.summary.totalUsd, "USD")}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">采购成本</p>
                    <p className="mt-1 text-xl font-semibold">
                      {formatMoney(preview.summary.purchaseCostCny, "CNY")}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">包装/毛净重</p>
                    <p className="mt-1 text-sm font-semibold">
                      {preview.summary.boxes} 件 · {preview.summary.grossWeight}
                      /{preview.summary.netWeight} kg
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">预检状态</p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
                      {preview.ready ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      )}
                      {preview.ready
                        ? "可以生成"
                        : `${preview.summary.errorCount} 项待修正`}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {preview.issues.length > 0 && (
                <Alert variant={preview.ready ? "default" : "destructive"}>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <ul className="list-disc space-y-1 pl-4">
                      {preview.issues.slice(0, 12).map((issue, index) => (
                        <li
                          key={`${issue.code}-${issue.packingItemId || index}`}
                        >
                          {issue.productName ? `${issue.productName}：` : ""}
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">
                        商品 / 规格
                      </TableHead>
                      <TableHead>HS / 退税</TableHead>
                      <TableHead className="text-right">采购成本</TableHead>
                      <TableHead>采用依据</TableHead>
                      <TableHead className="min-w-[135px]">
                        采用单价 USD
                      </TableHead>
                      <TableHead className="text-right">总价 USD</TableHead>
                      <TableHead className="text-right">实际加价</TableHead>
                      <TableHead>状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.lines.map((line) => (
                      <TableRow key={line.packingItemId}>
                        <TableCell>
                          <p className="font-medium">
                            {line.index}. {line.productName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {line.specification || "未确认"} · {line.quantity}{" "}
                            {line.unit} · {line.boxes} 件包装
                          </p>
                          <p
                            className="mt-1 max-w-[240px] truncate text-xs text-muted-foreground"
                            title={line.declaration}
                          >
                            {line.declaration || "申报要素未确认"}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="font-mono text-xs">
                            {line.hsCode || "-"}
                          </p>
                          <Badge
                            variant={
                              line.refundRate === 0
                                ? "destructive"
                                : "secondary"
                            }
                            className="mt-1"
                          >
                            {line.refundRate === null
                              ? "待确认"
                              : `${line.refundRate}%`}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(line.purchaseCostCny, "CNY")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {sourceLabel[line.pricingSource]}
                          </Badge>
                          <p className="mt-1 max-w-[190px] text-xs text-muted-foreground">
                            {line.pricingReference}
                          </p>
                          {line.rejectedHistoricalQuote && (
                            <p className="mt-1 text-xs text-amber-700">
                              已拒绝 {line.rejectedHistoricalQuote.contractNo}{" "}
                              历史价
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            aria-label={`${line.productName}采用单价`}
                            type="number"
                            min="0"
                            step="0.0001"
                            placeholder={String(line.unitPriceUsd)}
                            value={manualPrices[line.packingItemId] || ""}
                            onChange={(event) =>
                              setManualPrices((current) => ({
                                ...current,
                                [line.packingItemId]: event.target.value,
                              }))
                            }
                          />
                          <p className="mt-1 text-xs text-muted-foreground">
                            建议 {line.unitPriceUsd}
                          </p>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {line.totalUsd.toLocaleString("zh-CN", {
                            maximumFractionDigits: 2,
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          {line.realizedMarkup === null
                            ? "-"
                            : `${(line.realizedMarkup * 100).toFixed(2)}%`}
                        </TableCell>
                        <TableCell>
                          {line.issues.length > 0 ? (
                            <Badge variant="destructive">
                              {line.issues.length} 项
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="text-emerald-700"
                            >
                              完整
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!preview?.ready || loading || generating}
          >
            {generating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            确认生成、归档并下载
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
