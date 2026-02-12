/**
 * Input: PageHeader组件、Next Router
 * Output: 页面头部交互测试
 * Pos: 前端布局组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { PageHeader } from './PageHeader';

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
  }),
}));

describe('PageHeader', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockBack.mockClear();
  });

  it('点击返回时，优先走backHref', () => {
    const { getByRole } = render(
      <PageHeader title="测试页面" backHref="/dashboard" />,
    );
    fireEvent.click(getByRole('button', { name: '返回' }));
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('未传backHref时调用router.back', () => {
    const { getByRole } = render(<PageHeader title="测试页面" />);
    fireEvent.click(getByRole('button', { name: '返回' }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

