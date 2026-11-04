/**
 * Input: 出口退税工作台 Interface、进项发票导入与退税草稿/申报明细操作
 * Output: KpiStat 汇总（含预计可退税额）、阶段/阻塞原因 chips、历史待办标注与开关、草稿报关单展示；手机卡片与桌面表格展示准备清单、发票核验、申报明细工作台
 * Pos: 出口退税页面主操作面；税局登录、勾选和提交仍由用户在官方系统完成
 */

"use client";

import { LoadingValue } from "@/components/ui/loading-value";
import { orMissing } from "@/lib/missing-value";
import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSearch,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { runAwait } from "@/lib/run-await";
import { MobileListCard } from "@/components/mobile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { KpiStat } from "@/components/ui/kpi-stat";
import { StageChips } from "@/components/ui/stage-chips";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InvoiceImportDialog } from "@/app/dashboard/finance/invoices/components/InvoiceImportDialog";
import { TaxRefundPreparationDialog } from "@/components/dialog/TaxRefundPreparationDialog";
import {
  taxRefundService,
  type TaxRefundWorkbench as WorkbenchData,
  type TaxRefundWorkbenchItem,
  type TaxRefundWorkbenchStage,
} from "@/services/taxRefund.service";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { ErrorState } from "@/components/ui/data-state";
import { clearApiGetCache } from "@/lib/axios";
import { InvoiceVerificationDialog } from "./InvoiceVerificationDialog";
import {
  BlockerChips,
  blockerReasons,
} from "@/components/tax-refund/BlockerChips";
import { CustomsDeclarationStatusBadge } from "@/app/dashboard/customs/components/CustomsDeclarationStatusBadge";
import { splitDraftSuffix } from "@/app/dashboard/customs/components/declarationNo";
import type { CustomsDeclarationStatus } from "@/types";

const stageMeta: Record<
  Exclude<TaxRefundWorkbenchStage, "ALL">,
  { label: string; className: string }
> = {
  PREPARATION: {
    label: "准备材料",
    className: "border-status-gray/40 bg-status-gray-soft text-status-gray",
  },
  VERIFICATION: {
    label: "待确认资料",
    className: "border-status-blue/40 bg-status-blue-soft text-status-blue",
  },
  DRAFT: {
    label: "资料已确认",
    className: "border-status-amber/40 bg-status-amber-soft text-status-amber",
  },
  READY_TO_EXPORT: {
    label: "可生成明细",
    className: "border-status-green/40 bg-status-green-soft text-status-green",
  },
  SUBMITTED: {
    label: "已提交跟进",
    className: "border-status-blue/40 bg-status-blue-soft text-status-blue",
  },
  REFUNDED: {
    label: "已退税",
    className: "border-status-green/40 bg-status-green-soft text-status-green",
  },
};

const stageOptions: Array<{ key: TaxRefundWorkbenchStage; label: string }> = [
  { key: "ALL", label: "全部阶段" },
  { key: "PREPARATION", label: "准备材料" },
  { key: "VERIFICATION", label: "待确认资料" },
  { key: "DRAFT", label: "资料已确认" },
  { key: "READY_TO_EXPORT", label: "可生成明细" },
  { key: "SUBMITTED", label: "已提交跟进" },
  { key: "REFUNDED", label: "已退税" },
];

const ALL_REASONS = "ALL";
const count = (value: number | undefined) =>
  value === undefined ? undefined : String(value);

// 与后端 listShipmentPreparations 同口径：出货/报关月份早于申报月份、或没有月份，都算历史待办。
function isHistorical(item: TaxRefundWorkbenchItem, filingMonth: string) {
  const month = (item.declaration?.exportDate || item.shippedAt || "").slice(
    0,
    7,
  );
  return !month || month < filingMonth;
}

