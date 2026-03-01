/**
 * Input: ContractInfoEditor组件、合同数据、保存回调
 * Output: 合同信息编辑组件交互测试结果
 * Pos: 销售合同详情子组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContractInfoEditor } from './ContractInfoEditor';
import { SalesStatus, type SalesContract, type Store } from '@/types';

const baseContract: SalesContract = {
  id: 's-1',
  contractNo: 'EXP260001',
  status: SalesStatus.DRAFT,
  totalAmount: 123456,
  receivedAmount: 23456,
  exchangeRate: 7.2,
  totalBoxes: 0,
  grossWeight: 0,
  netWeight: 0,
  volume: 0,
  signedAt: '2026-02-01T00:00:00.000Z',
  estimatedArrival: '2026-03-01T00:00:00.000Z',
  portId: 'port-1',
  port: { id: 'port-1', name: 'Los Angeles' },
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
};

const stores: Store[] = [
  {
    id: 'store-1',
    name: '门店A',
    portId: 'port-1',
    isActive: true,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    port: { id: 'port-1', name: 'Los Angeles', code: 'LAX', isActive: true, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' },
  },
  {
    id: 'store-2',
    name: '门店B',
    portId: 'port-2',
    isActive: true,
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    port: { id: 'port-2', name: 'Long Beach', code: 'LGB', isActive: true, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' },
  },
];

describe('ContractInfoEditor', () => {
  it('默认展示合同关键信息与编辑按钮', () => {
    render(<ContractInfoEditor contract={baseContract} stores={stores} onSave={vi.fn()} />);

    expect(screen.getByText('合同信息')).toBeInTheDocument();
    expect(screen.getByText('EXP260001')).toBeInTheDocument();
    expect(screen.getByText('$123,456')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument();
  });

  it('编辑后保存会调用 onSave 并带上更新字段', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<ContractInfoEditor contract={baseContract} stores={stores} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: '编辑' }));
    const exchangeRateInput = screen.getByDisplayValue('7.2');
    const signedAtInput = screen.getByDisplayValue('2026-02-01');
    await user.clear(exchangeRateInput);
    await user.type(exchangeRateInput, '7.5');
    await user.clear(signedAtInput);
    await user.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        exchangeRate: 7.5,
        signedAt: undefined,
      }),
    );
  });

  it('点击取消不会触发 onSave', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<ContractInfoEditor contract={baseContract} stores={stores} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: '编辑' }));
    await user.click(screen.getByRole('button', { name: '取消' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument();
  });

  it('保存进行中展示加载态并禁用按钮', async () => {
    let resolveSave: (() => void) | null = null;
    const onSave = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const user = userEvent.setup();

    render(<ContractInfoEditor contract={baseContract} stores={stores} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: '编辑' }));
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();

    resolveSave?.();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument();
    });
  });

  it('contract 变更后会同步表单显示值', () => {
    const { rerender } = render(
      <ContractInfoEditor contract={baseContract} stores={stores} onSave={vi.fn()} />,
    );

    const nextContract: SalesContract = {
      ...baseContract,
      exchangeRate: 8.1,
      signedAt: '2026-04-10T00:00:00.000Z',
    };

    rerender(<ContractInfoEditor contract={nextContract} stores={stores} onSave={vi.fn()} />);
    expect(screen.getByText('8.1')).toBeInTheDocument();
    expect(screen.getByText('2026-04-10')).toBeInTheDocument();
  });
});
