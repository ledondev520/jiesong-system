import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryStatus, type Inventory } from '@/types';
import { InventoryTab } from './InventoryTab';

const getAll = vi.fn(async (_params: unknown) => ({ data: { items: [] as Inventory[], pagination: { total: 302, totalPages: 16 } } }));
vi.mock('@/services/inventory.service', () => ({ inventoryService: { getAll: (...args: unknown[]) => getAll(args[0]) } }));
vi.mock('@/lib/api-cache', () => ({ cachedFetch: (_key: string, fetcher: () => unknown) => fetcher(), invalidateCache: vi.fn() }));

it('库存后端总数与实际页码一致，第二页继续请求服务端', async () => {
  const user = userEvent.setup();
  render(<InventoryTab />);
  expect(await screen.findByText(/共 302 条/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '下一页' }));
  await waitFor(() => expect(getAll).toHaveBeenLastCalledWith({ page: 2, pageSize: 20, keyword: undefined }));
  expect(screen.getByText(/第 2\/16 页/)).toBeInTheDocument();
});

it('采购来源库存不再要求手工设置入库/出库', async () => {
  getAll.mockResolvedValueOnce({ data: { items: [{ id: 'synthetic-stock', productId: 'synthetic-product', purchaseItemId: 'synthetic-purchase', quantity: 10, status: InventoryStatus.INBOUND, createdAt: '2026-10-01', updatedAt: '2026-10-01' }], pagination: { total: 1, totalPages: 1 } } });
  render(<InventoryTab />);
  expect(await screen.findByText('自动流转')).toBeInTheDocument();
  expect(screen.queryByText('批量设为已入库')).not.toBeInTheDocument();
  expect(screen.queryByText('批量设为已出库')).not.toBeInTheDocument();
  expect(screen.getAllByRole('checkbox', { name: /选择库存/ }).every(e => e.getAttribute('data-disabled') !== null)).toBe(true);
});
