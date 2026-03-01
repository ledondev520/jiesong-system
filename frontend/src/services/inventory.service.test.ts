/**
 * Input: 库存服务与API实例
 * Output: 库存服务接口单元测试
 * Pos: 前端业务服务测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { inventoryService } from './inventory.service';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('inventoryService', () => {
  it('getAll: 透传查询参数', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await inventoryService.getAll({ page: 2, pageSize: 50, keyword: '门' });

    expect(api.get).toHaveBeenCalledWith('/inventory', {
      params: { page: 2, pageSize: 50, keyword: '门' },
    });
  });

  it('updateStatus: 通过单条接口更新状态', async () => {
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await inventoryService.updateStatus('inv-1', 'OUTBOUND');

    expect(api.put).toHaveBeenCalledWith('/inventory/inv-1/status', { status: 'OUTBOUND' });
  });

  it('batchUpdateStatus: 通过批量接口更新状态', async () => {
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await inventoryService.batchUpdateStatus(['inv-1', 'inv-2'], 'INBOUND');

    expect(api.put).toHaveBeenCalledWith('/inventory/batch-status', {
      ids: ['inv-1', 'inv-2'],
      status: 'INBOUND',
    });
  });
});
