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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Store, Loader2, TrendingUp, Package, DollarSign, BarChart3 } from 'lucide-react';
import api from '@/lib/axios';

interface StoreStats {
  storeId: string;
  storeName: string;
  totalAmount: number;
  productCount: number;
  categories: Array<{ name: string; amount: number; count: number }>;
  products: Array<{ productId: string; productName: string; quantity: number; totalPrice: number; category: string }>;
}

interface Recommendation {
  productId: string;
  productName: string;
  category: string;
  subCategory: string;
  frequency: number;
  storeCount: number;
  avgQuantity: number;
  suggestedQuantity: number;
  avgUnitPrice: number;
  estimatedCost: number;
  priority: string;
}

interface RecommendResult {
  targetStoreName: string;
  referenceStoreCount: number;
  totalProducts: number;
  totalEstimatedCost: number;
  recommendations: Recommendation[];
  byCategory: Record<string, Recommendation[]>;
}

export default function StoreRecommendPage() {
  const [storeStats, setStoreStats] = useState<StoreStats[]>([]);
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [recommendation, setRecommendation] = useState<RecommendResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, storesRes] = await Promise.all([
        api.get('/store-recommend/stats'),
        api.get('/store-recommend/stores'),
      ]);
      setStoreStats((statsRes as { data: StoreStats[] }).data);
      setStores((storesRes as { data: Array<{ id: string; name: string }> }).data);
    } catch (e) {
      console.error('加载数据失败:', e);
    } finally {
      setLoading(false);
    }
  };

  const generateRecommendation = async () => {
    setGenerating(true);
    try {
      const referenceStoreIds = selectedStore === 'all' ? [] : [selectedStore];
      const res = await api.post('/store-recommend/recommend', {
        referenceStoreIds,
        targetStoreName: '新门店',
      });
      setRecommendation((res as { data: RecommendResult }).data);
    } catch (e) {
      console.error('生成建议失败:', e);
    } finally {
      setGenerating(false);
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case '强烈建议':
        return <Badge className="bg-green-500">强烈建议</Badge>;
      case '建议采购':
        return <Badge className="bg-blue-500">建议采购</Badge>;
      default:
        return <Badge variant="outline">可选</Badge>;
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
      <div>
        <h2 className="text-2xl font-bold tracking-tight">门店采购建议</h2>
        <p className="text-muted-foreground">基于历史采购数据，为新门店生成采购建议</p>
      </div>

      <Tabs defaultValue="stats">
        <TabsList>
          <TabsTrigger value="stats">门店采购统计</TabsTrigger>
          <TabsTrigger value="recommend">采购建议生成</TabsTrigger>
        </TabsList>

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
                <div className="text-2xl font-bold text-green-600">
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
                      <TableCell className="text-right text-green-600">
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

        {/* 采购建议生成 */}
        <TabsContent value="recommend" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>生成采购建议</CardTitle>
              <CardDescription>选择参考门店，系统将基于其采购数据生成建议</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="text-sm font-medium">参考门店</label>
                  <Select value={selectedStore} onValueChange={setSelectedStore}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择参考门店" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部门店（综合分析）</SelectItem>
                      {stores.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={generateRecommendation} disabled={generating}>
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      生成中...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="mr-2 h-4 w-4" />
                      生成建议
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {recommendation && (
            <>
              {/* 建议概览 */}
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">参考门店数</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{recommendation.referenceStoreCount}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">建议商品数</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{recommendation.totalProducts}</div>
                  </CardContent>
                </Card>
                <Card className="border-green-200 bg-green-50/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">预估总金额</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">
                      ${recommendation.totalEstimatedCost.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">强烈建议</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-500">
                      {recommendation.recommendations.filter(r => r.priority === '强烈建议').length}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 按分类展示 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    采购建议清单（按分类）
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {Object.entries(recommendation.byCategory).map(([category, items]) => (
                      <div key={category}>
                        <h4 className="font-semibold mb-2 flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          {category}
                          <Badge variant="outline">{items.length}种</Badge>
                        </h4>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>商品名称</TableHead>
                              <TableHead>子分类</TableHead>
                              <TableHead className="text-center">出现频率</TableHead>
                              <TableHead className="text-right">建议数量</TableHead>
                              <TableHead className="text-right">单价</TableHead>
                              <TableHead className="text-right">预估金额</TableHead>
                              <TableHead className="text-center">优先级</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {items.slice(0, 10).map((item) => (
                              <TableRow key={item.productId}>
                                <TableCell className="font-medium">{item.productName}</TableCell>
                                <TableCell className="text-muted-foreground">{item.subCategory}</TableCell>
                                <TableCell className="text-center">{item.frequency}%</TableCell>
                                <TableCell className="text-right">{item.suggestedQuantity}</TableCell>
                                <TableCell className="text-right">${item.avgUnitPrice}</TableCell>
                                <TableCell className="text-right text-green-600">
                                  ${item.estimatedCost.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-center">{getPriorityBadge(item.priority)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
