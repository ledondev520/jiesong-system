/**
 * Input: procurementTemplateService（门店列表、通用模板、门店历史采购）、SortableTableHead、useTableSort
 * Output: 采购建议动态清单页面（选择客户后展示推荐商品与缺购商品、桌面表列排序）
 * Pos: 采购模块子页面，帮助销售人员快速告知客户还需采购哪些商品
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/hooks/useTableSort';
import { Check, Package, Search, AlertCircle, Star, X, FileDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, PROCUREMENT_TABS } from '@/components/layout/ModuleTabHeader';
import {
  procurementTemplateService,
  type StoreTemplate,
  type TemplateItem,
  type UniversalTemplate,
} from '@/services/procurementTemplate.service';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { PriorityBadge } from './storeRecommendShared';

/** 经处理后的单条清单项 */
interface ChecklistItem {
  name: string;
  supplement: string;
  category: string;
  priority: '强烈建议' | '建议' | '可选';
  /** 占比：该商品在多少家门店出现过（0–1） */
  frequency: number;
  storeCount: number;
  unit: string;
  avgQtyPerStore: number | null;
  /** 该客户是否已采购过此商品 */
  purchased: boolean;
}

/**
 * 职责：将通用模板与指定门店历史采购合并，计算每项是否已采购
 * @param template 通用推荐模板
 * @param storeData 门店历史采购（可选）
 * @returns 带 purchased 标记的清单项数组
 */
function buildChecklist(
  template: UniversalTemplate | null,
  storeData: StoreTemplate | null,
): ChecklistItem[] {
  if (!template) return [];

  const purchasedNames = new Set(
    (storeData?.items ?? []).map((item) => item.name.trim().toLowerCase()),
  );

  return template.items.map((item: TemplateItem) => ({
    name: item.name,
    supplement: item.supplement,
    category: item.category,
    priority: item.priority,
    frequency: item.frequency,
    storeCount: item.storeCount,
    unit: item.unit,
    avgQtyPerStore: item.avgQtyPerStore,
    purchased: purchasedNames.has(item.name.trim().toLowerCase()),
  }));
}

