import { expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InventoryTab } from './InventoryTab';

const getAll = vi.fn(async (_params: unknown) => ({ data: { items: [], pagination: { total: 302, totalPages: 16 } } }));
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
