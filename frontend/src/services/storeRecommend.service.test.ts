/**
 * Store Recommend Service 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storeRecommendService } from './storeRecommend.service';
import api from '@/lib/axios';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('storeRecommendService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该获取门店统计', async () => {
    const mockResponse = { code: 200, data: [] };
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockResponse });

    await storeRecommendService.getStoreStats();

    expect(api.get).toHaveBeenCalledWith('/store-recommend/stats');
  });

  it('应该生成推荐', async () => {
    const mockResponse = { code: 200, data: { recommendations: [], totalProducts: 10 } };
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse);

    const result = await storeRecommendService.generateRecommendations({ targetStoreName: '门店A' });

    expect(api.post).toHaveBeenCalledWith('/store-recommend/recommend', { targetStoreName: '门店A' });
    expect(result.data.totalProducts).toBe(10);
  });
});
