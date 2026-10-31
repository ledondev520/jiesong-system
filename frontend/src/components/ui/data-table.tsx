/**
 * Input: 列定义、当前页数据、加载/错误状态、可选搜索/筛选/选择/分页/行操作
 * Output: 统一数据表格（排序、列显隐、加载/空/错误状态、粘性表头与操作列、分页）
 * Pos: 通用 UI 组件（UX 规范 §8.5），由 ui/table、useTableSort、page-size-select、data-state、empty-state 组成，不引入依赖
 *
 * 边界：排序只作用于传入的这一页数据（服务端分页时不是全量排序）；搜索/筛选由页面持有并请求数据，
 * 本组件只渲染搜索框、重置按钮和筛选 chip。移动端卡片由页面自己渲染（md:hidden），本表格放在 hidden md:block 中。
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Columns3, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableStateRow } from "@/components/ui/data-state";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTableSort } from "@/lib/hooks/useTableSort";
import { cn } from "@/lib/utils";

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  /** 列显隐菜单里的名称；header 不是纯文本时必填 */
  label?: string;
  cell: (row: T) => ReactNode;
  /** 提供后该列可点击排序 */
  sortValue?: (row: T) => string | number | null | undefined;
  className?: string;
  /** false 表示该列不可隐藏（如名称列） */
  hideable?: boolean;
  defaultHidden?: boolean;
}

