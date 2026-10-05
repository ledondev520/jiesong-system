/**
 * Input: 报关单服务、URL 查询参数、router
 * Output: 报关单列表页（保留所属页签的筛选同步、服务端分页、手机卡片与桌面表格）
 * Pos: 报关单管理主列表页
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/lib/hooks/useTableSort";
import { useRouter, useSearchParams } from "next/navigation";
import type { CustomsDeclaration } from "@/types";
import { customsDeclarationService } from "@/services/customsDeclaration.service";
import { cachedFetch } from "@/lib/api-cache";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageSizeSelect } from "@/components/ui/page-size-select";
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
import { MobileListCard } from "@/components/mobile";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  ModuleTabHeader,
  EXPORT_TABS,
} from "@/components/layout/ModuleTabHeader";
import { Search, Plus, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  CustomsDeclarationStatusBadge,
  customsDeclarationStatusOptions,
} from "./CustomsDeclarationStatusBadge";

const PAGE_SIZE = 20;

const formatAmount = (amount: number, currency: string) =>
  `${currency} ${amount.toLocaleString()}`;

export function CustomsDeclarationListPageContent({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";
  const queryString = searchParams.toString();
  const initialKeyword = searchParams.get("keyword") || "";
  const initialStatus = searchParams.get("status") || "ALL";

  const [keyword, setKeyword] = useState(initialKeyword);
  const [status, setStatus] = useState(initialStatus);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const deferredKeyword = useDeferredValue(keyword);

  // 同步搜索状态到 URL
  const updateUrlParams = useCallback(
    (newKeyword: string, newStatus: string) => {
      // 嵌入退税页时保留 view=customs 等父页面参数，只更新本列表的筛选。
      const params = new URLSearchParams(queryString);
      if (newKeyword) params.set("keyword", newKeyword);
      else params.delete("keyword");
      if (newStatus && newStatus !== "ALL") params.set("status", newStatus);
      else params.delete("status");
      const nextQuery = params.toString();
      if (nextQuery === queryString) return;
      const newUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [pathname, router, queryString],
  );

  // 关键词变化时更新 URL
  useEffect(() => {
    updateUrlParams(deferredKeyword, status);
  }, [deferredKeyword, status, updateUrlParams]);

  const [declarations, setDeclarations] = useState<CustomsDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingDrafts, setGeneratingDrafts] = useState(false);

  const loadDeclarations = useCallback(async () => {
    setLoading(true);
    try {
      const cacheKey = `customs-declarations-${deferredKeyword}-${status}-${page}-${pageSize}`;
      const response = await cachedFetch(cacheKey, () =>
        customsDeclarationService.getAll({
          page,
          pageSize,
          keyword: deferredKeyword || undefined,
          status: status === "ALL" ? undefined : status,
        }),
      );
      setDeclarations(response?.data?.items || []);
      setTotal(response?.data?.pagination?.total ?? 0);
    } catch {
      toast.error("加载报关单失败");
    } finally {
      setLoading(false);
    }
  }, [deferredKeyword, status, page, pageSize]);

  useEffect(() => {
    void loadDeclarations();
  }, [loadDeclarations]);

  const sort = useTableSort<CustomsDeclaration, string>(
    declarations,
    useCallback((item, key) => {
      switch (key) {
        case "declarationNo":
          return item.declarationNo ?? "";
        case "customsBroker":
          return item.customsBroker ?? "";
        case "currency":
          return item.currency ?? "";
        case "declaredAt":
          return item.declaredAt ?? "";
        case "totalAmount":
          return item.totalAmount;
        default:
          return null;
      }
    }, []),
  );

  const draftCount = declarations.filter(
    (item) => item.status === "DRAFT",
  ).length;
  const releasedCount = declarations.filter(
    (item) => item.status === "RELEASED",
  ).length;
  const totalAmount = declarations.reduce(
    (sum, item) => sum + item.totalAmount,
    0,
  );

  const openDetail = (id: string) => {
    startTransition(() => {
      router.push(`/dashboard/customs-declarations/${id}`);
    });
  };

  const handleGenerateDrafts = async () => {
    setGeneratingDrafts(true);
    try {
      const response = await customsDeclarationService.generateDrafts({});
      const created = response?.data?.created ?? 0;
      const skipped = response?.data?.skipped ?? 0;
      toast.success(`自动生成完成：新增 ${created} 条，跳过 ${skipped} 条`);
      await loadDeclarations();
    } catch {
      toast.error("自动生成报关单草稿失败");
    } finally {
      setGeneratingDrafts(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {!embedded && <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />}
      <PageHeader
        title="报关单管理"
        description="跟踪出口报关草稿、申报进度、查验与放行状态。"
        actions={
          <>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value);
                  setPage(1);
                }}
                placeholder="搜索报关单号或报关行..."
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
                {customsDeclarationStatusOptions.map((option) => (
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
                  setPage(1);
                  updateUrlParams("", "ALL");
                }}
                data-testid="reset-filters"
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
                自动生成草稿
              </Button>
            </BusinessWrite>

            <BusinessWrite>
              <Button
                className="h-11 rounded-xl"
                onClick={() =>
                  router.push("/dashboard/customs-declarations/create")
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                新建报关单
              </Button>
            </BusinessWrite>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              本页单量
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {declarations.length}
          </CardContent>
        </Card>

        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              草稿 / 待完善
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {draftCount}
          </CardContent>
        </Card>

        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              本页货值
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            USD {totalAmount.toLocaleString()}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            加载中...
          </div>
        ) : declarations.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            暂无报关单数据。
          </div>
        ) : (
          sort.sortedData.map((declaration) => (
            <MobileListCard
              key={declaration.id}
              title={declaration.declarationNo}
              subtitle={declaration.customsBroker || "未填写报关行"}
              badge={
                <CustomsDeclarationStatusBadge status={declaration.status} />
              }
              fields={[
                { label: "币种", value: declaration.currency },
                {
                  label: "申报日期",
                  value: declaration.declaredAt?.slice(0, 10) || "-",
                },
              ]}
              amount={{
                label: "货值",
                value: formatAmount(
                  declaration.totalAmount,
                  declaration.currency,
                ),
              }}
              onClick={() => openDetail(declaration.id)}
              action={
                <Button
                  variant="outline"
                  className="h-11 w-full"
                  onClick={() => openDetail(declaration.id)}
                >
                  查看详情
                </Button>
              }
            />
          ))
        )}
      </div>

      <Card className="surface-panel hidden overflow-hidden md:block">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            报关单列表
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead
                  sortKey="declarationNo"
                  currentSortKey={sort.sortKey}
                  currentSortDir={sort.sortDir}
                  onSort={sort.onSort}
                >
                  报关单号
                </SortableTableHead>
                <SortableTableHead
                  sortKey="customsBroker"
                  currentSortKey={sort.sortKey}
                  currentSortDir={sort.sortDir}
                  onSort={sort.onSort}
                >
                  报关行
                </SortableTableHead>
                <SortableTableHead
                  sortKey="currency"
                  currentSortKey={sort.sortKey}
                  currentSortDir={sort.sortDir}
                  onSort={sort.onSort}
                >
                  币种
                </SortableTableHead>
                <TableHead>状态</TableHead>
                <SortableTableHead
                  sortKey="declaredAt"
                  currentSortKey={sort.sortKey}
                  currentSortDir={sort.sortDir}
                  onSort={sort.onSort}
                >
                  申报日期
                </SortableTableHead>
                <SortableTableHead
                  sortKey="totalAmount"
                  currentSortKey={sort.sortKey}
                  currentSortDir={sort.sortDir}
                  onSort={sort.onSort}
                  className="text-right"
                >
                  货值
                </SortableTableHead>
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
              ) : declarations.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="py-14 text-center text-muted-foreground"
                  >
                    暂无报关单数据。
                  </TableCell>
                </TableRow>
              ) : (
                sort.sortedData.map((declaration) => (
                  <TableRow
                    key={declaration.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => openDetail(declaration.id)}
                    data-testid={`declaration-row-${declaration.declarationNo}`}
                  >
                    <TableCell className="font-medium">
                      {declaration.declarationNo}
                    </TableCell>
                    <TableCell>{declaration.customsBroker || "-"}</TableCell>
                    <TableCell>{declaration.currency}</TableCell>
                    <TableCell>
                      <CustomsDeclarationStatusBadge
                        status={declaration.status}
                      />
                    </TableCell>
                    <TableCell>
                      {declaration.declaredAt?.slice(0, 10) || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatAmount(
                        declaration.totalAmount,
                        declaration.currency,
                      )}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="default"
                        size="sm"
                        className="rounded-xl"
                        aria-label={`查看详情 ${declaration.declarationNo}`}
                        data-testid={`declaration-detail-${declaration.declarationNo}`}
                        onClick={() => openDetail(declaration.id)}
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

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          共 {total} 条，第 {page} 页；本页已放行 {releasedCount} 条
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || page <= 1}
          onClick={() => setPage(page - 1)}
        >
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || page * pageSize >= total}
          onClick={() => setPage(page + 1)}
        >
          下一页
        </Button>
        <PageSizeSelect
          value={pageSize}
          onChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>
    </div>
  );
}
