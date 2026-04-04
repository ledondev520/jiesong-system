/**
 * Input: 后端 dashboard API、opsExecutionService（未发货/采购清单）
 * Output: 工作台页面（高频动作 + 数据看板 + 经营执行）
 * Pos: 系统首页，提供经营概览、快速入口与执行工具
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, FileCheck2, PackageSearch, ShipWheel, ShoppingCart, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataDashboard } from '@/components/dashboard/DataDashboard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PurchaseStatus, SalesContract, SalesStatus } from '@/types';
import { purchaseService } from '@/services/purchase.service';
import { salesService } from '@/services/sales.service';
import { financialStatementsService } from '@/services/financialStatements.service';
import { UnshippedListTab } from './ops-execution/components/UnshippedListTab';
import { PurchaseChecklistTab } from './ops-execution/components/PurchaseChecklistTab';

const procurementStorySteps = [
  '起草采购并生成合同',
  '发给供应商签署',
  '回签归档后推进出口资料',
];

const workflowCards = [
  {
    title: '出口跟进',
    description: '供应商回签回来后，优先补录箱数、毛重、体积，再推进装柜和报关。',
    cta: '去补录出口参数',
    href: '/dashboard/sales',
    icon: ShipWheel,
    badge: '回签后处理',
  },
  {
    title: '财务上报',
    description: '老板或财务进入后，先上传本期三表，再看异常、回款和付款压力。',
    cta: '上传本期财务报表',
    href: '/dashboard/finance/statements',
    icon: Wallet,
    badge: '老板视角',
  },
] as const;

type StoryMetrics = {
  draftPurchases: number;
  exportPendingParams: number;
  latestFinancePeriod: string | null;
};

type StoryPurchaseTask = {
  id: string;
  contractNo?: string;
};

type StoryExportTask = {
  id: string;
  contractNo?: string;
};

const hasExportExecutionMetrics = (contract: Pick<SalesContract, 'status' | 'totalBoxes' | 'grossWeight' | 'volume'>) => {
  if (![SalesStatus.DRAFT, SalesStatus.CONFIRMED, SalesStatus.PACKING].includes(contract.status)) {
    return false;
  }

  return !(contract.totalBoxes > 0 && contract.grossWeight > 0 && contract.volume > 0);
};

/**
 * 职责：渲染工作台首页（含经营执行区块）
 * 思路：
 *  0. 高频动作入口
 *  1. 数据看板（趋势/焦点/风险）
 *  2. 经营执行（未发货清单 + 门店采购清单）
 */
