/**
 * Input: 供应商服务API、SortableTableHead、useTableSort
 * Output: 供应商管理页面（搜索、分页、桌面表列排序）
 * Pos: 基础档案子页面
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Supplier } from '@/types';
import { supplierService } from '@/services/supplier.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Pencil,
  Trash2,
  Factory,
  AlertTriangle,
  Search,
  X,
  LayoutGrid,
  List,
  Star,
  Phone,
  User,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { SupplierDialog } from './components/SupplierDialog';
import type { SupplierFormValues } from './components/SupplierDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, PROCUREMENT_TABS } from '@/components/layout/ModuleTabHeader';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useTableSort } from '@/lib/hooks/useTableSort';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// 扩展供应商类型用于展示（后端返回的可选统计字段）
interface SupplierDisplay extends Supplier {
  rating?: number;
  purchaseCount?: number;
  recentTransactionAmount?: number;
}

/**
 * 职责：生成分页页码数组（显示当前页前后各2页 + 首尾页）
 */
function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | 'ellipsis')[] = [1];
  if (current > 4) pages.push('ellipsis');
  const start = Math.max(2, current - 2);
  const end = Math.min(total - 1, current + 2);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 3) pages.push('ellipsis');
  if (total > 1) pages.push(total);
  return pages;
}

/**
 * 职责：渲染星级评分
 */
function RatingStars({ rating }: { rating?: number }) {
  if (rating == null) return null;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3 w-3',
            i < Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'
          )}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">{rating.toFixed(1)}</span>
    </div>
  );
}

/**
 * 职责：渲染供应商头像（首字母）
 */
