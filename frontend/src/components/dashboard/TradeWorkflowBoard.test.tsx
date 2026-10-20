/**
 * Input: 专项单主线路卡片数据、router
 * Output: 阶段进度、阻塞和唯一下一动作的交互测试
 * Pos: 工作台主线路展示 Module 测试
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TradeWorkflowBoard } from './TradeWorkflowBoard';
import type { TradeWorkflow } from '@/services/tradeWorkflow.service';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const workflow: TradeWorkflow = {
  id: 'sc-1',
  contractNo: 'EXP260008',
  status: 'PACKING',
  purchaseContractNos: ['CG260001'],
  completedStageCount: 3,
  stageCount: 8,
  nextAction: { label: '调整排柜', href: '/dashboard/sales/sc-1' },
  issues: ['仍有 8 箱无法装入'],
  stages: [
    { key: 'procurement', label: '采购签约', status: 'completed', reason: '已签约' },
    { key: 'payment', label: '采购付款', status: 'completed', reason: '已付清' },
    { key: 'production', label: '生产与资料', status: 'completed', reason: '已完工' },
    { key: 'loading', label: '排柜与出货', status: 'blocked', reason: '3D 排柜仍有 8 箱无法装入', action: { label: '调整排柜', href: '/dashboard/sales/sc-1' } },
    { key: 'documents', label: '出口单证', status: 'pending', reason: '待排柜完成' },
    { key: 'invoice', label: '供应商发票', status: 'pending', reason: '发运后催票' },
    { key: 'tax-refund', label: '退税准备', status: 'pending', reason: '发运后准备' },
    { key: 'finance', label: '财务结清', status: 'pending', reason: '待收付' },
  ],
  readiness: {
    ready: false,
    overloaded: false,
    overloadReasons: [],
    utilizationReady: true,
    physicalFit: false,
    placedBoxCount: 106,
    unplacedBoxCount: 8,
    estimatedDimensionCount: 7,
    missingBoxItemCount: 0,
    blockers: ['physical-overflow'],
    weightPct: 72,
    volumePct: 93,
  },
  finance: {
    purchaseTotal: 5000,
    purchasePaid: 5000,
    salesTotalUsd: 1200,
    receivedUsd: 0,
    exchangeRate: 6.64,
  },
};

describe('TradeWorkflowBoard', () => {
  it('把阶段完整度、当前阻塞和唯一下一动作放在同一张专项单卡片', async () => {
    const user = userEvent.setup();
    render(<TradeWorkflowBoard workflows={[workflow]} />);

    expect(screen.getByRole('heading', { name: '出口专项单主线路' })).toBeInTheDocument();
    expect(screen.getByText('EXP260008')).toBeInTheDocument();
    expect(screen.getByText('3/8 阶段')).toBeInTheDocument();
    expect(screen.getByText('3D 排柜仍有 8 箱无法装入')).toBeInTheDocument();
    expect(screen.getByText('仍有 8 箱无法装入')).toBeInTheDocument();
    expect(screen.getAllByText('已完成', { selector: '[data-stage-status="completed"]' })).toHaveLength(3);
    expect(screen.getByText('阻塞', { selector: '[data-stage-status="blocked"]' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'EXP260008 下一步：调整排柜' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/sales/sc-1');
  });

  it('风险长文本局部允许折行，不继承短状态徽标的不换行约束', () => {
    render(<TradeWorkflowBoard workflows={[{ ...workflow, issues: ['长风险说明'.repeat(40)] }]} scope="risk" />);
    const risk = screen.getByText('长风险说明'.repeat(40));
    expect(risk).toHaveClass('whitespace-normal', 'max-w-full', 'min-w-0');
    expect(screen.getByText(/全量主线路中按阻塞和风险优先的6笔/)).toBeInTheDocument();
  });

  it('无专项单时给出创建出口专项单的明确入口', async () => {
    const user = userEvent.setup();
    render(<TradeWorkflowBoard workflows={[]} />);

    expect(screen.getByText('暂无出口专项单')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新建出口专项单' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard/sales/create');
  });
});
