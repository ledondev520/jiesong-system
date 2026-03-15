/**
 * Input: 门店采购建议API（storeRecommendService）+ 开业采购模板API（procurementTemplateService）
 * Output: 门店采购建议看板页面（含AI推荐、CSV实数据两套视图）
 * Pos: 功能页面，展示门店采购分析、AI建议、以及基于历史数据的开业采购模板
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Store,
  Loader2,
  Package,
  DollarSign,
  ShoppingCart,
  Utensils,
  Lightbulb,
  Sofa,
  Wrench,
  Box,
  CheckCircle2,
  Sparkles,
  BarChart3,
  Star,
  BookOpen,
  ChevronRight,
  Factory,
  Ruler,
  TrendingUp,
  Flame,
  Layers,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { storeRecommendService, type RecommendResult, type StoreStats } from '@/services/storeRecommend.service';
import {
  procurementTemplateService,
  type UniversalTemplate,
  type StoreTemplate,
  type TemplateItem,
} from '@/services/procurementTemplate.service';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, PROCUREMENT_TABS } from '@/components/layout/ModuleTabHeader';

// ==================== 图标/颜色映射 ====================

type IconComponent = React.ComponentType<{ className?: string }>;

const categoryIcons: Record<string, IconComponent> = {
  '餐厅设备': Utensils,
  '餐具用品': ShoppingCart,
  '装修材料': Box,
  '灯具照明': Lightbulb,
  '灯光照明': Lightbulb,
  '家具软装': Sofa,
  '家具家居': Sofa,
  '后厨设备': Wrench,
  '厨房设备': Wrench,
  '传送设备': Factory,
  '火锅器材': Flame,
  '装饰配件': Layers,
  '食材物料': Package,
  '其他配件': Package,
};

const priorityConfig = {
  '强烈建议': {
    badge: 'bg-red-100 text-red-700 border-red-200',
    row: 'bg-red-50/40 dark:bg-red-950/20',
    dot: 'bg-red-500',
    label: '必备',
  },
  '建议': {
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    row: 'bg-amber-50/30 dark:bg-amber-950/10',
    dot: 'bg-amber-500',
    label: '推荐',
  },
  '可选': {
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    row: '',
    dot: 'bg-blue-400',
    label: '参考',
  },
};

// ==================== 子组件 ====================

/** 优先级徽章 */
function PriorityBadge({ priority }: { priority: string }) {
  const cfg = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig['可选'];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

/** 单个品类卡片（通用模板视图） */
function CategoryCard({ category, items }: { category: string; items: TemplateItem[] }) {
  const Icon = categoryIcons[category] || Package;
  const mustHave = items.filter((i) => i.priority === '强烈建议');
  const recommended = items.filter((i) => i.priority === '建议');

  return (
    <Card className="border-2 flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            {category}
          </span>
          <Badge variant="secondary" className="text-xs">{items.length}种</Badge>
        </CardTitle>
        <CardDescription className="flex gap-3 text-xs">
          {mustHave.length > 0 && (
            <span className="text-red-600 font-medium">必备 {mustHave.length} 种</span>
          )}
          {recommended.length > 0 && (
            <span className="text-amber-600">推荐 {recommended.length} 种</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {items.map((item) => {
            const cfg = priorityConfig[item.priority as keyof typeof priorityConfig] || priorityConfig['可选'];
            return (
              <div
                key={item.name}
                className={`flex items-start justify-between p-2 rounded-md text-sm gap-2 ${cfg.row}`}
              >
                <div className="flex items-start gap-1.5 min-w-0">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{item.name}</div>
                    {item.supplement && (
                      <div className="text-xs text-muted-foreground truncate">{item.supplement}</div>
                    )}
                  </div>
                </div>
                <div className="text-right text-xs shrink-0">
                  <div className="text-muted-foreground">
                    {item.avgQtyPerStore != null
                      ? `均${item.avgQtyPerStore}${item.unit !== '—' ? item.unit : ''}`
                      : '参考'}
                  </div>
                  <div className="text-muted-foreground/70">{item.storeCount}家采购</div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ==================== 工具函数 ====================

/**
 * 职责：将通用必备采购清单导出为 CSV 文件并触发浏览器下载
 * 参数：items - 强烈建议级别的采购项数组，templateStore - 模板基准门店名
 */
function downloadMustHaveCSV(items: TemplateItem[], templateStore: string) {
  const BOM = '\uFEFF'; // UTF-8 BOM，让 Excel 正确识别中文
  const headers = ['物品名称', '补充说明', '品类', '出现门店数', '建议采购量', '单位', '参考厂家'];
  const rows = items
    .filter((i) => i.priority === '强烈建议')
    .map((item) => [
      item.name,
      item.supplement || '',
      item.category,
      item.storeCount,
      item.avgQtyPerStore ?? '',
      item.unit !== '—' ? item.unit : '',
      item.manufacturers.join('、'),
    ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `开业必备采购清单（${templateStore}模板）.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ==================== 主页面 ====================

export default function StoreRecommendPage() {
  // AI 推荐数据（原有）
  const [storeStats, setStoreStats] = useState<StoreStats[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendResult | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);

  // 开业模板数据（新增）
  const [storeList, setStoreList] = useState<string[]>([]);
  const [universalTemplate, setUniversalTemplate] = useState<UniversalTemplate | null>(null);
  const [storeTemplate, setStoreTemplate] = useState<StoreTemplate | null>(null);
  const [selectedStore, setSelectedStore] = useState<string>('__universal__');
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [loadingStoreData, setLoadingStoreData] = useState(false);

  // 初始加载
  useEffect(() => {
    loadAIData();
    loadTemplateData();
  }, []);

  const loadAIData = async () => {
    setLoadingAI(true);
    try {
      const [statsRes, recommendRes] = await Promise.all([
        storeRecommendService.getStoreStats(),
        storeRecommendService.generateRecommendations({
          referenceStoreIds: [],
          targetStoreName: '新门店',
        }),
      ]);
      setStoreStats(statsRes.data || []);
      setRecommendation(recommendRes.data || null);
    } catch (e) {
      console.error('加载AI推荐数据失败:', e);
    } finally {
      setLoadingAI(false);
    }
  };

  const loadTemplateData = async () => {
    setLoadingTemplate(true);
    try {
      const [storesRes, universalRes] = await Promise.all([
        procurementTemplateService.getStoreList(),
        procurementTemplateService.getUniversalTemplate(),
      ]);
      setStoreList(storesRes.data || []);
      setUniversalTemplate(universalRes.data || null);
    } catch (e) {
      console.error('加载采购模板数据失败:', e);
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleStoreSelect = useCallback(async (value: string) => {
    setSelectedStore(value);
    if (value === '__universal__') {
      setStoreTemplate(null);
      return;
    }
    setLoadingStoreData(true);
    try {
      const res = await procurementTemplateService.getStoreTemplate(value);
      setStoreTemplate(res.data || null);
    } catch (e) {
      console.error('加载门店采购数据失败:', e);
    } finally {
      setLoadingStoreData(false);
    }
  }, []);

  // 当前展示数据（通用模板 or 指定门店）
  const isUniversal = selectedStore === '__universal__';
  const currentTemplate = isUniversal ? universalTemplate : storeTemplate;

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={PROCUREMENT_TABS} moduleName="采购" />
      <PageHeader
        title="门店采购指南"
        description={`基于 ${universalTemplate?.totalStores || 0} 家门店历史出货数据，生成开业采购优先级清单`}
      />

      <Tabs defaultValue="template" className="space-y-6">
        <TabsList className="border bg-background">
          <TabsTrigger value="template" className="gap-2">
            <BookOpen className="h-4 w-4" />
            开业采购模板
          </TabsTrigger>
          <TabsTrigger value="recommend" className="gap-2">
            <Sparkles className="h-4 w-4" />
            AI采购建议
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            门店采购统计
          </TabsTrigger>
        </TabsList>

        {/* ===================== Tab 1：开业采购模板（CSV实数据） ===================== */}
        <TabsContent value="template" className="space-y-6">
          {loadingTemplate ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* 门店选择器 */}
              <Card>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Store className="h-4 w-4 text-primary" />
                      查看模式：
                    </div>
                    <Select value={selectedStore} onValueChange={handleStoreSelect}>
                      <SelectTrigger className="w-56">
                        <SelectValue placeholder="选择门店" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__universal__">
                          <span className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            通用开业模板（所有门店汇总）
                          </span>
                        </SelectItem>
                        {storeList.map((s) => (
                          <SelectItem key={s} value={s}>
                            <span className="flex items-center gap-2">
                              <ChevronRight className="h-3 w-3" />
                              {s}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!isUniversal && (
                      <Badge variant="outline" className="text-xs">
                        显示该店历史实际采购
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 加载指定门店数据 */}
              {loadingStoreData && (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}

              {/* 通用模板视图 */}
              {isUniversal && universalTemplate && !loadingStoreData && (
                <>
                  {/* 概览统计 */}
                  <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Store className="h-4 w-4" />参考门店
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{universalTemplate.totalStores}</div>
                        <p className="text-xs text-muted-foreground">家门店的真实数据</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Package className="h-4 w-4" />物品种类
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{universalTemplate.totalProducts}</div>
                        <p className="text-xs text-muted-foreground">种采购物品</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-red-500" />必备物品
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-red-600">{universalTemplate.mustHaveCount}</div>
                        <p className="text-xs text-muted-foreground">以{universalTemplate.templateStore}为基准必购</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Layers className="h-4 w-4" />品类数量
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{Object.keys(universalTemplate.byCategory).length}</div>
                        <p className="text-xs text-muted-foreground">个物品大类</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* 品类卡片网格 */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(universalTemplate.byCategory).map(([category, items]) => (
                      <CategoryCard key={category} category={category} items={items} />
                    ))}
                  </div>

                  {/* 必备品详细表格 */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <CheckCircle2 className="h-5 w-5 text-red-500" />
                            必备采购清单
                          </CardTitle>
                          <CardDescription className="mt-1">
                            以{universalTemplate.templateStore}门店为基准，这些物品每家新店开业都应采购
                          </CardDescription>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0 gap-1.5"
                          onClick={() => downloadMustHaveCSV(universalTemplate.items, universalTemplate.templateStore)}
                        >
                          <Download className="h-3.5 w-3.5" />
                          下载清单
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>物品名称</TableHead>
                            <TableHead>品类</TableHead>
                            <TableHead className="text-center">出现门店</TableHead>
                            <TableHead className="text-right">建议采购量</TableHead>
                            <TableHead>参考厂家</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {universalTemplate.items
                            .filter((i) => i.priority === '强烈建议')
                            .map((item) => (
                              <TableRow key={item.name} className="bg-red-50/30 dark:bg-red-950/10">
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <Star className="h-3.5 w-3.5 fill-red-500 text-red-500 shrink-0" />
                                    <div>
                                      <div>{item.name}</div>
                                      {item.supplement && (
                                        <div className="text-xs text-muted-foreground">{item.supplement}</div>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">{item.category}</Badge>
                                </TableCell>
                                <TableCell className="text-center text-sm">{item.storeCount}家</TableCell>
                                <TableCell className="text-right text-sm font-medium">
                                  {item.avgQtyPerStore != null
                                    ? `约 ${item.avgQtyPerStore} ${item.unit !== '—' ? item.unit : ''}`
                                    : '—'}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {item.manufacturers.length > 0
                                    ? item.manufacturers.join('、')
                                    : '—'}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* 全量采购清单（按优先级） */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BookOpen className="h-5 w-5" />
                        完整采购清单
                      </CardTitle>
                      <CardDescription>
                        所有 {universalTemplate.totalProducts} 种物品，按优先级排序 · 数量为各门店均值
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>物品名称</TableHead>
                            <TableHead>品类</TableHead>
                            <TableHead>优先级</TableHead>
                            <TableHead className="text-center">出现门店</TableHead>
                            <TableHead className="text-right">均值采购量</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {universalTemplate.items.map((item) => (
                            <TableRow
                              key={item.name}
                              className={priorityConfig[item.priority as keyof typeof priorityConfig]?.row || ''}
                            >
                              <TableCell className="font-medium">
                                <div>
                                  <div>{item.name}</div>
                                  {item.supplement && (
                                    <div className="text-xs text-muted-foreground">{item.supplement}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{item.category}</Badge>
                              </TableCell>
                              <TableCell>
                                <PriorityBadge priority={item.priority} />
                              </TableCell>
                              <TableCell className="text-center text-sm">{item.storeCount}</TableCell>
                              <TableCell className="text-right text-sm">
                                {item.avgQtyPerStore != null
                                  ? `约 ${item.avgQtyPerStore} ${item.unit !== '—' ? item.unit : ''}`
                                  : '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              )}

              {/* 指定门店视图 */}
              {!isUniversal && storeTemplate && !loadingStoreData && (
                <>
                  {/* 门店概览 */}
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Store className="h-4 w-4" />{storeTemplate.storeName}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{storeTemplate.totalProducts}</div>
                        <p className="text-xs text-muted-foreground">种采购物品</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />历史采购总额
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-primary">
                          ¥{storeTemplate.totalAmount.toLocaleString()}
                        </div>
                        <p className="text-xs text-muted-foreground">人民币</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Layers className="h-4 w-4" />涉及品类
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{Object.keys(storeTemplate.byCategory).length}</div>
                        <p className="text-xs text-muted-foreground">个大类</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* 品类明细表 */}
                  {Object.entries(storeTemplate.byCategory).map(([category, items]) => {
                    const Icon = categoryIcons[category] || Package;
                    return (
                      <Card key={category}>
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Icon className="h-4 w-4 text-primary" />
                            {category}
                            <Badge variant="secondary" className="ml-auto text-xs">{items.length}种</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>物品名称</TableHead>
                                <TableHead>补充说明</TableHead>
                                <TableHead className="text-right">采购数量</TableHead>
                                <TableHead>单位</TableHead>
                                <TableHead>规格</TableHead>
                                <TableHead>厂家</TableHead>
                                <TableHead className="text-right">采购金额</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {items.map((item) => (
                                <TableRow key={item.name}>
                                  <TableCell className="font-medium">{item.name}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {item.supplement || '—'}
                                  </TableCell>
                                  <TableCell className="text-right text-sm">
                                    {item.totalQty > 0 ? item.totalQty : '—'}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {item.unit || '—'}
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground max-w-28 truncate">
                                    {item.spec || '—'}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    {item.manufacturer || '—'}
                                  </TableCell>
                                  <TableCell className="text-right text-sm font-medium">
                                    {item.totalAmount > 0 ? `¥${item.totalAmount.toLocaleString()}` : '—'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    );
                  })}
                </>
              )}
            </>
          )}
        </TabsContent>

        {/* ===================== Tab 2：AI 采购建议（原有内容保留） ===================== */}
        <TabsContent value="recommend" className="space-y-6">
          {loadingAI ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : recommendation ? (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Store className="h-4 w-4" />参考门店
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{recommendation.referenceStoreCount}</div>
                    <p className="text-xs text-muted-foreground">家门店数据</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Package className="h-4 w-4" />建议采购
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{recommendation.totalProducts}</div>
                    <p className="text-xs text-muted-foreground">种商品</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />预估总投入
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-primary">
                      ${recommendation.totalEstimatedCost.toLocaleString()}
                    </div>
                    <p className="text-xs text-muted-foreground">美金</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />必备商品
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-primary">
                      {recommendation.recommendations.filter((r) => r.priority === '强烈建议').length}
                    </div>
                    <p className="text-xs text-muted-foreground">种（50%+门店购买）</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Object.entries(recommendation.byCategory).map(([category, items]) => {
                  const Icon = categoryIcons[category] || Package;
                  const categoryTotal = items.reduce((sum, i) => sum + i.estimatedCost, 0);
                  const mustHave = items.filter((i) => i.priority === '强烈建议');
                  return (
                    <Card key={category} className="border-2">
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-base">
                            <Icon className="h-5 w-5" />
                            {category}
                          </span>
                          <Badge variant="secondary" className="text-xs">{items.length}种</Badge>
                        </CardTitle>
                        <CardDescription className="flex justify-between">
                          <span>预估: ${categoryTotal.toLocaleString()}</span>
                          {mustHave.length > 0 && (
                            <span className="text-primary">必备{mustHave.length}种</span>
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                          {items.map((item) => (
                            <div
                              key={item.productId}
                              className={`flex items-center justify-between p-2 rounded text-sm ${
                                item.priority === '强烈建议' ? 'bg-card border border-primary/20' : 'bg-card/70'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {item.priority === '强烈建议' && (
                                  <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                                )}
                                <span className="truncate max-w-[120px]">{item.productName}</span>
                              </div>
                              <div className="text-right text-xs">
                                <div className="font-medium">{item.suggestedQuantity}件</div>
                                <div className="text-muted-foreground">${item.estimatedCost}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    必备商品清单
                  </CardTitle>
                  <CardDescription>50%以上门店都购买的商品，强烈建议采购</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>商品名称</TableHead>
                        <TableHead>分类</TableHead>
                        <TableHead className="text-center">门店覆盖率</TableHead>
                        <TableHead className="text-right">建议数量</TableHead>
                        <TableHead className="text-right">单价</TableHead>
                        <TableHead className="text-right">预估金额</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recommendation.recommendations
                        .filter((r) => r.priority === '强烈建议')
                        .slice(0, 20)
                        .map((item) => (
                          <TableRow key={item.productId}>
                            <TableCell className="font-medium">
                              <Star className="mr-1 inline h-3.5 w-3.5 fill-primary text-primary" />
                              {item.productName}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{item.category}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full" style={{ width: `${item.frequency}%` }} />
                                </div>
                                <span className="text-xs">{item.frequency}%</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{item.suggestedQuantity}</TableCell>
                            <TableCell className="text-right">${item.avgUnitPrice}</TableCell>
                            <TableCell className="text-right font-medium text-primary">
                              ${item.estimatedCost.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center text-muted-foreground py-16">暂无AI推荐数据</div>
          )}
        </TabsContent>

        {/* ===================== Tab 3：门店采购统计（原有内容保留） ===================== */}
        <TabsContent value="stats" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">总门店数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{storeStats.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">总采购金额</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  ${storeStats.reduce((sum, s) => sum + s.totalAmount, 0).toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">平均每店采购</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  ${storeStats.length > 0
                    ? Math.round(storeStats.reduce((sum, s) => sum + s.totalAmount, 0) / storeStats.length).toLocaleString()
                    : 0}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                门店采购明细
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>门店名称</TableHead>
                    <TableHead className="text-right">商品种类</TableHead>
                    <TableHead className="text-right">采购金额</TableHead>
                    <TableHead>主要分类</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storeStats.map((store) => (
                    <TableRow key={store.storeId}>
                      <TableCell className="font-medium">{store.storeName}</TableCell>
                      <TableCell className="text-right">{store.productCount}</TableCell>
                      <TableCell className="text-right text-primary">
                        ${store.totalAmount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {store.categories.slice(0, 3).map((c) => (
                            <Badge key={c.name} variant="outline" className="text-xs">
                              {c.name}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