export default function DashboardPage() {
  const router = useRouter();
  const [storyMetrics, setStoryMetrics] = useState<StoryMetrics>({
    draftPurchases: 0,
    exportPendingParams: 0,
    latestFinancePeriod: null,
  });
  const [draftPurchaseTasks, setDraftPurchaseTasks] = useState<StoryPurchaseTask[]>([]);
  const [exportPendingTasks, setExportPendingTasks] = useState<StoryExportTask[]>([]);

  useEffect(() => {
    let active = true;

    const loadStoryMetrics = async () => {
      try {
        const [purchaseRes, salesRes, periods] = await Promise.all([
          purchaseService.getAll({ page: 1, pageSize: 100, lite: true }),
          salesService.getAll({ page: 1, pageSize: 100, lite: true }),
          financialStatementsService.listStatements(),
        ]);

        if (!active) {
          return;
        }

        const purchases = purchaseRes.data?.items || [];
        const sales = salesRes.data?.items || [];

        setStoryMetrics({
          draftPurchases: purchases.filter((contract) => contract.status === PurchaseStatus.DRAFT).length,
          exportPendingParams: sales.filter((contract) => hasExportExecutionMetrics(contract)).length,
          latestFinancePeriod: periods[0]?.periodLabel || null,
        });
        setDraftPurchaseTasks(
          purchases
            .filter((contract) => contract.status === PurchaseStatus.DRAFT)
            .slice(0, 2)
            .map((contract) => ({ id: contract.id, contractNo: contract.contractNo })),
        );
        setExportPendingTasks(
          sales
            .filter((contract) => hasExportExecutionMetrics(contract))
            .slice(0, 2)
            .map((contract) => ({ id: contract.id, contractNo: contract.contractNo })),
        );
      } catch {
        if (!active) {
          return;
        }

        setStoryMetrics({
          draftPurchases: 0,
          exportPendingParams: 0,
          latestFinancePeriod: null,
        });
        setDraftPurchaseTasks([]);
        setExportPendingTasks([]);
      }
    };

    loadStoryMetrics();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="工作台"
        description="经营概览与日常执行"
        showBack={false}
      />

      <section aria-label="故事化工作台" className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">今日主任务</p>
          <h2 className="text-xl font-semibold tracking-tight">先把采购合同起出来，再把回签后的出口动作接上</h2>
        </div>

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full">采购主线</Badge>
              <Badge variant="outline" className="rounded-full">业务员首屏入口</Badge>
            </div>
            <CardTitle>采购合同起单</CardTitle>
            <CardDescription>
              业务员和供应商沟通完成后，第一步就在这里发起采购、补齐供应商信息、生成合同 PDF，并继续跟进回签与归档。
            </CardDescription>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full">
                待起草 {storyMetrics.draftPurchases} 份
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              {procurementStorySteps.map((step, index) => (
                <div key={step} className="rounded-2xl border border-border/70 bg-background/80 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    步骤 {index + 1}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{step}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button className="h-11 rounded-xl" onClick={() => router.push('/dashboard/purchase/create')}>
                <ShoppingCart className="mr-2 h-4 w-4" />
                新建采购合同
              </Button>
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => router.push('/dashboard/suppliers')}>
                <FileCheck2 className="mr-2 h-4 w-4" />
                新增供应商档案
              </Button>
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => router.push('/dashboard/contracts')}>
                <ClipboardList className="mr-2 h-4 w-4" />
                跟进采购合同
              </Button>
            </div>

            {draftPurchaseTasks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">待办采购</p>
                <div className="grid gap-2">
                  {draftPurchaseTasks.map((task) => (
                    <Button
                      key={task.id}
                      variant="ghost"
                      className="h-11 justify-between rounded-2xl border border-border/70 bg-background/70 px-4 text-left"
                      onClick={() => router.push(`/dashboard/purchase/${task.id}`)}
                      aria-label={`继续编辑采购合同 ${task.contractNo || task.id}`}
                    >
                      <span className="font-medium">{task.contractNo || task.id}</span>
                      <span className="text-xs text-muted-foreground">继续编辑</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          {workflowCards.map((card) => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className="border-border/70">
                <CardHeader className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                  <div>
                    <CardTitle className="text-base">{card.title}</CardTitle>
                    <Badge variant="outline" className="mt-1 rounded-full">{card.badge}</Badge>
                  </div>
                </div>
                <CardDescription className="text-sm leading-6">
                  {card.description}
                </CardDescription>
                {card.title === '出口跟进' && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="rounded-full">
                        待补录 {storyMetrics.exportPendingParams} 份
                      </Badge>
                    </div>
                    {exportPendingTasks.length > 0 && (
                      <div className="grid gap-2">
                        {exportPendingTasks.map((task) => (
                          <Button
                            key={task.id}
                            variant="ghost"
                            className="h-11 justify-between rounded-2xl border border-border/70 bg-background/70 px-4 text-left"
                            onClick={() => router.push(`/dashboard/sales/${task.id}`)}
                            aria-label={`补录出口参数 ${task.contractNo || task.id}`}
                          >
                            <span className="font-medium">{task.contractNo || task.id}</span>
                            <span className="text-xs text-muted-foreground">去补录</span>
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {card.title === '财务上报' && (
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="rounded-full">
                      最新账期 {storyMetrics.latestFinancePeriod || '待上传'}
                    </Badge>
                  </div>
                )}
              </CardHeader>
                <CardContent>
                  <Button variant="outline" className="h-11 w-full rounded-xl" onClick={() => router.push(card.href)}>
                    {card.cta}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <DataDashboard />

      {/* 经营执行 */}
      <section aria-label="经营执行">
        <h2 className="text-lg font-semibold mb-4">经营执行</h2>
        <Tabs defaultValue="unshipped" className="space-y-4">
          <TabsList className="h-auto w-full flex-wrap justify-start border bg-background">
            <TabsTrigger value="unshipped" className="gap-2">
              <PackageSearch className="h-4 w-4" />
              未发货清单
            </TabsTrigger>
            <TabsTrigger value="purchase-checklist" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              门店采购清单
            </TabsTrigger>
          </TabsList>
          <TabsContent value="unshipped">
            <UnshippedListTab />
          </TabsContent>
          <TabsContent value="purchase-checklist">
            <PurchaseChecklistTab />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  );
}
