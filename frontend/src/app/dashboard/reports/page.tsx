/**
 * Input: 后端API
 * Output: 报表统计页面
 * Pos: 业务数据汇总与分析页面
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState } from 'react';
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
import { Loader2 } from 'lucide-react';
import api from '@/lib/axios';
import { PageHeader } from '@/components/layout/PageHeader';
import type { ApiResponse, PaginatedResponse } from '@/types';

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

interface SupplierLite {
  id: string;
  name: string;
}

interface StoreLite {
  id: string;
  name: string;
}

interface PurchaseSummary {
  totalAmount?: number;
}

interface PurchaseSummaryResponse extends PaginatedResponse<PurchaseSummary> {
  total?: number;
}

interface DashboardStatsData {
  overview?: {
    purchaseContracts?: number;
    salesContracts?: number;
    products?: number;
    containers?: number;
  };
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // 获取多个统计数据
        const [suppliersRes, storesRes, dashboardRes] = await Promise.all([
          api.get<ApiResponse<PaginatedResponse<SupplierLite>>, ApiResponse<PaginatedResponse<SupplierLite>>>(
            '/suppliers',
            { params: { pageSize: 100 } },
          ),
          api.get<ApiResponse<PaginatedResponse<StoreLite>>, ApiResponse<PaginatedResponse<StoreLite>>>(
            '/stores',
            { params: { pageSize: 100 } },
          ),
          api.get<ApiResponse<DashboardStatsData>, ApiResponse<DashboardStatsData>>('/dashboard/stats'),
        ]);

        const suppliers = suppliersRes.data?.items || [];
        const stores = storesRes.data?.items || [];
        const dashboard = dashboardRes.data || {};

        // 获取每个供应商的采购统计
        const supplierStats: SupplierStats[] = [];
        for (const supplier of suppliers.slice(0, 20)) {
          try {
            const purchasesRes = await api.get<
              ApiResponse<PurchaseSummaryResponse>,
              ApiResponse<PurchaseSummaryResponse>
            >('/purchases', { params: { supplierId: supplier.id, pageSize: 1 } });
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

        // 门店统计
        const storeStats: StoreStats[] = stores.map((store) => ({
          id: store.id,
          name: store.name,
          itemCount: 0, // 需要额外查询
        }));

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
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2">加载中...</span>
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
                <p className="text-muted-foreground text-center py-8">暂无采购数据</p>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.storeStats.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-8">暂无门店数据</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
