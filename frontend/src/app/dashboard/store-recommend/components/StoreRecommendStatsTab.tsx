'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { StoreStats } from '@/services/storeRecommend.service';
import { Store } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function StoreRecommendStatsTab({ storeStats }: { storeStats: StoreStats[] }) {
  if (storeStats.length === 0) {
    return <EmptyState title="暂无门店统计数据" description="当前没有可展示的门店采购统计。" />;
  }

  const totalAmount = storeStats.reduce((sum, store) => sum + store.totalAmount, 0);
  const averageAmount = storeStats.length > 0 ? Math.round(totalAmount / storeStats.length) : 0;

  return (
    <div className="space-y-4">
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
            <div className="text-2xl font-bold text-primary">${totalAmount.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">平均每店采购</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${averageAmount.toLocaleString()}</div>
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
                  <TableCell className="text-right text-primary">${store.totalAmount.toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {store.categories.slice(0, 3).map((category) => (
                        <Badge key={category.name} variant="outline" className="text-xs">
                          {category.name}
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
    </div>
  );
}
