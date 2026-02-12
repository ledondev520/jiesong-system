/**
 * Input: 门店采购建议API
 * Output: 门店采购建议看板页面
 * Pos: 功能页面，展示门店采购分析和建议
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState } from 'react';
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
import { Store, Loader2, Package, DollarSign, ShoppingCart, Utensils, Lightbulb, Sofa, Wrench, Box, CheckCircle2, Sparkles, BarChart3, Star } from 'lucide-react';
import api from '@/lib/axios';
import { PageHeader } from '@/components/layout/PageHeader';

interface StoreStats {
  storeId: string;
  storeName: string;
  totalAmount: number;
  productCount: number;
  categories: Array<{ name: string; amount: number; count: number }>;
}

interface Recommendation {
  productId: string;
  productName: string;
  category: string;
  subCategory: string;
  frequency: number;
  suggestedQuantity: number;
  avgUnitPrice: number;
  estimatedCost: number;
  priority: string;
}

interface RecommendResult {
  referenceStoreCount: number;
  totalProducts: number;
  totalEstimatedCost: number;
  recommendations: Recommendation[];
  byCategory: Record<string, Recommendation[]>;
}

// 分类图标映射
const categoryIcons: Record<string, typeof Package> = {
  '餐厅设备': Utensils,
  '餐具用品': ShoppingCart,
  '装修材料': Box,
  '灯具照明': Lightbulb,
  '家具家居': Sofa,
  '后厨设备': Wrench,
  '其他配件': Package,
};

// 分类颜色映射
const categoryColors: Record<string, string> = {
  '餐厅设备': 'border-destructive/35 bg-destructive/8',
  '餐具用品': 'border-primary/35 bg-primary/7',
  '装修材料': 'border-chart-5/35 bg-chart-5/10',
  '灯具照明': 'border-chart-4/35 bg-chart-4/10',
  '家具家居': 'border-chart-1/35 bg-chart-1/10',
  '后厨设备': 'border-chart-3/35 bg-chart-3/10',
  '其他配件': 'border-border/80 bg-muted/30',
};

export default function StoreRecommendPage() {
  const [storeStats, setStoreStats] = useState<StoreStats[]>([]);
  const [recommendation, setRecommendation] = useState<RecommendResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, recommendRes] = await Promise.all([
        api.get('/store-recommend/stats'),
        api.post('/store-recommend/recommend', {
          referenceStoreIds: [],
          targetStoreName: '新门店',
        }),
      ]);
      setStoreStats((statsRes as { data: StoreStats[] }).data);
      setRecommendation((recommendRes as { data: RecommendResult }).data);
    } catch (e) {
      console.error('加载数据失败:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="门店采购建议"
        description={`基于 ${recommendation?.referenceStoreCount || 0} 家门店的历史采购数据，为新门店生成采购建议`}
      />

      <Tabs defaultValue="recommend">
        <TabsList className="rounded-xl border border-border/70 bg-background/60">
          <TabsTrigger value="recommend" className="gap-2">
            <Sparkles className="h-4 w-4" />
            新店采购清单
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            门店采购统计
          </TabsTrigger>
        </TabsList>

        {/* 采购建议（主页面） */}
        <TabsContent value="recommend" className="space-y-6">
          {recommendation && (
            <>
              {/* 概览卡片 */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Store className="h-4 w-4" />
                      参考门店
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
                      <Package className="h-4 w-4" />
                      建议采购
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">{recommendation.totalProducts}</div>
                    <p className="text-xs text-muted-foreground">种商品</p>
                  </CardContent>
                </Card>
                <Card className="border-chart-3/35 bg-chart-3/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 text-chart-3">
                      <DollarSign className="h-4 w-4" />
                      预估总投入
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-chart-3">
                      ${recommendation.totalEstimatedCost.toLocaleString()}
                    </div>
                    <p className="text-xs text-chart-3/70">美金</p>
                  </CardContent>
                </Card>
                <Card className="border-chart-5/35 bg-chart-5/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 text-chart-5">
                      <CheckCircle2 className="h-4 w-4" />
                      必备商品
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-chart-5">
                      {recommendation.recommendations.filter(r => r.priority === '强烈建议').length}
                    </div>
                    <p className="text-xs text-chart-5/70">种（50%+门店购买）</p>
                  </CardContent>
                </Card>
              </div>

              {/* 分类采购清单 */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Object.entries(recommendation.byCategory).map(([category, items]) => {
                  const Icon = categoryIcons[category] || Package;
                  const colorClass = categoryColors[category] || 'border-border/80 bg-muted/30';
                  const categoryTotal = items.reduce((sum, i) => sum + i.estimatedCost, 0);
                  const mustHave = items.filter(i => i.priority === '强烈建议');
                  
                  return (
                    <Card key={category} className={`${colorClass} border-2`}>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center justify-between">
                          <span className="flex items-center gap-2 text-base">
                            <Icon className="h-5 w-5" />
                            {category}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {items.length}种
                          </Badge>
                        </CardTitle>
                        <CardDescription className="flex justify-between">
                          <span>预估: ${categoryTotal.toLocaleString()}</span>
                          {mustHave.length > 0 && (
                            <span className="text-chart-5">必备{mustHave.length}种</span>
                          )}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scrollbar-thin">
                          {items.map((item) => (
                            <div 
                              key={item.productId} 
                              className={`flex items-center justify-between p-2 rounded text-sm ${
                                item.priority === '强烈建议' ? 'bg-card/92 border border-chart-5/35' : 'bg-card/75'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {item.priority === '强烈建议' && (
                                  <Star className="h-3.5 w-3.5 fill-chart-5 text-chart-5" />
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

              {/* 必备商品清单（表格） */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-chart-5" />
                    必备商品清单
                  </CardTitle>
                  <CardDescription>
                    50%以上门店都购买的商品，强烈建议采购
                  </CardDescription>
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
                        .filter(r => r.priority === '强烈建议')
                        .slice(0, 20)
                        .map((item) => (
                          <TableRow key={item.productId}>
                            <TableCell className="font-medium">
                              <Star className="mr-1 inline h-3.5 w-3.5 fill-chart-5 text-chart-5" />
                              {item.productName}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{item.category}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-chart-5 rounded-full"
                                    style={{ width: `${item.frequency}%` }}
                                  />
                                </div>
                                <span className="text-xs">{item.frequency}%</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{item.suggestedQuantity}</TableCell>
                            <TableCell className="text-right">${item.avgUnitPrice}</TableCell>
                            <TableCell className="text-right font-medium text-chart-3">
                              ${item.estimatedCost.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* 门店采购统计 */}
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
                <div className="text-2xl font-bold text-chart-3">
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
                      <TableCell className="text-right text-chart-3">
                        ${store.totalAmount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {store.categories.slice(0, 3).map(c => (
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
