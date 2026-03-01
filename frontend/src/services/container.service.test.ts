/**
 * Input: 货柜服务与API实例
 * Output: 货柜服务接口单元测试
 * Pos: 前端业务服务测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { containerService } from './container.service';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('containerService', () => {
  it('getAll/getById: 调用正确查询接口', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await containerService.getAll({ page: 1, pageSize: 20, query: 'CT' });
    await containerService.getById('ct-1');

    expect(api.get).toHaveBeenCalledWith('/containers', {
      params: { page: 1, pageSize: 20, query: 'CT' },
    });
    expect(api.get).toHaveBeenCalledWith('/containers/ct-1');
  });

  it('create/update/delete: 调用正确端点', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    const payload = { containerNo: 'C2026030001' };
    await containerService.create(payload);
    await containerService.update('ct-1', payload);
    await containerService.delete('ct-1');

    expect(api.post).toHaveBeenCalledWith('/containers', payload);
    expect(api.put).toHaveBeenCalledWith('/containers/ct-1', payload);
    expect(api.delete).toHaveBeenCalledWith('/containers/ct-1');
  });

  it('updateStatus/addItem/updateItem/removeItem: 调用明细与状态接口', async () => {
    (api.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await containerService.updateStatus('ct-1', 'SHIPPED');
    await containerService.addItem('ct-1', { quantity: 5 });
    await containerService.updateItem('ct-1', 'item-1', { quantity: 8 });
    await containerService.removeItem('ct-1', 'item-1');

    expect(api.put).toHaveBeenCalledWith('/containers/ct-1/status', { status: 'SHIPPED' });
    expect(api.post).toHaveBeenCalledWith('/containers/ct-1/items', { quantity: 5 });
    expect(api.put).toHaveBeenCalledWith('/containers/ct-1/items/item-1', { quantity: 8 });
    expect(api.delete).toHaveBeenCalledWith('/containers/ct-1/items/item-1');
  });
});
