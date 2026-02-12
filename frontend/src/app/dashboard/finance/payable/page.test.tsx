/**
 * Input: 应付账款页面、finance API、PaymentDialog、toast
 * Output: 应付账款页交互逻辑测试结果
 * Pos: 前端财务子页交互测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PayablePage from './page';

const mockApiGet = vi.fn();
const mockToastError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('@/lib/axios', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

vi.mock('../components/PaymentDialog', () => ({
  PaymentDialog: () => <div>付款弹窗</div>,
}));

describe('PayablePage 交互逻辑', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    mockToastError.mockReset();
  });

  it('无数据时展示空态', async () => {
    mockApiGet.mockResolvedValue({ data: { items: [] } });
    render(<PayablePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '应付账款' })).toBeInTheDocument();
      expect(screen.getByText('暂无待付账款')).toBeInTheDocument();
    });
  });

  it('点击刷新会再次请求数据', async () => {
    mockApiGet.mockResolvedValue({ data: { items: [] } });
    const user = userEvent.setup();
    render(<PayablePage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: '刷新' }));
    await waitFor(() => {
      expect(mockApiGet.mock.calls.length).toBeGreaterThan(1);
    });
  });
});

