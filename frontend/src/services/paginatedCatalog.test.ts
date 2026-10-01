import { expect, it, vi } from 'vitest';
import { loadPaginatedCatalog } from './paginatedCatalog';

it('完整目录读到最后一页，任一页失败不会冒充完整目录', async () => {
  const fetchPage = vi.fn(async (page: number) => ({ code: 200, message: '', data: { items: [`item-${page}`], pagination: { page, pageSize: 100, total: 206, totalPages: 3 } } }));
  expect(await loadPaginatedCatalog(fetchPage)).toEqual(['item-1', 'item-2', 'item-3']);
  expect(fetchPage.mock.calls.map(([page]) => page)).toEqual([1, 2, 3]);
  fetchPage.mockImplementation(async () => { throw new Error('offline'); });
  await expect(loadPaginatedCatalog(fetchPage)).rejects.toThrow('offline');
});
