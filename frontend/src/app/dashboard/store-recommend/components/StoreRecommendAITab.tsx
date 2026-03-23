'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/data-state';
import type { RecommendResult } from '@/services/storeRecommend.service';
import { CheckCircle2, DollarSign, Package, Star, Store } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { categoryIcons } from './storeRecommendShared';

export function StoreRecommendAITab({
  loadingAI,
  recommendation,
}: {
  loadingAI: boolean;
  recommendation: RecommendResult | null;
}) {
  if (loadingAI) {
    return <LoadingState title="加载中..." description="正在生成 AI 采购建议和分类汇总。" />;
  }

  if (!recommendation) {
    return <EmptyState title="暂无AI推荐数据" description="当前没有可展示的 AI 采购建议结果。" />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
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
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4" />
              建议采购
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{recommendation.totalProducts}</div>
            <p className="text-xs text-muted-foreground">种商品</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <DollarSign className="h-4 w-4" />
              预估总投入
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">${recommendation.totalEstimatedCost.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">美金</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" />
              必备商品
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              {recommendation.recommendations.filter((item) => item.priority === '强烈建议').length}
            </div>
            <p className="text-xs text-muted-foreground">种（50%+门店购买）</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(recommendation.byCategory).map(([category, items]) => {
          const Icon = categoryIcons[category] || Package;
          const categoryTotal = items.reduce((sum, item) => sum + item.estimatedCost, 0);
          const mustHave = items.filter((item) => item.priority === '强烈建议');

          return (
            <Card key={category} className="border-2">
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
                  {mustHave.length > 0 ? <span className="text-primary">必备{mustHave.length}种</span> : null}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {items.map((item) => (
                    <div
                      key={item.productId}
                      className={`flex items-center justify-between rounded p-2 text-sm ${
                        item.priority === '强烈建议' ? 'border border-primary/20 bg-card' : 'bg-card/70'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {item.priority === '强烈建议' ? (
                          <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                        ) : null}
                        <span className="max-w-[120px] truncate">{item.productName}</span>
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
                .filter((item) => item.priority === '强烈建议')
                .slice(0, 20)
                .map((item) => (
                  <TableRow key={item.productId}>
                    <TableCell className="font-medium">
                      <Star className="mr-1 inline h-3.5 w-3.5 fill-primary text-primary" />
                      {item.productName}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {item.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${item.frequency}%` }} />
                        </div>
                        <span className="text-xs">{item.frequency}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{item.suggestedQuantity}</TableCell>
                    <TableCell className="text-right">${item.avgUnitPrice}</TableCell>
                    <TableCell className="text-right font-medium text-primary">${item.estimatedCost.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
