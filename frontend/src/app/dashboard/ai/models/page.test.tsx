/**
 * Input: 模型列表页面、aiService、toast
 * Output: 模型列表页面交互测试
 * Pos: 前端业务页测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import AiModelsPage from './page';

const mockGetModels = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/services/ai.service', () => ({
  aiService: {
    getModels: (...args: unknown[]) => mockGetModels(...args),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

describe('AiModelsPage', () => {
  beforeEach(() => {
    mockGetModels.mockReset();
    mockToastError.mockReset();
  });

  it('加载后展示模型列表', async () => {
    mockGetModels.mockResolvedValue({
      data: {
        models: {
          thinking: 'kimi-k2-thinking',
        },
        description: {
          thinking: '推理模型',
        },
      },
    });

    render(<AiModelsPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '模型列表' })).toBeInTheDocument();
      expect(screen.getByText('thinking')).toBeInTheDocument();
      expect(screen.getByText('kimi-k2-thinking')).toBeInTheDocument();
    });
  });

  it('加载失败时提示错误', async () => {
    mockGetModels.mockRejectedValue(new Error('failed'));

    render(<AiModelsPage />);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('加载模型列表失败');
    });
  });
});
