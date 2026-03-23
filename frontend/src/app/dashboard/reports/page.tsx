/**
 * Input: 后端API
 * Output: 报表统计页面
 * Pos: 业务数据汇总与分析页面
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BarChart3, RefreshCw, Store } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { reportsService } from '@/services/reports.service';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, LoadingState } from '@/components/ui/data-state';

interface SupplierStats {
  id: string;
  name: string;
  totalAmount: number;
  contractCount: number;
}

interface StoreStats {
  id: string;
  name: string;
  itemCount: number;
}

interface ReportData {
  supplierStats: SupplierStats[];
  storeStats: StoreStats[];
  summary: {
    totalPurchaseAmount: number;
    totalPurchaseContracts: number;
    totalSalesContracts: number;
    totalProducts: number;
    totalContainers: number;
  };
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const [suppliersRes, storesRes, dashboardRes] = await Promise.all([
        reportsService.getSuppliers({ pageSize: 100 }),
        reportsService.getStores({ pageSize: 100 }),
        reportsService.getDashboardStats(),
      ]);

      const suppliers = suppliersRes.data?.items || [];
      const stores = storesRes.data?.items || [];
      const dashboard = dashboardRes.data || {};

      const supplierStats: SupplierStats[] = [];
      for (const supplier of suppliers.slice(0, 20)) {
        try {
          const purchasesRes = await reportsService.getPurchasesBySupplier(supplier.id);
          const purchaseData = purchasesRes.data;
          supplierStats.push({
            id: supplier.id,
            name: supplier.name,
            totalAmount:
              purchaseData?.items?.reduce((sum, contract) => sum + (contract.totalAmount || 0), 0) || 0,
            contractCount: purchaseData?.total ?? purchaseData?.pagination?.total ?? 0,
          });
        } catch {
          supplierStats.push({
            id: supplier.id,
            name: supplier.name,
            totalAmount: 0,
            contractCount: 0,
          });
        }
      }

      const storeStatsRaw: StoreStats[] = [];
      for (const store of stores.slice(0, 20)) {
        try {
          const salesRes = await reportsService.getSalesByStore(store.id);
          const total = salesRes.data?.total ?? salesRes.data?.pagination?.total ?? 0;
          storeStatsRaw.push({ id: store.id, name: store.name, itemCount: total });
        } catch {
          storeStatsRaw.push({ id: store.id, name: store.name, itemCount: 0 });
        }
      }
      const storeStats = storeStatsRaw.sort((a, b) => b.itemCount - a.itemCount);

      setData({
        supplierStats: supplierStats.filter(s => s.contractCount > 0).sort((a, b) => b.totalAmount - a.totalAmount),
        storeStats,
        summary: {
          totalPurchaseAmount: dashboard.overview?.purchaseContracts || 0,
          totalPurchaseContracts: dashboard.overview?.purchaseContracts || 0,
          totalSalesContracts: dashboard.overview?.salesContracts || 0,
          totalProducts: dashboard.overview?.products || 0,
          totalContainers: dashboard.overview?.containers || 0,
        },
      });
    } catch (error) {
      console.error('获取报表数据失败:', error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return <LoadingState title="加载中..." description="正在汇总供应商、门店和经营概览数据。" />;
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="报表统计" description="业务数据汇总与分析。" />
        <ErrorState
          title="数据加载失败"
          description="报表统计暂时不可用，请稍后重试。"
          action={
            <Button variant="outline" onClick={() => void fetchData()}>
              <RefreshCw className="mr-1 h-4 w-4" />
              重试
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="报表统计"
        description="业务数据汇总与分析。"
      />

      {/* 概览卡片 */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">商品总数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.summary.totalProducts || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">采购合同</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.summary.totalPurchaseContracts || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">销售合同</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.summary.totalSalesContracts || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">货柜数量</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.summary.totalContainers || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">门店数量</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.storeStats.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="purchase" className="space-y-4">
        <TabsList>
          <TabsTrigger value="purchase">采购汇总</TabsTrigger>
          <TabsTrigger value="stores">门店列表</TabsTrigger>
        </TabsList>

        <TabsContent value="purchase">
          <Card>
            <CardHeader>
              <CardTitle>按供应商统计</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.supplierStats && data.supplierStats.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>供应商</TableHead>
                      <TableHead className="text-right">采购总额</TableHead>
                      <TableHead className="text-right">合同数</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.supplierStats.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.name}</TableCell>
                        <TableCell className="text-right">¥{s.totalAmount.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{s.contractCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  icon={BarChart3}
                  title="暂无采购数据"
                  description="至少需要一份采购合同，才能生成供应商维度的汇总分析。"
                  className="py-10"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stores">
          <Card>
            <CardHeader>
              <CardTitle>门店列表</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.storeStats && data.storeStats.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>门店名称</TableHead>
                      <TableHead className="text-right">销售合同数</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.storeStats.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.name}</TableCell>
                        <TableCell className="text-right">{s.itemCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  icon={Store}
                  title="暂无门店数据"
                  description="门店建立销售合同后，这里会自动生成门店维度的销售统计。"
                  className="py-10"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
