/**
 * Input: quote service, shared list URL state (keyword/status/page/pageSize)
 * Output: quote list — table on md+, cards below md — with search/reset, status filter, paging and 新建报价
 * Pos: /dashboard/quotes (出口 module). Columns per spec §6.3: 编号, 客户, 门店数, 金额, 状态, 有效期, 创建时间.
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import { listUrlFields, useListUrlState } from "@/lib/hooks/useListUrlState";
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, formatUsd } from "@/lib/quote";
import { quoteService, type Quote } from "@/services/quote.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MobileListCard } from "@/components/mobile";
import { PageHeader } from "@/components/layout/PageHeader";
import { QuoteStatusBadge } from "./QuoteStatusBadge";

const dateOnly = (value: string | null | undefined) => value?.slice(0, 10) || "-";

export function QuoteListPageContent() {
  const router = useRouter();
  const [{ keyword, status, page, pageSize }, setListState] = useListUrlState(listUrlFields.quotes);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 过期响应（筛选已变）不得覆盖当前结果。
    let current = true;
    setLoading(true);
    quoteService
      .getAll({ page, pageSize, keyword: keyword || undefined, status: status === "ALL" ? undefined : status })
      .then((response) => {
        if (!current) return;
        setQuotes(response.data?.items ?? []);
        setTotal(response.data?.pagination?.total ?? 0);
      })
      .catch(() => current && toast.error("加载报价失败"))
      .finally(() => current && setLoading(false));
    return () => { current = false; };
  }, [keyword, status, page, pageSize]);

  const open = (id: string) => router.push(`/dashboard/quotes/${id}`);
  const filtered = Boolean(keyword) || status !== "ALL";

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="报价"
        description="给客户的报价与形式发票（PI）；客户接受后一键转为出口订单。"
        actions={
          <>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setListState({ keyword: event.target.value })}
                placeholder="搜索编号、客户或备注..."
                className="h-11 rounded-xl pl-10"
                aria-label="搜索报价"
              />
            </div>
            <Select value={status} onValueChange={(value) => setListState({ status: value })}>
              <SelectTrigger className="h-11 w-40 rounded-xl" aria-label="状态筛选">
                <SelectValue placeholder="全部状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">全部状态</SelectItem>
                {QUOTE_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>{QUOTE_STATUS_LABEL[value]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtered && (
              <Button variant="ghost" className="h-11 rounded-xl" onClick={() => setListState({ keyword: "", status: "ALL" })}>
                重置
              </Button>
            )}
            <BusinessWrite>
              <Button className="h-11 rounded-xl" onClick={() => router.push("/dashboard/quotes/create")}>
                <Plus className="mr-2 h-4 w-4" />
                新建报价
              </Button>
            </BusinessWrite>
          </>
        }
      />

      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>
        ) : quotes.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">暂无报价。</div>
        ) : (
          quotes.map((quote) => (
            <MobileListCard
              key={quote.id}
              title={quote.quoteNo}
              subtitle={quote.customer?.name ?? "未选择客户"}
              badge={<QuoteStatusBadge status={quote.status} expired={quote.isExpired} />}
              fields={[
                { label: "门店数", value: String(quote._count?.items ?? 0) },
                { label: "有效期", value: dateOnly(quote.validUntil) },
              ]}
              amount={{ label: "金额", value: formatUsd(quote.totalAmount) }}
              onClick={() => open(quote.id)}
            />
          ))
        )}
      </div>

      <Card className="surface-panel hidden overflow-hidden md:block">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>编号</TableHead>
                <TableHead>客户</TableHead>
                <TableHead className="text-right">行数</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>有效期</TableHead>
                <TableHead>创建时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="py-14 text-center text-muted-foreground">加载中...</TableCell></TableRow>
              ) : quotes.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-14 text-center text-muted-foreground">暂无报价。</TableCell></TableRow>
              ) : (
                quotes.map((quote) => (
                  <TableRow key={quote.id} className="cursor-pointer hover:bg-muted/50" onClick={() => open(quote.id)} data-testid={`quote-row-${quote.quoteNo}`}>
                    <TableCell className="font-medium">{quote.quoteNo}</TableCell>
                    <TableCell>{quote.customer?.name ?? "-"}</TableCell>
                    <TableCell className="text-right">{quote._count?.items ?? 0}</TableCell>
                    <TableCell className="text-right">{formatUsd(quote.totalAmount)}</TableCell>
                    <TableCell><QuoteStatusBadge status={quote.status} expired={quote.isExpired} /></TableCell>
                    <TableCell>{dateOnly(quote.validUntil)}</TableCell>
                    <TableCell>{dateOnly(quote.createdAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>共 {total} 条，第 {page} 页</span>
        <Button variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => setListState({ page: page - 1 })}>上一页</Button>
        <Button variant="outline" size="sm" disabled={loading || page * pageSize >= total} onClick={() => setListState({ page: page + 1 })}>下一页</Button>
        <PageSizeSelect value={pageSize} onChange={(size) => setListState({ pageSize: size })} />
      </div>
    </div>
  );
}