export interface DataTableFilterChip {
  key: string;
  label: string;
  active: boolean;
  onToggle: () => void;
}

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  /** 任何 truthy 值都视为加载失败：显示错误态（服务端原因 + 重试），不显示数据或分页总数 */
  error?: unknown;
  /** 错误态标题下的「失败的事」，如「加载港口失败」 */
  errorWhat?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  /** 粘性右侧操作列内容，通常是 <RowActionsMenu /> */
  renderActions?: (row: T) => ReactNode;
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  filters?: DataTableFilterChip[];
  /** 工具栏右侧的额外控件（导入导出、新增按钮等） */
  toolbar?: ReactNode;
  selection?: {
    selectedIds: Set<string>;
    onChange: (next: Set<string>) => void;
  };
  pagination?: DataTablePagination;
  /** 表格区最大高度，粘性表头在此范围内滚动生效 */
  maxHeightClassName?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  error,
  errorWhat = "数据加载失败",
  onRetry,
  emptyTitle = "暂无数据",
  emptyDescription,
  emptyAction,
  onRowClick,
  renderActions,
  search,
  filters,
  toolbar,
  selection,
  pagination,
  maxHeightClassName = "max-h-[70vh]",
  className,
}: DataTableProps<T>) {
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key)),
  );
  const visibleColumns = useMemo(
    () => columns.filter((c) => !hidden.has(c.key)),
    [columns, hidden],
  );
  const hideableColumns = columns.filter((c) => c.hideable !== false);

  const sortAccessor = useCallback(
    (row: T, key: string) =>
      columns.find((c) => c.key === key)?.sortValue?.(row),
    [columns],
  );
  const { sortedData, sortKey, sortDir, onSort } = useTableSort(
    data,
    sortAccessor,
  );

  const hasError = Boolean(error);
  const colSpan =
    visibleColumns.length + (selection ? 1 : 0) + (renderActions ? 1 : 0);
  const allSelected =
    !!selection &&
    data.length > 0 &&
    data.every((row) => selection.selectedIds.has(rowKey(row)));

  const toggleAll = () => {
    if (!selection) return;
    selection.onChange(allSelected ? new Set() : new Set(data.map(rowKey)));
  };
  const toggleOne = (id: string) => {
    if (!selection) return;
    const next = new Set(selection.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  };

  const totalPages = pagination
    ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
    : 1;
  const headClass = "sticky top-0 z-10 bg-card";

  return (
    <div className={cn("space-y-3", className)}>
      {search || filters?.length || toolbar || hideableColumns.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {search ? (
            <>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="搜索"
                  placeholder={search.placeholder ?? "搜索..."}
                  value={search.value}
                  onChange={(event) => search.onChange(event.target.value)}
                  className="h-9 pl-9"
                />
              </div>
              {search.value ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9"
                  onClick={() => search.onChange("")}
                >
                  <X className="mr-1 h-4 w-4" />
                  重置
                </Button>
              ) : null}
            </>
          ) : null}
          {filters?.map((chip) => (
            <Button
              key={chip.key}
              type="button"
              size="sm"
              variant={chip.active ? "secondary" : "outline"}
              aria-pressed={chip.active}
              className="h-8"
              onClick={chip.onToggle}
            >
              {chip.label}
            </Button>
          ))}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {toolbar}
            {hideableColumns.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                  >
                    <Columns3 className="mr-1.5 h-4 w-4" />列
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>显示的列</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {hideableColumns.map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.key}
                      checked={!hidden.has(column.key)}
                      // 保持菜单打开，方便一次调整多列
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={(checked) =>
                        setHidden((prev) => {
                          const next = new Set(prev);
                          if (checked) next.delete(column.key);
                          else next.add(column.key);
                          return next;
                        })
                      }
                    >
                      {column.label ??
                        (typeof column.header === "string"
                          ? column.header
                          : column.key)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "overflow-auto rounded-xl border bg-card",
          maxHeightClassName,
        )}
      >
        <table data-slot="table" className="w-full caption-bottom text-sm">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {selection ? (
                <TableHead className={cn(headClass, "w-10")}>
                  <Checkbox
                    aria-label="全选"
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
              ) : null}
              {visibleColumns.map((column) =>
                column.sortValue ? (
                  <SortableTableHead
                    key={column.key}
                    sortKey={column.key}
                    currentSortKey={sortKey}
                    currentSortDir={sortDir}
                    onSort={onSort}
                    className={cn(headClass, column.className)}
                  >
                    {column.header}
                  </SortableTableHead>
                ) : (
                  <TableHead
                    key={column.key}
                    className={cn(
                      headClass,
                      "text-muted-foreground",
                      column.className,
                    )}
                  >
                    {column.header}
                  </TableHead>
                ),
              )}
              {renderActions ? (
                <TableHead
                  className={cn(
                    headClass,
                    "right-0 w-24 text-muted-foreground",
                  )}
                >
                  操作
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableStateRow colSpan={colSpan} variant="loading" />
            ) : hasError ? (
              <TableStateRow
                colSpan={colSpan}
                variant="error"
                what={errorWhat}
                error={error}
                onRetry={onRetry}
              />
            ) : sortedData.length === 0 ? (
              <TableStateRow
                colSpan={colSpan}
                variant="empty"
                title={emptyTitle}
                description={emptyDescription}
                action={emptyAction}
              />
            ) : (
              sortedData.map((row) => {
                const id = rowKey(row);
                return (
                  <TableRow
                    key={id}
                    className={cn("h-9", onRowClick && "cursor-pointer")}
                    data-state={
                      selection?.selectedIds.has(id) ? "selected" : undefined
                    }
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {selection ? (
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          aria-label="选择此行"
                          checked={selection.selectedIds.has(id)}
                          onCheckedChange={() => toggleOne(id)}
                        />
                      </TableCell>
                    ) : null}
                    {visibleColumns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn("py-1.5", column.className)}
                      >
                        {column.cell(row)}
                      </TableCell>
                    ))}
                    {renderActions ? (
                      <TableCell
                        className="sticky right-0 bg-card py-1.5"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {renderActions(row)}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </table>
      </div>

      {pagination && !loading && !hasError ? (
        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            共 {pagination.total} 条
            {totalPages > 1 ? `，第 ${pagination.page}/${totalPages} 页` : ""}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <PageSizeSelect
              value={pagination.pageSize}
              onChange={pagination.onPageSizeChange}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              上一页
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              下一页
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
