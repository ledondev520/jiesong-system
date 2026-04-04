/**
 * Procurement Template Service 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { procurementTemplateService } from './procurementTemplate.service';
import api from '@/lib/axios';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('procurementTemplateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该获取门店列表', async () => {
    const mockResponse = { code: 200, data: ['门店A', '门店B'] };
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockResponse });

    const result = await procurementTemplateService.getStoreList();

    expect(api.get).toHaveBeenCalledWith('/procurement-template/stores');
    expect(result.data).toEqual(mockResponse);
  });

  it('应该获取通用模板', async () => {
    const mockResponse = { code: 200, data: { totalStores: 10, items: [] } };
    vi.mocked(api.get).mockResolvedValueOnce(mockResponse);

    const result = await procurementTemplateService.getUniversalTemplate();

    expect(api.get).toHaveBeenCalledWith('/procurement-template/universal');
    expect(result.data.totalStores).toBe(10);
  });

  it('应该获取门店模板', async () => {
    const mockResponse = { code: 200, data: { storeName: '门店A', items: [] } };
    vi.mocked(api.get).mockResolvedValueOnce(mockResponse);

    const result = await procurementTemplateService.getStoreTemplate('门店A');

    expect(api.get).toHaveBeenCalledWith('/procurement-template/stores/%E9%97%A8%E5%BA%97A');
    expect(result.data.storeName).toBe('门店A');
  });
});