export function StoreRecommendPageContent() {
  const [storeList, setStoreList] = useState<string[]>([]);
  const [universalTemplate, setUniversalTemplate] = useState<UniversalTemplate | null>(null);
  const [storeTemplate, setStoreTemplate] = useState<StoreTemplate | null>(null);
  const [selectedStore, setSelectedStore] = useState('');
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingStore, setLoadingStore] = useState(false);
  const [search, setSearch] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [onlyMustBuy, setOnlyMustBuy] = useState(false);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  // 0. 初始化：加载门店列表 + 通用模板
  useEffect(() => {
    const load = async () => {
      setLoadingInitial(true);
      try {
        const [storesRes, templateRes] = await Promise.all([
          procurementTemplateService.getStoreList(),
          procurementTemplateService.getUniversalTemplate(),
        ]);
        setStoreList(storesRes.data ?? []);
        setUniversalTemplate(templateRes.data ?? null);
      } catch (err) {
        console.error('[StoreRecommend] 初始化失败:', err);
      } finally {
        setLoadingInitial(false);
      }
    };
    void load();
  }, []);

  // 1. 选择门店时加载该门店历史采购
  const handleStoreChange = useCallback(async (store: string) => {
    if (store === '__clear__') {
      setSelectedStore('');
      setStoreTemplate(null);
      setOnlyMissing(false);
      return;
    }
    setSelectedStore(store);
    setStoreTemplate(null);
    if (!store) return;
    setLoadingStore(true);
    try {
      const res = await procurementTemplateService.getStoreTemplate(store);
      setStoreTemplate(res.data ?? null);
    } catch (err) {
      console.error('[StoreRecommend] 加载门店数据失败:', err);
    } finally {
      setLoadingStore(false);
    }
  }, []);

  // 2. 组合清单 + 搜索 + 过滤
  const allItems = useMemo(() => buildChecklist(universalTemplate, storeTemplate), [universalTemplate, storeTemplate]);

  // "必须采买"门槛：3 家以上门店都买过
  const majorityThreshold = 3;

  const mustBuyItems = useMemo(
    () => allItems.filter((item) => item.storeCount >= majorityThreshold),
    [allItems, majorityThreshold],
  );

  const filteredItems = useMemo(() => {
    let items = onlyMustBuy ? mustBuyItems : allItems;
    if (onlyMissing && selectedStore) {
      items = items.filter((item) => !item.purchased);
    }
    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(kw) ||
          item.category.toLowerCase().includes(kw) ||
          item.supplement.toLowerCase().includes(kw),
      );
    }
    return items;
  }, [allItems, mustBuyItems, onlyMustBuy, onlyMissing, selectedStore, search]);

  // 筛选变化时重置页码
  useEffect(() => { setPage(1); }, [onlyMustBuy, onlyMissing, search, selectedStore]);

  const checklistSort = useTableSort<ChecklistItem, string>(
    filteredItems,
    useCallback((item, key) => {
      switch (key) {
        case 'category':
          return item.category;
        case 'name':
          return item.name;
        case 'avgQty':
          return item.avgQtyPerStore ?? null;
        case 'storeCount':
          return item.storeCount;
        default:
          return null;
      }
    }, [])
  );

  const totalPages = Math.ceil(checklistSort.sortedData.length / PAGE_SIZE);
  const pagedItems = checklistSort.sortedData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 3. 统计数据
  const stats = useMemo(() => {
    const total = allItems.length;
    const purchased = allItems.filter((i) => i.purchased).length;
    const missing = total - purchased;
    return { total, purchased, missing };
  }, [allItems]);

  // 4. 导出当前列表为 CSV
  const handleExportCSV = useCallback(() => {
    const items = onlyMustBuy ? mustBuyItems : filteredItems;
    if (items.length === 0) return;

    const header = selectedStore
      ? '品类,商品名称,补充说明,优先级,参考用量,单位,覆盖门店数,是否已采购'
      : '品类,商品名称,补充说明,优先级,参考用量,单位,覆盖门店数';

    const rows = items.map((item) => {
      const base = [
        item.category,
        item.name,
        item.supplement || '',
        item.priority,
        item.avgQtyPerStore ?? '',
        item.unit,
        item.storeCount,
      ];
      if (selectedStore) base.push(item.purchased ? '是' : '否');
      return base.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const bom = '\uFEFF';
    const csv = bom + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const label = onlyMustBuy ? '必须采买' : selectedStore ? `${selectedStore}采购建议` : '采购建议';
    a.download = `${label}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredItems, mustBuyItems, onlyMustBuy, selectedStore]);

  return (
    <div className="flex flex-col h-full">
      <ModuleTabHeader tabs={PROCUREMENT_TABS} moduleName="采购" />
      <div className="flex-1 space-y-4 p-4 sm:p-6 overflow-auto">
        <PageHeader
          title="采购建议清单"
          description={
            universalTemplate
              ? `基于 ${universalTemplate.totalStores} 家客户历史采购数据，共 ${universalTemplate.totalProducts} 件推荐商品`
              : '加载中...'
          }
        />

        {/* 门店选择 + 操作栏 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={selectedStore} onValueChange={(v) => void handleStoreChange(v)}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="选择客户/门店查看缺购商品" />
              </SelectTrigger>
              <SelectContent>
                {loadingInitial ? (
                  <SelectItem value="__loading__" disabled>加载中...</SelectItem>
                ) : storeList.length === 0 ? (
                  <SelectItem value="__empty__" disabled>暂无门店数据</SelectItem>
                ) : (
                  <>
                    {selectedStore && (
                      <SelectItem value="__clear__" className="text-muted-foreground">
                        <span className="flex items-center gap-1"><X className="h-3 w-3" />清除选择</span>
                      </SelectItem>
                    )}
                    {storeList.map((store) => (
                      <SelectItem key={store} value={store}>{store}</SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>

            {selectedStore && !loadingStore && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="outline" className="gap-1 text-green-700 border-green-200 bg-green-50">
                  <Check className="h-3 w-3" />已采购 {stats.purchased}
                </Badge>
                <Badge variant="outline" className={cn('gap-1', stats.missing > 0 ? 'text-red-700 border-red-200 bg-red-50' : 'text-muted-foreground')}>
                  <AlertCircle className="h-3 w-3" />待采购 {stats.missing}
                </Badge>
              </div>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={filteredItems.length === 0}
            className="gap-1.5"
          >
            <FileDown className="h-3.5 w-3.5" />
            导出 CSV
          </Button>
        </div>

        {/* "必须采买"摘要卡片 */}
        {universalTemplate && mustBuyItems.length > 0 && onlyMustBuy && (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="flex flex-wrap items-center gap-4 px-4 py-3">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium">
                  必须采买清单：{mustBuyItems.length} 件商品
                </span>
                <span className="text-xs text-muted-foreground">
                  （3 家以上门店均购买）
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 搜索 + 过滤 */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索商品名称或品类..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={onlyMustBuy ? 'default' : 'outline'}
            size="sm"
            onClick={() => setOnlyMustBuy((v) => !v)}
            className={cn('gap-1.5 shrink-0', onlyMustBuy && 'bg-amber-600 hover:bg-amber-700')}
          >
            <Star className="h-3.5 w-3.5" />
            {onlyMustBuy ? `必须采买 (${mustBuyItems.length})` : '只看必须采买'}
          </Button>
          {selectedStore && (
            <Button
              variant={onlyMissing ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOnlyMissing((v) => !v)}
              className="gap-1.5 shrink-0"
            >
              <AlertCircle className="h-3.5 w-3.5" />
              {onlyMissing ? '显示全部' : '只看缺购'}
            </Button>
          )}
        </div>

        {/* 清单内容 — 单一大表 */}
        {loadingInitial ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">加载推荐数据中...</CardContent></Card>
        ) : !universalTemplate || universalTemplate.totalProducts === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>暂无采购推荐数据</p>
              <p className="text-xs mt-1">请先导入历史出货数据后再使用</p>
            </CardContent>
          </Card>
        ) : checklistSort.sortedData.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            {onlyMissing ? `${selectedStore} 已采购全部推荐商品` : '没有匹配的商品'}
          </CardContent></Card>
        ) : (
          <div className="surface-panel overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  {selectedStore && <TableHead className="w-10"></TableHead>}
                  <SortableTableHead
                    sortKey="category"
                    currentSortKey={checklistSort.sortKey}
                    currentSortDir={checklistSort.sortDir}
                    onSort={checklistSort.onSort}
                    className="w-[90px]"
                  >
                    品类
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="name"
                    currentSortKey={checklistSort.sortKey}
                    currentSortDir={checklistSort.sortDir}
                    onSort={checklistSort.onSort}
                  >
                    商品名称
                  </SortableTableHead>
                  <TableHead className="w-[72px]">优先级</TableHead>
                  <SortableTableHead
                    sortKey="avgQty"
                    currentSortKey={checklistSort.sortKey}
                    currentSortDir={checklistSort.sortDir}
                    onSort={checklistSort.onSort}
                    className="w-[80px] text-right"
                  >
                    参考用量
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="storeCount"
                    currentSortKey={checklistSort.sortKey}
                    currentSortDir={checklistSort.sortDir}
                    onSort={checklistSort.onSort}
                    className="w-[50px] text-right"
                  >
                    门店
                  </SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedItems.map((item, index) => (
                  <TableRow
                    key={`${item.name}-${index}`}
                    className={cn(selectedStore && item.purchased && 'opacity-40')}
                  >
                    {selectedStore && (
                      <TableCell className="px-2">
                        <div className={cn(
                          'mx-auto h-4 w-4 rounded-full border-[1.5px] flex items-center justify-center',
                          item.purchased
                            ? 'border-green-500 bg-green-100'
                            : 'border-muted-foreground/25',
                        )}>
                          {item.purchased && <Check className="h-2.5 w-2.5 text-green-600" />}
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="text-xs text-muted-foreground">{item.category}</TableCell>
                    <TableCell>
                      <span className={cn(
                        'text-sm',
                        selectedStore && item.purchased && 'line-through text-muted-foreground',
                      )}>
                        {item.name}
                      </span>
                      {item.supplement && (
                        <span className="ml-1 text-[11px] text-muted-foreground">({item.supplement})</span>
                      )}
                    </TableCell>
                    <TableCell><PriorityBadge priority={item.priority} /></TableCell>
                    <TableCell className="text-right">
                      {item.avgQtyPerStore ? (
                        <span className={cn(
                          'text-xs tabular-nums',
                          onlyMustBuy ? 'rounded bg-amber-100 px-1 font-medium text-amber-800' : 'text-muted-foreground',
                        )}>
                          ~{item.avgQtyPerStore}{item.unit}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                      {item.storeCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between border-t px-3 py-2">
              <span className="text-xs text-muted-foreground">
                共 {checklistSort.sortedData.length} 件{onlyMustBuy && `（${majorityThreshold}+ 家门店均购买）`}
                {totalPages > 1 && `，第 ${page}/${totalPages} 页`}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    上一页
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    下一页
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 底部说明 */}
        {universalTemplate && (
          <p className="text-xs text-muted-foreground mt-2 pb-4">
            数据来源：{universalTemplate.totalStores} 家客户历史出货记录。
            「必须采买」= 3 家以上门店均购买的商品，参考用量为各店平均采购量。
            {selectedStore && loadingStore && ' 正在加载门店数据...'}
          </p>
        )}
      </div>
    </div>
  );
}
