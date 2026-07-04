/**
 * Input: 出口全流程步骤定义（静态配置）、next/navigation 路由
 * Output: 工作台「出口全流程」导航条（7 步用户故事线，逐步点击跳转对应模块）
 * Pos: 工作台首页组件，把采购签约→付款→排柜→单证→发票→退税→财务的完整路径可视化
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRouter } from 'next/navigation';
import {
  Banknote,
  ChevronRight,
  Container,
  FileCheck2,
  FileSignature,
  Landmark,
  PieChart,
  ReceiptText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** 流程步骤：图标 + 标题 + 关键动作摘要 + 跳转目标 */
const FLOW_STEPS = [
  {
    icon: FileSignature,
    title: '采购签约',
    desc: '起草合同 · 在线盖章 · 回传归档',
    href: '/dashboard/purchase',
  },
  {
    icon: Banknote,
    title: '付款登记',
    desc: '汇款信息 · 定金尾款 · 付清标记',
    href: '/dashboard/payments',
  },
  {
    icon: Container,
    title: '排柜出货',
    desc: '装箱参数 · 3D 排柜 · 双80%出柜',
    href: '/dashboard/sales',
  },
  {
    icon: FileCheck2,
    title: '单证核对',
    desc: '一键三单 · 出口 Excel · 装箱单核对',
    href: '/dashboard/tax-refunds?view=customs',
  },
  {
    icon: ReceiptText,
    title: '发票登记',
    desc: '催开发票 · 发票号留存',
    href: '/dashboard/purchase',
  },
  {
    icon: Landmark,
    title: '出口退税',
    desc: '每月5号提醒 · 退税清单',
    href: '/dashboard/tax-refunds',
  },
  {
    icon: PieChart,
    title: '财务分析',
    desc: '收付款 · 月度报表 · 成本结构',
    href: '/dashboard/finance',
  },
] as const;

/**
 * 职责：渲染出口业务全流程导航条
 * 思路：横向步骤条（移动端两列网格），每步可点击跳转对应模块；步骤间以箭头衔接体现先后顺序
 */
export function ExportFlowNav() {
  const router = useRouter();

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-muted-foreground">出口全流程</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="grid grid-cols-2 gap-2 md:flex md:items-stretch md:gap-0">
          {FLOW_STEPS.map((step, idx) => (
            <li key={step.title} className="flex min-w-0 items-stretch md:flex-1">
              <button
                type="button"
                onClick={() => router.push(step.href)}
                className="group flex w-full min-w-0 flex-col items-start gap-1.5 rounded-md border border-border/60 bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
                    <step.icon className="h-3 w-3" />
                  </span>
                  <span className="text-muted-foreground/70">{idx + 1}.</span>
                  <span className="truncate group-hover:text-primary">{step.title}</span>
                </span>
                <span className="block w-full truncate text-[11px] leading-4 text-muted-foreground">
                  {step.desc}
                </span>
              </button>
              {idx < FLOW_STEPS.length - 1 && (
                <span className="hidden shrink-0 items-center px-0.5 text-muted-foreground/40 md:flex">
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
