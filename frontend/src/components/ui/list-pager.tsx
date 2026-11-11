/**
 * Input: lib/hooks/usePagination 的结果（客户端内存分页）
 * Output: 「共 N 条，第 p/T 页」+ 每页条数 + 上一页/下一页；sliceByPager 取当前页数据
 * Pos: 前端已持有完整数组、没有服务端分页的长列表（如对账供应商表）
 */
"use client";

import { Button } from "@/components/ui/button";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import type { UsePaginationResult } from "@/lib/hooks/usePagination";

/** 列表筛选变少时页码可能越界，这里按有效页取数，避免显示空页。 */
export function sliceByPager<T>(items: T[], pager: UsePaginationResult): T[] {
  const totalPages = Math.max(1, Math.ceil(items.length / pager.pageSize));
  const page = Math.min(pager.page, totalPages);
  return items.slice((page - 1) * pager.pageSize, page * pager.pageSize);
}

export function ListPager({
  pager,
  total,
}: {
  pager: UsePaginationResult;
  /** 当前筛选后的总条数（usePagination 的 total 在传入后即为它） */
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pager.pageSize));
  const page = Math.min(pager.page, totalPages);
  if (total <= 20 && pager.pageSize === 20) return null; // 不足一页且为默认页大小时不占位
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
      <span>
        共 {total} 条，第 {page}/{totalPages} 页
      </span>
      <PageSizeSelect value={pager.pageSize} onChange={pager.setPageSize} />
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => pager.setPage(page - 1)}
      >
        上一页
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => pager.setPage(page + 1)}
      >
        下一页
      </Button>
    </div>
  );
}