function DeclarationCell({
  declaration,
}: {
  declaration: NonNullable<TaxRefundWorkbenchItem["declaration"]>;
}) {
  const { displayNo, isDraft } = splitDraftSuffix(declaration.declarationNo);
  return (
    <>
      <p className="font-mono" title={declaration.declarationNo}>
        {displayNo}
      </p>
      <div className="mt-0.5 flex items-center gap-1">
        <CustomsDeclarationStatusBadge
          status={declaration.status as CustomsDeclarationStatus}
        />
        {isDraft && <span className="text-muted-foreground">非正式单</span>}
      </div>
    </>
  );
}

export function TaxRefundWorkbench() {
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role);
  const canExport = role === "ADMIN" || role === "FINANCE";
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [filingMonth, setFilingMonth] = useState(() =>
    new Date()
      .toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" })
      .slice(0, 7),
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loadError, setLoadError] = useState(false);
  const [stage, setStage] = useState<TaxRefundWorkbenchStage>("ALL");
  // 以下两个只过滤已加载的这一页（后端没有按月份范围/原因筛选的参数），合计与分页仍是服务端口径。
  const [includeHistory, setIncludeHistory] = useState(true);
  const [reason, setReason] = useState(ALL_REASONS);
  const [exporting, setExporting] = useState(false);
  const [invoiceImportOpen, setInvoiceImportOpen] = useState(false);
  const [selected, setSelected] = useState<TaxRefundWorkbenchItem | null>(null);
  const [preparationOpen, setPreparationOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);

  // 渲染期已按新加载依赖重置、但对应 effect 尚未执行时，记录原 effect 会同步覆盖哪些状态：
  // "loadingAndError"（有申报月份，原先置 loading=true、loadError=false 后发请求）或
  // "all"（申报月份为空，原先还会置 data=null、loading=false 且不发请求）。
  // 窗口内落地的旧请求只跳过这些会被覆盖的写入，提示照常写入。
  const resetPendingRef = useRef<"loadingAndError" | "all" | null>(null);

  const requestWorkbench = useCallback(
    () =>
      runAwait(
        () =>
          taxRefundService.getWorkbench({
            page,
            pageSize,
            keyword: keyword || undefined,
            stage,
            filingMonth,
          }),
        (response) => {
          if (resetPendingRef.current !== "all") setData(response.data);
        },
        () => {
          if (resetPendingRef.current === null) setLoadError(true);
          toast.error("出口退税工作台加载失败");
        },
        () => {
          if (resetPendingRef.current === null) setLoading(false);
        },
      ),
    [keyword, stage, page, pageSize, filingMonth],
  );

  // 重试、导入成功后调用：与原 load 相同，先置 loading/清 loadError，申报月份为空时不发请求。
  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    if (!filingMonth) {
      setData(null);
      setLoading(false);
      return Promise.resolve();
    }
    return requestWorkbench();
  }, [filingMonth, requestWorkbench]);

  // 原先加载 effect 内的同步写入改为加载依赖变化时在渲染期执行；初值 null 使挂载时同样执行一次。
  const loadKey = [keyword, stage, page, pageSize, filingMonth] as const;
  const [prevLoadKey, setPrevLoadKey] = useState<typeof loadKey | null>(null);
  if (
    prevLoadKey === null ||
    loadKey.some((value, index) => !Object.is(value, prevLoadKey[index]))
  ) {
    setPrevLoadKey(loadKey);
    setLoadError(false);
    if (filingMonth) {
      setLoading(true);
    } else {
      setData(null);
      setLoading(false);
    }
  }

  useLayoutEffect(() => {
    resetPendingRef.current = filingMonth ? "loadingAndError" : "all";
  }, [filingMonth, requestWorkbench]);

  useEffect(() => {
    resetPendingRef.current = null;
    if (!filingMonth) return;
    void requestWorkbench();
  }, [filingMonth, requestWorkbench]);

  const openPreparation = (item: TaxRefundWorkbenchItem) => {
    setSelected(item);
    setPreparationOpen(true);
  };
  const openVerification = (item: TaxRefundWorkbenchItem) => {
    setSelected(item);
    setVerificationOpen(true);
  };

  const summary = loadError ? undefined : data?.summary;
  const loaded = data?.items ?? [];
  const historyCount = filingMonth
    ? loaded.filter((item) => isHistorical(item, filingMonth)).length
    : 0;
  const monthItems = includeHistory
    ? loaded
    : loaded.filter((item) => !isHistorical(item, filingMonth));
  const reasonCounts = new Map<string, number>();
  for (const item of monthItems) {
    for (const label of blockerReasons(item.issues)) {
      reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1);
    }
  }
  const rows =
    reason === ALL_REASONS
      ? monthItems
      : monthItems.filter((item) =>
          blockerReasons(item.issues).includes(reason),
        );
  const reasonChips = [
    { key: ALL_REASONS, label: "全部原因", count: monthItems.length },
    ...[...reasonCounts].map(([label, count]) => ({
      key: label,
      label,
      count,
    })),
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          出货后自动归集三单、报关单和进项发票；处理差异后一次确认生成清单。
        </p>
        <div className="flex flex-wrap gap-2">
          <BusinessWrite>
            <Button
              variant="outline"
              onClick={() => setInvoiceImportOpen(true)}
            >
              <Upload className="mr-2 h-4 w-4" />
              导入进项发票
            </Button>
          </BusinessWrite>
          <BusinessWrite>
            <Button
              disabled={exporting || !filingMonth || loadError || !canExport}
              title={canExport ? undefined : "由财务或管理员导出票面核验清单"}
              onClick={async () => {
                setExporting(true);
                try {
                  await taxRefundService.exportMonthlyPreparations(filingMonth);
                  toast.success("月度准备清单已导出");
                } catch (error: unknown) {
                  toast.error(
                    error instanceof Error ? error.message : "月度导出失败",
                  );
                } finally {
                  setExporting(false);
                }
              }}
            >
              {exporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              导出月度准备清单
            </Button>
          </BusinessWrite>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiStat
          label="待处理出口"
          loading={loading}
          value={count(summary?.contracts)}
        />
        <KpiStat
          label="材料核验通过"
          loading={loading}
          value={count(summary?.materialReadyCount)}
          valueClassName="text-status-green"
        />
        <KpiStat
          label="待复核合同"
          loading={loading}
          value={count(summary?.needsReview)}
          valueClassName="text-status-amber"
        />
        <KpiStat
          label="缺失发票"
          loading={loading}
          value={count(summary?.missingInvoices)}
          valueClassName="text-status-red"
        />
        <KpiStat
          label="已确认出货"
          loading={loading}
          value={count(summary?.confirmedCount)}
        />
        <KpiStat
          label="预计可退税额"
          loading={loading}
          value={
            summary?.estimatedRefundableAmount === undefined
              ? undefined
              : `¥${summary.estimatedRefundableAmount.toLocaleString()}`
          }
          subLabel="按当前资料估算，非申报金额"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{data?.disclaimer}</span>
        <span>资料变化后会重新核验，原归档保留</span>
      </div>
      <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        阶段与退税记录状态对照：「已提交跟进」= 记录状态「已申报 /
        已批准」；「已退税」=
        记录状态「已退税」（两处含义相同）；其余阶段尚在准备，记录为「草稿」或还没有记录。
      </p>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="month"
            aria-label="申报月份"
            className="w-44"
            value={filingMonth}
            onChange={(event) => {
              setFilingMonth(event.target.value);
              setPage(1);
            }}
          />
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={includeHistory}
              onCheckedChange={setIncludeHistory}
              aria-label="包含历史待办"
            />
            含历史待办
          </label>
          <Input
            className="max-w-sm"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPage(1);
            }}
            placeholder="搜索 EXP、报关单号、退税单号或问题"
          />
          {keyword && (
            <Button
              variant="ghost"
              onClick={() => {
                setKeyword("");
                setPage(1);
              }}
            >
              重置
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {filingMonth
            ? `申报月份 ${filingMonth}：列表含该月出货，以及更早尚未处理的历史待办（${loading ? "—" : historyCount} 条在本页）。`
            : "请选择申报月份。"}
          {!includeHistory &&
            ` 已隐藏本页 ${historyCount} 条历史待办；合计与分页仍含历史。`}
        </p>
      </div>

      <div className="space-y-2">
        <StageChips
          ariaLabel="退税阶段"
          stages={stageOptions}
          value={stage}
          showCount={false}
          onChange={(key) => {
            setStage(key as TaxRefundWorkbenchStage);
            setPage(1);
          }}
        />
        <StageChips
          ariaLabel="阻塞原因（仅本页）"
          stages={reasonChips}
          value={reason}
          loading={loading}
          onChange={setReason}
        />
      </div>

      {loadError && (
        <ErrorState
          title="退税工作台读取失败"
          action={
            <Button
              variant="outline"
              onClick={() => {
                clearApiGetCache();
                void load();
              }}
            >
              重试
            </Button>
          }
        />
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          共{" "}
          <LoadingValue loading={loading}>
            {orMissing(data?.total)}
          </LoadingValue>{" "}
          条，第 {page} 页
        </span>
        <PageSizeSelect
          value={pageSize}
          onChange={(value) => {
            setPageSize(value);
            setPage(1);
          }}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page * pageSize >= (data?.total ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          下一页
        </Button>
      </div>
      <div className="space-y-3 md:hidden">
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            加载中...
          </p>
        ) : loadError ? (
          <p className="py-8 text-center text-destructive">
            读取失败，请使用上方重试
          </p>
        ) : !rows.length ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            当前没有符合条件的待退税出口
          </p>
        ) : (
          rows.map((item) => (
            <MobileListCard
              key={item.shipmentKey || item.salesContractId}
              title={item.contractNo}
              subtitle={
                item.declaration
                  ? splitDraftSuffix(item.declaration.declarationNo).displayNo
                  : "未关联报关单"
              }
              badge={
                <Badge
                  variant="outline"
                  className={stageMeta[item.stage].className}
                >
                  {item.confirmationStatus === "CONFIRMED"
                    ? "资料已确认"
                    : item.confirmationStatus === "CHANGED"
                      ? "需重新确认"
                      : item.materialReady
                        ? "待确认"
                        : stageMeta[item.stage].label}
                </Badge>
              }
              fields={[
                { label: "核验通过", value: item.invoiceSummary.pass },
                { label: "待复核", value: item.invoiceSummary.review },
                { label: "缺失发票", value: item.invoiceSummary.missing },
                {
                  label: "出货日期",
                  value: item.shippedAt
                    ? new Date(item.shippedAt).toLocaleDateString("zh-CN")
                    : "未登记",
                },
              ]}
              amount={{
                label: "资料状态",
                value:
                  item.confirmationStatus === "CONFIRMED"
                    ? "已确认"
                    : item.materialReady
                      ? "可确认"
                      : "待补件",
              }}
              onClick={() =>
                router.push(`/dashboard/sales/${item.salesContractId}`)
              }
              action={
                <div className="space-y-3">
                  {item.issues.length ? (
                    <BlockerChips blockers={item.issues} />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      内部校验通过
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <BusinessWrite>
                      <Button
                        className="h-11 flex-1"
                        variant="outline"
                        onClick={() => openPreparation(item)}
                      >
                        <FileCheck2 className="mr-1 h-4 w-4" />
                        清单
                      </Button>
                    </BusinessWrite>
                    <BusinessWrite>
                      <Button
                        className="h-11 flex-1"
                        variant="outline"
                        onClick={() => openVerification(item)}
                      >
                        <FileSearch className="mr-1 h-4 w-4" />
                        发票
                      </Button>
                    </BusinessWrite>
                    {item.taxRefund && (
                      <Button
                        className="h-11"
                        variant="outline"
                        onClick={() =>
                          router.push(
                            `/dashboard/tax-refunds/${item.taxRefund?.id}`,
                          )
                        }
                      >
                        退税单
                      </Button>
                    )}
                  </div>
                </div>
              }
            />
          ))
        )}
      </div>

      <Card className="hidden overflow-hidden md:block">
        <CardHeader className="border-b">
          <CardTitle className="text-base">待申报清单</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>出口合同</TableHead>
                  <TableHead>当前阶段</TableHead>
                  <TableHead>报关单</TableHead>
                  <TableHead>发票核验</TableHead>
                  <TableHead>资料确认</TableHead>
                  <TableHead>阻塞项</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-14 text-center text-muted-foreground"
                    >
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : loadError ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-8 text-center text-destructive"
                    >
                      读取失败，请重试
                    </TableCell>
                  </TableRow>
                ) : !rows.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-14 text-center text-muted-foreground"
                    >
                      当前没有符合条件的待退税出口
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((item) => (
                    <TableRow key={item.shipmentKey || item.salesContractId}>
                      <TableCell>
                        <button
                          className="font-medium text-primary hover:underline"
                          onClick={() =>
                            router.push(
                              `/dashboard/sales/${item.salesContractId}`,
                            )
                          }
                        >
                          {item.contractNo}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {item.shippedAt
                            ? new Date(item.shippedAt).toLocaleDateString(
                                "zh-CN",
                              )
                            : "未登记出货日期"}
                          {isHistorical(item, filingMonth) && (
                            <Badge variant="outline" className="ml-1.5">
                              历史
                            </Badge>
                          )}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={stageMeta[item.stage].className}
                        >
                          {item.materialReady
                            ? "核验通过"
                            : stageMeta[item.stage].label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.declaration ? (
                          <DeclarationCell declaration={item.declaration} />
                        ) : (
                          <span className="text-status-red">未关联</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <p>
                          <span className="text-status-green">
                            通过 {item.invoiceSummary.pass}
                          </span>{" "}
                          ·{" "}
                          <span className="text-status-amber">
                            复核 {item.invoiceSummary.review}
                          </span>{" "}
                          ·{" "}
                          <span className="text-status-red">
                            缺失 {item.invoiceSummary.missing}
                          </span>
                        </p>
                      </TableCell>
                      <TableCell>
                        {item.confirmationStatus === "CONFIRMED"
                          ? "已确认"
                          : item.confirmationStatus === "CHANGED"
                            ? "资料变化，需重新确认"
                            : item.materialReady
                              ? "待确认"
                              : "待补件"}
                      </TableCell>
                      <TableCell className="max-w-sm whitespace-normal break-words text-xs text-muted-foreground">
                        {item.issues.length ? (
                          <BlockerChips blockers={item.issues} />
                        ) : (
                          <span className="text-status-green">
                            <CheckCircle2 className="mr-1 inline h-3 w-3" />
                            内部校验通过
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <BusinessWrite>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openPreparation(item)}
                            >
                              <FileCheck2 className="mr-1 h-3 w-3" />
                              清单
                            </Button>
                          </BusinessWrite>
                          <BusinessWrite>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openVerification(item)}
                            >
                              <FileSearch className="mr-1 h-3 w-3" />
                              发票
                            </Button>
                          </BusinessWrite>
                          {item.taxRefund && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                router.push(
                                  `/dashboard/tax-refunds/${item.taxRefund?.id}`,
                                )
                              }
                            >
                              退税单
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 rounded-lg border border-status-amber/40 bg-status-amber-soft p-3 text-xs text-status-amber">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        本页生成内部出货和月度准备清单。税局用途确认、正式申报及受理结果另行跟进。
      </div>

      <InvoiceImportDialog
        open={invoiceImportOpen}
        onOpenChange={setInvoiceImportOpen}
        onSuccess={() => void load()}
      />
      {selected && (
        <TaxRefundPreparationDialog
          open={preparationOpen}
          onOpenChange={setPreparationOpen}
          salesContractId={selected.salesContractId}
          contractNo={selected.contractNo}
          customsDeclarationId={selected.declaration?.id}
          onConfirmed={load}
        />
      )}
      {selected && (
        <InvoiceVerificationDialog
          open={verificationOpen}
          onOpenChange={setVerificationOpen}
          salesContractId={selected.salesContractId}
          contractNo={selected.contractNo}
        />
      )}
    </div>
  );
}
