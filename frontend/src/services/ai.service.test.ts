/**
 * Input: AI 服务与 API 实例
 * Output: AI 服务单元测试
 * Pos: 前端服务测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { aiService } from './ai.service';

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

describe('aiService', () => {
  it('getSessions: 拉取会话列表', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await aiService.getSessions();

    expect(api.get).toHaveBeenCalledWith('/ai/sessions');
  });

  it('deleteSession: 删除指定会话', async () => {
    (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await aiService.deleteSession('session_1');

    expect(api.delete).toHaveBeenCalledWith('/ai/sessions/session_1');
  });

  it('getTokenStats: 传递统计天数参数', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await aiService.getTokenStats(7);

    expect(api.get).toHaveBeenCalledWith('/ai/token-stats', { params: { days: 7 } });
  });

  it('getModels: 拉取模型列表', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await aiService.getModels();

    expect(api.get).toHaveBeenCalledWith('/ai/models');
  });
});

