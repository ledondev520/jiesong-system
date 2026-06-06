/**
 * Input: 出口合同服务 (salesService)
 * Output: 货柜装箱总览页面（聚合展示所有合同的货柜与装箱状态）
 * Pos: 仓储物流模块子页面，集中查看货柜利用率与装箱明细入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { SalesContract, SalesStatus } from '@/types';
import { salesService } from '@/services/sales.service';
import { cachedFetch } from '@/lib/api-cache';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ModuleTabHeader, LOGISTICS_TABS } from '@/components/layout/ModuleTabHeader';
import { PageHeader } from '@/components/layout/PageHeader';
import { CONTAINER_40HQ } from '@/lib/binPacking';
import {
  Container,
  Boxes,
  Weight,
  Ship,
  ArrowRight,
  Anchor,
  Clock3,
} from 'lucide-react';
import { toast } from 'sonner';

export default function ContainersPage() {
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadContracts();
  }, []);

  const loadContracts = async () => {
    setLoading(true);
    try {
      const response = await cachedFetch(
        'sales-contracts-list',
        () => salesService.getAll({ page: 1, pageSize: 100, lite: true }),
      );
      setContracts(response.data?.items || []);
    } catch {
      toast.error('加载出口合同失败');
    } finally {
      setLoading(false);
    }
  };

  const containerStats = useMemo(() => {
    const preparing = contracts.filter((c) =>
      [SalesStatus.CONFIRMED, SalesStatus.PACKING].includes(c.status)
    );
    const inTransit = contracts.filter((c) => c.status === SalesStatus.SHIPPED);
    const arrived = contracts.filter((c) => c.status === SalesStatus.ARRIVED);
    const totalBoxes = contracts.reduce((sum, c) => sum + (c.totalBoxes || 0), 0);
    const totalVolume = contracts.reduce((sum, c) => sum + (c.volume || 0), 0);
    const totalWeight = contracts.reduce((sum, c) => sum + (c.grossWeight || 0), 0);
    return { preparing, inTransit, arrived, totalBoxes, totalVolume, totalWeight };
  }, [contracts]);

  const getStatusBadge = (status: SalesStatus) => {
    const config: Record<SalesStatus, { label: string; className: string }> = {
      [SalesStatus.DRAFT]: { label: '草稿', className: 'bg-gray-100 text-gray-700 hover:bg-gray-100 border-gray-200' },
      [SalesStatus.CONFIRMED]: { label: '已确认', className: 'bg-blue-50 text-blue-700 hover:bg-blue-50 border-blue-200' },
      [SalesStatus.PACKING]: { label: '装柜中', className: 'bg-purple-50 text-purple-700 hover:bg-purple-50 border-purple-200' },
      [SalesStatus.SHIPPED]: { label: '已发运', className: 'bg-orange-50 text-orange-700 hover:bg-orange-50 border-orange-200' },
      [SalesStatus.ARRIVED]: { label: '已到达', className: 'bg-cyan-50 text-cyan-700 hover:bg-cyan-50 border-cyan-200' },
      [SalesStatus.COMPLETED]: { label: '已完成', className: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200' },
      [SalesStatus.CANCELLED]: { label: '已取消', className: 'bg-red-50 text-red-700 hover:bg-red-50 border-red-200' },
    };
    const c = config[status] || { label: status, className: 'bg-gray-100 text-gray-700 hover:bg-gray-100 border-gray-200' };
    return <Badge variant="outline" className={c.className}>{c.label}</Badge>;
  };

  const getUtilizationColor = (percent: number) => {
    if (percent < 50) return 'text-emerald-600';
    if (percent < 80) return 'text-amber-600';
    return 'text-red-600';
  };

  const ContractCard = useCallback(({ contract }: { contract: SalesContract }) => {
    const volumeUsed = contract.volume || 0;
    const weightUsed = contract.grossWeight || 0;
    const cbmPercent = Math.min((volumeUsed / CONTAINER_40HQ.maxVolume) * 100, 100);

    return (
      <Card
        className="border-border/40 border-l-[3px] hover:border-primary/20 hover:shadow-md transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/10"
        style={{ borderLeftColor: 'oklch(0.55 0.1 250)' }}
        onClick={() => router.push(`/dashboard/sales/${contract.id}`)}
      >
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Ship className="h-4 w-4 shrink-0 text-primary" />
              <span className="font-semibold text-sm truncate">{contract.contractNo}</span>
            </div>
            <div className="shrink-0">{getStatusBadge(contract.status)}</div>
          </div>

          <div className="text-sm text-muted-foreground">
            {contract.port?.name || '未知目的港'}
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">箱数</p>
              <p className="tabular-nums font-medium">{contract.totalBoxes || 0} 箱</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">体积</p>
              <p className={`tabular-nums font-medium ${getUtilizationColor(cbmPercent)}`}>
                {volumeUsed.toFixed(1)} CBM
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">毛重</p>
              <p className="tabular-nums font-medium">{weightUsed.toLocaleString()} kg</p>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">容积利用率</span>
              <span className={`font-medium tabular-nums ${getUtilizationColor(cbmPercent)}`}>{cbmPercent.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${cbmPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-1">
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1">
              查看装箱 <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }, [router]);

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={LOGISTICS_TABS} moduleName="仓储物流" />
      <PageHeader
        title="货柜装箱"
        description="聚合查看所有出口合同的货柜利用率与装箱状态。"
      />

      {/* 统计概览 */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card className="border-border/70">
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">待装柜</p>
              <p className="text-xl font-semibold tabular-nums">{containerStats.preparing.length}</p>
            </div>
            <Boxes className="h-4 w-4 text-primary" />
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">在途</p>
              <p className="text-xl font-semibold tabular-nums">{containerStats.inTransit.length}</p>
            </div>
            <Container className="h-4 w-4 text-sky-600" />
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">已到港</p>
              <p className="text-xl font-semibold tabular-nums">{containerStats.arrived.length}</p>
            </div>
            <Anchor className="h-4 w-4 text-emerald-600" />
          </CardContent>
        </Card>
        <Card className="border-border/70">
          <CardContent className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">总箱数</p>
              <p className="text-xl font-semibold tabular-nums">{containerStats.totalBoxes}</p>
            </div>
            <Clock3 className="h-4 w-4 text-amber-600" />
          </CardContent>
        </Card>
      </div>

      {/* 合同卡片列表 */}
      {loading ? (
        <div className="surface-panel py-12 text-center text-sm text-muted-foreground">加载中...</div>
      ) : contracts.length === 0 ? (
        <div className="surface-panel flex flex-col items-center justify-center py-16 text-center">
          <Container className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold text-muted-foreground mb-2">暂无出口合同</h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs">
            还没有创建任何出口合同，无法查看货柜信息
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {contracts.map((contract) => (
            <ContractCard key={contract.id} contract={contract} />
          ))}
        </div>
      )}

      {/* 全局汇总 */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <Weight className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">全局毛重:</span>
          <span className="font-semibold tabular-nums">{containerStats.totalWeight.toLocaleString()} kg</span>
        </div>
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-primary" />
          <span className="text-muted-foreground">全局体积:</span>
          <span className="font-semibold tabular-nums">{containerStats.totalVolume.toFixed(2)} CBM</span>
        </div>
      </div>
    </div>
  );
}
