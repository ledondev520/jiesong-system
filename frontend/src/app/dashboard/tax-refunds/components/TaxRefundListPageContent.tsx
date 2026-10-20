/**
 * Input: 退税服务、URL 查询参数、router
 * Output: 浏览器权威页签、同步中断筛选导航、窄屏汇总与退税记录列表
 * Pos: 退税管理主列表页
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/lib/hooks/useTableSort";
import { useRouter, useSearchParams } from "next/navigation";
import {
  replaceBrowserUrl,
  useBrowserQuery,
} from "@/lib/hooks/useBrowserQuery";
import { Search, ReceiptText, Info } from "lucide-react";
import { toast } from "sonner";
import type { TaxRefund } from "@/types";
import { taxRefundService } from "@/services/taxRefund.service";
import { ErrorState } from "@/components/ui/data-state";
import { clearApiGetCache } from "@/lib/axios";
import { cachedFetch, invalidateCache } from "@/lib/api-cache";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  ModuleTabHeader,
  EXPORT_TABS,
} from "@/components/layout/ModuleTabHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TaxRefundStatusBadge,
  taxRefundStatusOptions,
} from "./TaxRefundStatusBadge";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { MobileListCard } from "@/components/mobile";
import { TaxRefundWorkbench } from "./TaxRefundWorkbench";

const DEFAULT_PAGE_SIZE = 20;

const CustomsDeclarationListPageContent = lazy(() =>
  import("@/app/customs-declarations/components/CustomsDeclarationListPageContent").then(
    (module) => ({
      default: module.CustomsDeclarationListPageContent,
    }),
  ),
);

export function TaxRefundListPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const browserQuery = new URLSearchParams(
    useBrowserQuery(searchParams.toString()),
  );
  const requestedView = browserQuery.get("view");
  const activeView =
    requestedView === "customs" || requestedView === "refunds"
      ? requestedView
      : "workbench";
  const initialKeyword = browserQuery.get("keyword") || "";
  const initialStatus = browserQuery.get("status") || "ALL";

  const [keyword, setKeyword] = useState(initialKeyword);
  const [status, setStatus] = useState(initialStatus);
  const [taxRefunds, setTaxRefunds] = useState<TaxRefund[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingDrafts, setGeneratingDrafts] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const deferredKeyword = useDeferredValue(keyword);

  const loadTaxRefunds = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const cacheKey = `tax-refunds-${deferredKeyword}-${status}-${pageSize}-${page}`;
      const response = await cachedFetch(cacheKey, () =>
        taxRefundService.getAll({
          page,
          pageSize,
          keyword: deferredKeyword || undefined,
          status: status === "ALL" ? undefined : status,
        }),
      );
      setTaxRefunds(response?.data?.items || []);
      setTotal(response?.data?.pagination?.total ?? 0);
    } catch {
      setLoadError(true);
      toast.error("加载退税记录失败");
    } finally {
      setLoading(false);
    }
  }, [deferredKeyword, status, pageSize, page]);

  useEffect(() => {
    if (activeView !== "refunds") {
      setLoading(false);
      return;
    }
    void loadTaxRefunds();
  }, [activeView, loadTaxRefunds]);

  const sort = useTableSort<TaxRefund, string>(
    taxRefunds,
    useCallback((item, key) => {
      switch (key) {
        case "refundNo":
          return item.refundNo ?? "";
        case "declaredAmount":
          return item.declaredAmount;
        case "refundableAmount":
          return item.refundableAmount;
        case "refundedAmount":
          return item.refundedAmount;
        case "appliedAt":
          return item.appliedAt ?? "";
        default:
          return null;
      }
    }, []),
  );

  const totalRefundable = taxRefunds.reduce(
    (sum, item) => sum + item.refundableAmount,
    0,
  );
  const totalRefunded = taxRefunds.reduce(
    (sum, item) => sum + item.refundedAmount,
    0,
  );
  const pendingCount = taxRefunds.filter(
    (item) => item.status === "APPLIED" || item.status === "APPROVED",
  ).length;

  const openDetail = (id: string) => {
    startTransition(() => {
      router.push(`/dashboard/tax-refunds/${id}`);
    });
  };

  const handleGenerateDrafts = async () => {
    setGeneratingDrafts(true);
    try {
      const response = await taxRefundService.generateDrafts({});
      const created = response?.data?.created ?? 0;
      const skipped = response?.data?.skipped ?? 0;
      toast.success(`自动生成完成：新增 ${created} 条，跳过 ${skipped} 条`);
      await loadTaxRefunds();
    } catch {
      toast.error("自动生成退税草稿失败");
    } finally {
      setGeneratingDrafts(false);
    }
  };

  const handleViewChange = (view: string) => {
    const href =
      view === "customs"
        ? "/dashboard/tax-refunds?view=customs"
        : view === "refunds"
          ? "/dashboard/tax-refunds?view=refunds"
          : "/dashboard/tax-refunds";
    setKeyword("");
    setStatus("ALL");
    setPage(1);
    replaceBrowserUrl(href);
  };

  return (
    <div className="space-y-6 pb-10">
      <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />
      <PageHeader
        title="出口退税"
        description="从待申报清单、进项发票核验到申报明细生成，在一个工作台完成税局操作前准备。"
        actions={
          activeView === "refunds" ? (
            <>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={keyword}
                  onChange={(event) => {
                    setKeyword(event.target.value);
                    setPage(1);
                  }}
                  placeholder="搜索退税单号、备注..."
                  className="h-11 rounded-xl border-border/70 bg-background/70 pl-10"
                />
              </div>

              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-11 w-40 rounded-xl">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  {taxRefundStatusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(keyword || status !== "ALL") && (
                <Button
                  variant="ghost"
                  className="h-11 rounded-xl"
                  onClick={() => {
                    setKeyword("");
                    setStatus("ALL");
                  }}
                >
                  重置
                </Button>
              )}

              <BusinessWrite>
                <Button
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={handleGenerateDrafts}
                  disabled={generatingDrafts}
                >
                  批量生成草稿
                </Button>
              </BusinessWrite>
            </>
          ) : undefined
        }
      />

      <Tabs
        value={activeView}
        onValueChange={handleViewChange}
        className="space-y-6"
      >
        <TabsList className="grid w-full max-w-xl grid-cols-3 border bg-background">
          <TabsTrigger value="workbench">退税工作台</TabsTrigger>
          <TabsTrigger value="customs">报关单</TabsTrigger>
          <TabsTrigger value="refunds">退税记录</TabsTrigger>
        </TabsList>

        <TabsContent value="workbench" className="mt-0">
          {activeView === "workbench" && <TaxRefundWorkbench />}
        </TabsContent>

        <TabsContent value="customs" className="mt-0">
          {activeView === "customs" && (
            <Suspense
              fallback={
                <div className="py-12 text-center text-sm text-muted-foreground">
                  加载报关单...
                </div>
              }
            >
              <CustomsDeclarationListPageContent embedded />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="refunds" className="mt-0 space-y-6">
          {/* 说明：退税单由出口合同流程自动生成 */}
          <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              退税单通过<strong>出口合同 → 一键生成三张表</strong>
              自动创建。此页面用于查看和跟进已生成的退税记录。
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 md:gap-4">
            <Card className="surface-panel">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  当前记录数
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">
                {taxRefunds.length}
              </CardContent>
            </Card>
            <Card className="surface-panel">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  可退金额合计
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">
                {totalRefundable.toLocaleString()}
              </CardContent>
            </Card>
            <Card className="surface-panel">
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  待跟进批次
                </CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">
                {pendingCount}
              </CardContent>
            </Card>
          </div>

          {/* 移动端卡片列表 */}
          <div className="space-y-3 md:hidden">
            {loading ? (
              <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
                加载中...
              </div>
            ) : loadError ? (
              <p className="py-8 text-center text-destructive">
                读取失败，请使用下方重试
              </p>
            ) : taxRefunds.length === 0 ? (
              <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
                暂无退税记录
              </div>
            ) : (
              sort.sortedData.map((taxRefund) => (
                <MobileListCard
                  key={taxRefund.id}
                  title={taxRefund.refundNo}
                  subtitle={taxRefund.appliedAt || "-"}
                  badge={<TaxRefundStatusBadge status={taxRefund.status} />}
                  fields={[
                    {
                      label: "申报金额",
                      value: `¥${taxRefund.declaredAmount.toLocaleString()}`,
                    },
                    {
                      label: "可退金额",
                      value: `¥${taxRefund.refundableAmount.toLocaleString()}`,
                      emphasis: "primary",
                    },
                    { label: "备注", value: taxRefund.note || "-" },
                  ]}
                  amount={{
                    label: "已退",
                    value: `¥${taxRefund.refundedAmount.toLocaleString()}`,
                    emphasis: "primary",
                  }}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 w-full rounded-xl"
                      onClick={() => openDetail(taxRefund.id)}
                    >
                      <ReceiptText className="mr-2 h-4 w-4" /> 查看详情
                    </Button>
                  }
                />
              ))
            )}
          </div>

          {/* 桌面端表格 */}
          <Card className="surface-panel hidden overflow-hidden md:block">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="h-4 w-4" />
                退税单列表
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      sortKey="refundNo"
                      currentSortKey={sort.sortKey}
                      currentSortDir={sort.sortDir}
                      onSort={sort.onSort}
                    >
                      退税单号
                    </SortableTableHead>
                    <TableHead>状态</TableHead>
                    <SortableTableHead
                      sortKey="declaredAmount"
                      currentSortKey={sort.sortKey}
                      currentSortDir={sort.sortDir}
                      onSort={sort.onSort}
                      className="text-right"
                    >
                      申报金额
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="refundableAmount"
                      currentSortKey={sort.sortKey}
                      currentSortDir={sort.sortDir}
                      onSort={sort.onSort}
                      className="text-right"
                    >
                      可退金额
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="refundedAmount"
                      currentSortKey={sort.sortKey}
                      currentSortDir={sort.sortDir}
                      onSort={sort.onSort}
                      className="text-right"
                    >
                      已退金额
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="appliedAt"
                      currentSortKey={sort.sortKey}
                      currentSortDir={sort.sortDir}
                      onSort={sort.onSort}
                    >
                      申请日期
                    </SortableTableHead>
                    <TableHead>备注</TableHead>
                    <TableHead className="w-[140px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-14 text-center text-muted-foreground"
                      >
                        加载中...
                      </TableCell>
                    </TableRow>
                  ) : loadError ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-8 text-center text-destructive"
                      >
                        读取失败，请重试
                      </TableCell>
                    </TableRow>
                  ) : taxRefunds.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-14 text-center text-muted-foreground"
                      >
                        暂无退税记录。
                      </TableCell>
                    </TableRow>
                  ) : (
                    sort.sortedData.map((taxRefund) => (
                      <TableRow key={taxRefund.id}>
                        <TableCell className="font-medium">
                          {taxRefund.refundNo}
                        </TableCell>
                        <TableCell>
                          <TaxRefundStatusBadge status={taxRefund.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {taxRefund.declaredAmount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {taxRefund.refundableAmount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {taxRefund.refundedAmount.toLocaleString()}
                        </TableCell>
                        <TableCell>{taxRefund.appliedAt}</TableCell>
                        <TableCell>{taxRefund.note || "-"}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            className="rounded-xl"
                            aria-label={`查看详情 ${taxRefund.refundNo}`}
                            onClick={() => openDetail(taxRefund.id)}
                          >
                            查看详情
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {loadError && (
            <ErrorState
              title="退税记录读取失败"
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    clearApiGetCache();
                    invalidateCache("tax-refunds-");
                    void loadTaxRefunds();
                  }}
                >
                  重试
                </Button>
              }
            />
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              共 {total} 条，第 {page} 页
            </span>
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
              disabled={page * pageSize >= total}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </div>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              本页已退金额合计：
              {loadError ? "—" : totalRefunded.toLocaleString()}
            </span>
            <PageSizeSelect
              value={pageSize}
              onChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
