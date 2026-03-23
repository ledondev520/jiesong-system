/**
 * Input: procurementTemplateService（门店列表、通用模板、门店历史采购）
 * Output: 采购建议动态清单页面（选择客户后展示推荐商品与缺购商品）
 * Pos: 采购模块子页面，帮助销售人员快速告知客户还需采购哪些商品
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Check, Package, Search, ClipboardList, ShoppingBag, AlertCircle } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { categoryIcons, PriorityBadge } from './storeRecommendShared';

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

/**
 * 职责：将缺购商品格式化为可复制的纯文本清单
 */
function formatMissingList(storeName: string, missing: ChecklistItem[]): string {
  const byCategory: Record<string, ChecklistItem[]> = {};
  for (const item of missing) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  const lines: string[] = [
    `【${storeName} - 采购建议清单】`,
    `共 ${missing.length} 件商品建议采购：`,
    '',
  ];

  const priorityOrder = ['强烈建议', '建议', '可选'];
  const sortedCategories = Object.keys(byCategory).sort();

  for (const category of sortedCategories) {
    const items = [...byCategory[category]].sort(
      (a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority),
    );
    lines.push(`【${category}】`);
    for (const item of items) {
      const priorityLabel = item.priority === '强烈建议' ? '★必备' : item.priority === '建议' ? '☆推荐' : '';
      const qtyHint = item.avgQtyPerStore ? `（参考用量：${item.avgQtyPerStore}${item.unit}）` : '';
      lines.push(`- ${item.name}${item.supplement ? `（${item.supplement}）` : ''} ${priorityLabel}${qtyHint}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim();
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
  const [copied, setCopied] = useState(false);

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

  const filteredItems = useMemo(() => {
    let items = allItems;
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
  }, [allItems, onlyMissing, selectedStore, search]);

  // 3. 统计数据
  const stats = useMemo(() => {
    const total = allItems.length;
    const purchased = allItems.filter((i) => i.purchased).length;
    const missing = total - purchased;
    return { total, purchased, missing };
  }, [allItems]);

  // 4. 复制缺购清单
  const handleCopy = useCallback(() => {
    const missing = allItems.filter((i) => !i.purchased);
    const storeName = selectedStore || '新客户';
    const text = formatMissingList(storeName, missing);
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [allItems, selectedStore]);

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
                  storeList.map((store) => (
                    <SelectItem key={store} value={store}>{store}</SelectItem>
                  ))
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

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!selectedStore || stats.missing === 0}
              className="gap-1.5"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? '已复制' : '复制缺购清单'}
            </Button>
          </div>
        </div>

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

        {/* 清单内容 */}
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
        ) : (
          <div className="space-y-3">
            {/* 无搜索结果提示 */}
            {filteredItems.length === 0 && (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
                {onlyMissing ? `${selectedStore} 已采购全部推荐商品 🎉` : '没有匹配的商品'}
              </CardContent></Card>
            )}

            {/* 按品类分组展示 */}
            {(() => {
              const byCategory: Record<string, typeof filteredItems> = {};
              for (const item of filteredItems) {
                if (!byCategory[item.category]) byCategory[item.category] = [];
                byCategory[item.category].push(item);
              }
              const sortedCategories = Object.keys(byCategory).sort();

              return sortedCategories.map((category) => {
                const Icon = categoryIcons[category] ?? Package;
                const items = byCategory[category];
                const missingInCat = items.filter((i) => !i.purchased).length;

                return (
                  <Card key={category} className={cn(missingInCat > 0 && selectedStore ? '' : '')}>
                    <CardContent className="pt-4 pb-3 px-4">
                      {/* 品类标题 */}
                      <div className="flex items-center gap-2 mb-3">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm">{category}</span>
                        <Badge variant="secondary" className="text-xs ml-auto">
                          {items.length} 件
                        </Badge>
                        {selectedStore && missingInCat > 0 && (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-200 bg-amber-50">
                            缺 {missingInCat}
                          </Badge>
                        )}
                      </div>

                      {/* 商品列表 */}
                      <div className="divide-y divide-border/60">
                        {items.map((item, index) => (
                          <div
                            key={`${item.name}-${index}`}
                            className={cn(
                              'flex items-center gap-3 py-2.5 text-sm',
                              selectedStore && item.purchased && 'opacity-50',
                            )}
                          >
                            {/* 采购状态圆点 */}
                            {selectedStore ? (
                              <div className={cn(
                                'h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center',
                                item.purchased
                                  ? 'border-green-500 bg-green-100 dark:bg-green-900/30'
                                  : 'border-muted-foreground/30',
                              )}>
                                {item.purchased && <Check className="h-3 w-3 text-green-600" />}
                              </div>
                            ) : (
                              <div className="h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground/20" />
                            )}

                            {/* 商品名称 */}
                            <div className="flex-1 min-w-0">
                              <span className={cn('font-medium', selectedStore && item.purchased && 'line-through text-muted-foreground')}>
                                {item.name}
                              </span>
                              {item.supplement && (
                                <span className="ml-1 text-xs text-muted-foreground">({item.supplement})</span>
                              )}
                            </div>

                            {/* 优先级 */}
                            <div className="shrink-0 hidden xs:block">
                              <PriorityBadge priority={item.priority} />
                            </div>

                            {/* 参考用量 */}
                            {item.avgQtyPerStore && (
                              <span className="shrink-0 text-xs text-muted-foreground hidden sm:block">
                                ~{item.avgQtyPerStore}{item.unit}
                              </span>
                            )}

                            {/* 门店覆盖率 */}
                            <span className="shrink-0 text-xs text-muted-foreground hidden md:block tabular-nums">
                              {item.storeCount}家
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              });
            })()}
          </div>
        )}

        {/* 底部说明 */}
        {universalTemplate && (
          <p className="text-xs text-muted-foreground mt-2 pb-4">
            数据来源：{universalTemplate.totalStores} 家客户历史出货记录；优先级基于商品覆盖门店数量计算。
            {selectedStore && loadingStore && ' 正在加载门店数据...'}
          </p>
        )}
      </div>
    </div>
  );
}
