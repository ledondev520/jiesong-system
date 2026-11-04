/**
 * Input: 报关单服务、共享列表URL状态、router
 * Output: 报关单列表页（嵌入时只渲染工具栏；状态 chips、KpiStat、草稿单标注；筛选与历史同步，详情携带安全的当前列表返回上下文）
 * Pos: 报关单管理主列表页
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { LoadingValue } from "@/components/ui/loading-value";
import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { listUrlFields, useListUrlState } from "@/lib/hooks/useListUrlState";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/lib/hooks/useTableSort";
import { useRouter } from "next/navigation";
import type { CustomsDeclaration } from "@/types";
import { customsDeclarationService } from "@/services/customsDeclaration.service";
import { cachedFetch } from "@/lib/api-cache";
import { runAwait } from "@/lib/run-await";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStat } from "@/components/ui/kpi-stat";
import { StageChips } from "@/components/ui/stage-chips";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileListCard } from "@/components/mobile";
import { PageHeader } from "@/components/layout/PageHeader";
import { Search, Plus, FileText } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CustomsDeclarationStatusBadge } from "./CustomsDeclarationStatusBadge";

import { resolveCustomsReturnTo } from "./customs-return-context";
import { splitDraftSuffix } from "./declarationNo";

// 报关单只会写入这四个状态（CustomsDeclarationForm），后端按精确值过滤；其余枚举值没有写入路径，不单列 chip。
const statusChips = [
  { key: "ALL", label: "全部" },
  { key: "DRAFT", label: "草稿" },
  { key: "DECLARED", label: "已申报" },
  { key: "RELEASED", label: "已放行" },
  { key: "VOID", label: "已作废" },
];

const isDraftDeclaration = (declaration: CustomsDeclaration) =>
  declaration.status === "DRAFT" ||
  splitDraftSuffix(declaration.declarationNo).isDraft;

const formatAmount = (amount: number, currency: string) =>
  `${currency} ${amount.toLocaleString()}`;

export function CustomsDeclarationListPageContent({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const router = useRouter();
  const [{ keyword, status, page, pageSize }, setListState] = useListUrlState(
    listUrlFields.customs,
    embedded ? ["view", "customs"] : undefined,
  );
  const [total, setTotal] = useState(0);
  const deferredKeyword = useDeferredValue(keyword);

  const [declarations, setDeclarations] = useState<CustomsDeclaration[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingDrafts, setGeneratingDrafts] = useState(false);
  const activeQueryRef = useRef<string | null>(null);
  const requestGenerationRef = useRef(0);
  const queryKey = `customs-declarations-${deferredKeyword}-${status}-${page}-${pageSize}`;

  // 筛选/分页变化时的 loading 置位：原先在 effect 内（loadDeclarations 开头）同步写入，改为渲染期执行；
  // 挂载时 loading 初值即为 true，无需写入。
  const [loadFilters, setLoadFilters] = useState({
    deferredKeyword,
    status,
    page,
    pageSize,
  });
  if (
    loadFilters.deferredKeyword !== deferredKeyword ||
    loadFilters.status !== status ||
    loadFilters.page !== page ||
    loadFilters.pageSize !== pageSize
  ) {
    setLoadFilters({ deferredKeyword, status, page, pageSize });
    setLoading(true);
  }
  // 渲染期已置位、对应被动 effect 尚未执行的窗口内，旧请求仍视为当前请求；原 effect 会随后把 loading 覆盖为 true，
  // 因此窗口内旧请求跳过 setLoading(false)（列表与总数写入不受影响，与原先一致）。
  const loadingResetPendingRef = useRef(false);

  const requestDeclarations = useCallback(() => {
    // 旧筛选回调或卸载后的刷新不能启动/提交列表请求。
    if (activeQueryRef.current !== queryKey) return Promise.resolve();
    const requestGeneration = ++requestGenerationRef.current;
    const isCurrent = () =>
      activeQueryRef.current === queryKey &&
      requestGenerationRef.current === requestGeneration;
    return runAwait(
      () =>
        cachedFetch(queryKey, () =>
          customsDeclarationService.getAll({
            page,
            pageSize,
            keyword: deferredKeyword || undefined,
            status: status === "ALL" ? undefined : status,
          }),
        ),
      (response) => {
        if (!isCurrent()) return;
        setDeclarations(response?.data?.items || []);
        setTotal(response?.data?.pagination?.total ?? 0);
      },
      () => {
        if (isCurrent()) toast.error("加载报关单失败");
      },
      () => {
        if (isCurrent() && !loadingResetPendingRef.current) setLoading(false);
      },
    );
  }, [deferredKeyword, status, page, pageSize, queryKey]);

  const loadDeclarations = useCallback(() => {
    if (activeQueryRef.current !== queryKey) return Promise.resolve();
    setLoading(true);
    return requestDeclarations();
  }, [requestDeclarations, queryKey]);

  useLayoutEffect(() => {
    loadingResetPendingRef.current = true;
  }, [requestDeclarations, queryKey]);

  useEffect(() => {
    activeQueryRef.current = queryKey;
    loadingResetPendingRef.current = false;
    void requestDeclarations();
    return () => {
      activeQueryRef.current = null;
      requestGenerationRef.current += 1;
    };
  }, [requestDeclarations, queryKey]);

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
    const returnTo = resolveCustomsReturnTo(
      window.location.pathname + window.location.search + window.location.hash,
    );
    const detailQuery = new URLSearchParams({ returnTo });
    startTransition(() => {
      router.push(`/dashboard/customs/${id}?${detailQuery}`);
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

  const actions = (
    <>
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={keyword}
          onChange={(event) => {
            const nextKeyword = event.target.value;
            setListState({ keyword: nextKeyword });
          }}
          placeholder="搜索报关单号或报关行..."
          className="h-11 rounded-xl border-border/70 bg-background/70 pl-10"
        />
      </div>

      {(keyword || status !== "ALL") && (
        <Button
          variant="ghost"
          className="h-11 rounded-xl"
          onClick={() => {
            setListState({ keyword: "", status: "ALL" });
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
          onClick={() => router.push("/dashboard/customs/new")}
        >
          <Plus className="mr-2 h-4 w-4" />
          新建报关单
        </Button>
      </BusinessWrite>
    </>
  );

  return (
    <div className="space-y-6 pb-10">
      {embedded ? (
        // 嵌在「单证与退税」页签里：页面标题由外层承担，这里只渲染工具栏。
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : (
        <PageHeader
          title="报关单管理"
          description="跟踪出口报关草稿、申报进度、查验与放行状态。"
          actions={actions}
        />
      )}

      <StageChips
        ariaLabel="报关单状态"
        stages={statusChips}
        value={status}
        showCount={false}
        onChange={(key) => setListState({ status: key })}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <KpiStat
          label="本页单量"
          loading={loading}
          value={String(declarations.length)}
        />
        <KpiStat
          label="本页草稿 / 待完善"
          loading={loading}
          value={String(draftCount)}
        />
        <KpiStat
          label="本页货值"
          loading={loading}
          value={`USD ${totalAmount.toLocaleString()}`}
        />
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
              title={splitDraftSuffix(declaration.declarationNo).displayNo}
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
                    colSpan={7}
                    className="py-14 text-center text-muted-foreground"
                  >
                    加载中...
                  </TableCell>
                </TableRow>
              ) : declarations.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-14 text-center text-muted-foreground"
                  >
                    暂无报关单数据。
                  </TableCell>
                </TableRow>
              ) : (
                sort.sortedData.map((declaration) => (
                  <TableRow
                    key={declaration.id}
                    className={cn(
                      "cursor-pointer hover:bg-muted/50",
                      isDraftDeclaration(declaration) && "bg-muted/30",
                    )}
                    onClick={() => openDetail(declaration.id)}
                    data-testid={`declaration-row-${declaration.declarationNo}`}
                  >
                    <TableCell
                      className="font-medium"
                      title={declaration.declarationNo}
                    >
                      {splitDraftSuffix(declaration.declarationNo).displayNo}
                      {isDraftDeclaration(declaration) && (
                        <Badge
                          variant="outline"
                          className="ml-2 border-dashed font-normal text-muted-foreground"
                        >
                          草稿 · 非正式单
                        </Badge>
                      )}
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
          共 <LoadingValue loading={loading}>{total}</LoadingValue> 条，第{" "}
          {page} 页；本页已放行{" "}
          <LoadingValue loading={loading}>{releasedCount}</LoadingValue> 条
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || page <= 1}
          onClick={() => setListState({ page: page - 1 })}
        >
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || page * pageSize >= total}
          onClick={() => setListState({ page: page + 1 })}
        >
          下一页
        </Button>
        <PageSizeSelect
          value={pageSize}
          onChange={(size) => {
            setListState({ pageSize: size });
          }}
        />
      </div>
    </div>
  );
}
