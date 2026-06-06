/**
 * Input: ProductDialog、hsCodeService、用户交互
 * Output: 商品弹窗 HSCode 智能匹配测试
 * Pos: 前端组件测试
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ProductDialog } from './ProductDialog';

const mockSearch = vi.fn();
const mockGetByCode = vi.fn();

vi.mock('@/services/hsCode.service', () => ({
  hsCodeService: {
    search: (...args: unknown[]) => mockSearch(...args),
    searchByProductName: (...args: unknown[]) => mockSearch(...args),
    getByCode: (...args: unknown[]) => mockGetByCode(...args),
    searchByHsCode: (...args: unknown[]) => mockGetByCode(...args),
  },
}));

describe('ProductDialog', () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockGetByCode.mockReset();
  });

  it('商品名称匹配后可选择推荐 HSCode 并显示税率', async () => {
    mockSearch.mockResolvedValue({
      data: [
        {
          id: 'hs-1',
          hsCode: '69072190',
          productName: '釉面砖',
          taxRate: 13,
          unit: '平方米',
          note: 'seed',
          effectiveDate: '2026-03-08T00:00:00.000Z',
        },
      ],
    });
    mockGetByCode.mockResolvedValue({
      data: {
        id: 'hs-1',
        hsCode: '69072190',
        productName: '釉面砖',
        taxRate: 13,
        unit: '平方米',
        note: 'seed',
        effectiveDate: '2026-03-08T00:00:00.000Z',
      },
    });

    const user = userEvent.setup();

    render(
      <ProductDialog
        open
        onOpenChange={vi.fn()}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await user.type(screen.getByLabelText('报关名称 *'), '瓷砖');
    await user.click(screen.getByRole('button', { name: 'HSCode 智能匹配' }));

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledWith('瓷砖');
    });

    await screen.findByText('69072190', {}, { timeout: 5000 });
    const recommendationButton = screen.getByRole('button', { name: /釉面砖/ });
    fireEvent.click(recommendationButton);

    await waitFor(() => {
      expect(mockGetByCode).toHaveBeenCalledWith('69072190');
      expect(screen.getByLabelText('HS编码')).toHaveValue('69072190');
      expect(screen.getByLabelText('税率(%)')).toHaveValue('13%');
    }, { timeout: 5000 });
  });
});
