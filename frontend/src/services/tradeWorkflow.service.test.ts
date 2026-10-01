/**
 * Input: 专项单主线路服务、HTTP Adapter
 * Output: 查询参数与响应契约测试
 * Pos: 工作台专项单主线路前端 Interface 测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { tradeWorkflowService } from './tradeWorkflow.service';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

describe('tradeWorkflowService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('按工作台展示上限查询专项单主线路', async () => {
    const response = { code: 200, message: 'ok', data: [] };
    vi.mocked(api.get).mockResolvedValue(response);

    await expect(tradeWorkflowService.list(6)).resolves.toEqual(response);

    expect(api.get).toHaveBeenCalledWith('/dashboard/trade-workflows', {
      params: { limit: 6, scope: 'recent' },
    });
  });
});