function SupplierAvatar({ name, hasQualityIssue }: { name: string; hasQualityIssue: boolean }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
        hasQualityIssue
          ? 'bg-destructive/10 text-destructive'
          : 'bg-primary/10 text-primary'
      )}
    >
      {initial}
    </div>
  );
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<SupplierDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierDisplay | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // 搜索与分页状态
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'normal' | 'issue'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const response = await cachedFetch('suppliers-list', () => supplierService.getAll({ page: 1, pageSize: 100 }));
      setSuppliers((response.data?.items || []) as SupplierDisplay[]);
    } catch {
      toast.error('加载供应商失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingSupplier(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (supplier: SupplierDisplay) => {
    setEditingSupplier(supplier);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除此供应商吗？')) {
      try {
        await supplierService.delete(id);
        setSuppliers(suppliers.filter((s) => s.id !== id));
        toast.success('供应商已删除');
      } catch {
        toast.error('删除失败');
      }
    }
  };

  const handleSubmit = async (data: SupplierFormValues) => {
    const payload = {
      ...data,
      aliases: data.aliases?.map((alias) => ({ alias: alias.alias })),
    };

    try {
      if (editingSupplier) {
        await supplierService.update(editingSupplier.id, payload);
        toast.success('供应商更新成功');
      } else {
        await supplierService.create(payload);
        toast.success('供应商创建成功');
      }
      setIsDialogOpen(false);
      invalidateCache('suppliers-list');
      loadSuppliers();
    } catch {
      toast.error(editingSupplier ? '更新失败' : '创建失败');
    }
  };

  // 根据关键词与状态过滤
  const filteredSuppliers = useMemo(() => {
    let list = suppliers;
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(kw) ||
          (s.shortName || '').toLowerCase().includes(kw) ||
          (s.contactName || '').toLowerCase().includes(kw) ||
          (s.aliases || []).some((a) => a.alias.toLowerCase().includes(kw))
      );
    }
    if (statusFilter === 'normal') {
      list = list.filter((s) => !s.hasQualityIssue);
    } else if (statusFilter === 'issue') {
      list = list.filter((s) => s.hasQualityIssue);
    }
    return list;
  }, [suppliers, keyword, statusFilter]);

  /**
   * 职责：从供应商行取出排序用字段
   */
  const supplierAccessor = useCallback((item: SupplierDisplay, key: string) => {
    switch (key) {
      case 'name':
        return item.name;
      case 'aliases':
        return item.aliases?.map((a) => a.alias).join(' ') ?? '';
      case 'contactName':
        return item.contactName ?? '';
      default:
        return null;
    }
  }, []);

  const supplierSort = useTableSort(filteredSuppliers, supplierAccessor);

  const totalPages = Math.ceil(supplierSort.sortedData.length / pageSize);
  const pagedSuppliers = supplierSort.sortedData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleReset = () => {
    setKeyword('');
    setStatusFilter('all');
    setCurrentPage(1);
  };

  const pageNumbers = useMemo(() => getPageNumbers(currentPage, totalPages), [currentPage, totalPages]);

  const hasActiveFilters = keyword.trim() || statusFilter !== 'all';

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={PROCUREMENT_TABS} moduleName="采购" />
      <PageHeader
        title="供应商管理"
        actions={
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <Button onClick={handleCreate} className="h-9 rounded-lg text-sm">
              <Plus className="mr-1.5 h-4 w-4" /> 新增供应商
            </Button>
          </div>
        }
      />

      {/* 一体化筛选栏 */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索供应商名称..."
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setCurrentPage(1);
              }}
              className="h-9 rounded-md border-border/60 bg-background pl-9 text-sm shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
            />
          </div>

          <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-background p-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <button
              onClick={() => setStatusFilter('all')}
              className={cn(
                'h-7 rounded px-2.5 text-xs font-medium transition-colors',
                statusFilter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              全部
            </button>
            <button
              onClick={() => setStatusFilter('normal')}
              className={cn(
                'h-7 rounded px-2.5 text-xs font-medium transition-colors',
                statusFilter === 'normal' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              正常
            </button>
            <button
              onClick={() => setStatusFilter('issue')}
              className={cn(
                'h-7 rounded px-2.5 text-xs font-medium transition-colors',
                statusFilter === 'issue' ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              质量问题
            </button>
          </div>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-9 rounded-md text-xs" onClick={handleReset}>
              <X className="mr-1 h-3.5 w-3.5" />
              重置
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border/60 bg-background p-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded transition-colors',
                viewMode === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="网格视图"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded transition-colors',
                viewMode === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
              aria-label="列表视图"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 移动端操作栏 */}
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <Sheet open={mobileSearchOpen} onOpenChange={setMobileSearchOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-11 rounded-xl">
              <Search className="mr-2 h-4 w-4" />
              搜索与操作
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl px-0 pb-0">
            <SheetHeader className="border-b px-5 pb-4">
              <SheetTitle>搜索与操作</SheetTitle>
              <SheetDescription>先缩小结果范围，再进入供应商档案操作。</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-5 py-5">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索供应商名称..."
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="h-11 rounded-xl border-border/70 bg-background/80 pl-9"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  className="h-10 flex-1 rounded-xl text-xs"
                  onClick={() => setStatusFilter('all')}
                >
                  全部
                </Button>
                <Button
                  variant={statusFilter === 'normal' ? 'default' : 'outline'}
                  className="h-10 flex-1 rounded-xl text-xs"
                  onClick={() => setStatusFilter('normal')}
                >
                  正常
                </Button>
                <Button
                  variant={statusFilter === 'issue' ? 'destructive' : 'outline'}
                  className="h-10 flex-1 rounded-xl text-xs"
                  onClick={() => setStatusFilter('issue')}
                >
                  质量问题
                </Button>
              </div>
              {hasActiveFilters && (
                <Button variant="outline" className="h-11 w-full rounded-xl" onClick={handleReset}>
                  <X className="mr-2 h-4 w-4" />
                  清空搜索
                </Button>
              )}
            </div>
            <div className="flex gap-3 border-t px-5 py-4">
              <Button variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => setMobileSearchOpen(false)}>
                查看结果
              </Button>
              <Button className="h-11 flex-1 rounded-xl" onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                新增供应商
              </Button>
            </div>
          </SheetContent>
        </Sheet>
        <Button onClick={handleCreate} className="h-11 rounded-xl">
          <Plus className="mr-2 h-4 w-4" /> 新增供应商
        </Button>
      </div>

      {/* 移动端卡片 */}
      <div className="grid gap-3 md:hidden">
        {loading ? (
          <Card className="border-dashed border-border/70">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">加载中...</CardContent>
          </Card>
        ) : pagedSuppliers.length === 0 ? (
          <Card className="border-dashed border-border/70">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {keyword || statusFilter !== 'all' ? '没有符合条件的供应商' : '暂无供应商数据。'}
            </CardContent>
          </Card>
        ) : (
          pagedSuppliers.map((supplier) => (
            <Card
              key={supplier.id}
              className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
            >
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <SupplierAvatar name={supplier.name} hasQualityIssue={supplier.hasQualityIssue} />
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-semibold tracking-tight">{supplier.name}</p>
                      {supplier.shortName && <p className="truncate text-xs text-muted-foreground">{supplier.shortName}</p>}
                      <RatingStars rating={supplier.rating} />
                    </div>
                  </div>
                  {supplier.hasQualityIssue ? (
                    <div className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      质量问题
                    </div>
                  ) : (
                    <Badge
                      variant="outline"
                      className="shrink-0 rounded-full border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] text-primary"
                    >
                      正常
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3">
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">联系人</p>
                    <p className="flex items-center gap-1 text-xs font-medium">
                      <User className="h-3 w-3 text-muted-foreground" />
                      {supplier.contactName || '—'}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">联系电话</p>
                    <p className="flex items-center gap-1 text-xs font-medium">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      {supplier.contactPhone || '—'}
                    </p>
                  </div>
                  {supplier.purchaseCount != null && (
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">合作次数</p>
                      <p className="text-xs font-medium">{supplier.purchaseCount} 次</p>
                    </div>
                  )}
                  {supplier.recentTransactionAmount != null && (
                    <div className="space-y-1">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">最近交易</p>
                      <p className="text-xs font-medium tabular-nums text-emerald-600">
                        ¥{supplier.recentTransactionAmount.toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>

                {supplier.aliases && supplier.aliases.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {supplier.aliases.map((a) => (
                      <Badge key={a.id} variant="secondary" className="rounded-md text-[10px]">
                        {a.alias}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-9 rounded-lg text-xs"
                    onClick={() => handleEdit(supplier)}
                    aria-label={`编辑 ${supplier.name}`}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    编辑
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 rounded-lg border-destructive/30 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
                    onClick={() => handleDelete(supplier.id)}
                    aria-label={`删除 ${supplier.name}`}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 桌面端视图 */}
      <div className="hidden md:block">
        {loading ? (
          <div className="rounded-xl border border-border/40 bg-card py-12 text-center text-sm text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            加载中...
          </div>
        ) : pagedSuppliers.length === 0 ? (
          <div className="rounded-xl border border-border/40 bg-card py-12 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <EmptyState
              icon={<Factory className="h-8 w-8" />}
              title={keyword || statusFilter !== 'all' ? '没有符合条件的供应商' : '暂无供应商数据'}
              description="还没有添加任何供应商，点击下方的按钮开始创建"
              action={{ label: '新增供应商', onClick: () => setIsDialogOpen(true) }}
            />
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {pagedSuppliers.map((supplier) => (
              <Card
                key={supplier.id}
                className="group cursor-pointer overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.06)]"
                onClick={() => handleEdit(supplier)}
              >
                <div className="flex">
                  {/* 左侧状态色条 */}
                  <div
                    className="w-[3px] shrink-0 transition-opacity group-hover:opacity-100 opacity-60"
                    style={{
                      backgroundColor: supplier.hasQualityIssue ? '#ef4444' : '#10b981',
                    }}
                  />
                  <CardContent className="flex-1 space-y-3 p-4">
                    {/* 头部：头像 + 名称 + 状态 */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <SupplierAvatar name={supplier.name} hasQualityIssue={supplier.hasQualityIssue} />
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-sm font-semibold text-foreground truncate">{supplier.name}</p>
                          {supplier.shortName && <p className="text-xs text-muted-foreground">{supplier.shortName}</p>}
                          <RatingStars rating={supplier.rating} />
                        </div>
                      </div>
                      {supplier.hasQualityIssue ? (
                        <Badge
                          variant="destructive"
                          className="shrink-0 rounded-full px-2 py-0.5 text-[11px]"
                        >
                          <AlertTriangle className="mr-1 h-3 w-3" /> 质量问题
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="shrink-0 rounded-full border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] text-primary"
                        >
                          正常
                        </Badge>
                      )}
                    </div>

                    {/* 别名 */}
                    {supplier.aliases && supplier.aliases.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {supplier.aliases.map((a) => (
                          <Badge key={a.id} variant="secondary" className="rounded-md text-[10px]">
                            {a.alias}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* 联系人与统计 */}
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 shrink-0" />
                        <span className="shrink-0">联系人:</span>
                        <span className="truncate font-medium text-foreground">{supplier.contactName || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span className="shrink-0">电话:</span>
                        <span className="truncate text-foreground">{supplier.contactPhone || '—'}</span>
                      </div>
                      {supplier.purchaseCount != null && (
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0">合作次数:</span>
                          <span className="font-medium text-foreground">{supplier.purchaseCount} 次</span>
                        </div>
                      )}
                      {supplier.recentTransactionAmount != null && (
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0">最近交易:</span>
                          <span className="font-medium tabular-nums text-emerald-600">
                            ¥{supplier.recentTransactionAmount.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 操作 */}
                    <div className="flex gap-2 border-t border-border/30 pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 flex-1 rounded-md text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(supplier);
                        }}
                        aria-label={`编辑 ${supplier.name}`}
                      >
                        <Pencil className="mr-1 h-3 w-3" /> 编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 flex-1 rounded-md text-xs text-destructive hover:bg-destructive/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(supplier.id);
                        }}
                        aria-label={`删除 ${supplier.name}`}
                      >
                        <Trash2 className="mr-1 h-3 w-3" /> 删除
                      </Button>
                    </div>
                  </CardContent>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border/40 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="w-10 text-center">#</TableHead>
                  <TableHead>供应商名称</TableHead>
                  <TableHead>联系人</TableHead>
                  <TableHead>电话</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedSuppliers.map((supplier, idx) => (
                  <TableRow
                    key={supplier.id}
                    className="group cursor-pointer transition-colors"
                    onClick={() => handleEdit(supplier)}
                  >
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {(currentPage - 1) * pageSize + idx + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <SupplierAvatar name={supplier.name} hasQualityIssue={supplier.hasQualityIssue} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{supplier.name}</p>
                          {supplier.shortName && <p className="text-xs text-muted-foreground">{supplier.shortName}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{supplier.contactName || '—'}</TableCell>
                    <TableCell className="text-sm">{supplier.contactPhone || '—'}</TableCell>
                    <TableCell>
                      {supplier.hasQualityIssue ? (
                        <Badge variant="destructive" className="rounded-full px-2 py-0.5 text-[11px]">
                          <AlertTriangle className="mr-1 h-3 w-3" /> 质量问题
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="rounded-full border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] text-primary"
                        >
                          正常
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-md"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(supplier);
                          }}
                          aria-label={`编辑 ${supplier.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-md text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(supplier.id);
                          }}
                          aria-label={`删除 ${supplier.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* 分页控制 */}
      {totalPages > 0 && (
        <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            共 {filteredSuppliers.length} 条{totalPages > 1 ? `，第 ${currentPage}/${totalPages} 页` : ''}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <PageSizeSelect
              value={pageSize}
              onChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
            />
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-md"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {pageNumbers.map((page, idx) =>
                page === 'ellipsis' ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <Button
                    key={page}
                    variant={currentPage === page ? 'default' : 'outline'}
                    size="sm"
                    className="h-8 min-w-[2rem] rounded-md px-2 text-xs"
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </Button>
                )
              )}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-md"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages <= 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <SupplierDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        supplier={editingSupplier}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
