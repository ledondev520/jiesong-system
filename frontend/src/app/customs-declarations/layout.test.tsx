/**
 * Input: 报关单路由布局、DashboardLayout
 * Output: 报关单路由布局包装测试
 * Pos: 报关单管理布局测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CustomsDeclarationsLayout from './layout';

vi.mock('@/app/dashboard/layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dashboard-layout">{children}</div>
  ),
}));

describe('CustomsDeclarationsLayout', () => {
  it('复用 dashboard 布局包裹子页面', () => {
    render(
      <CustomsDeclarationsLayout>
        <div>报关单内容</div>
      </CustomsDeclarationsLayout>,
    );

    expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument();
    expect(screen.getByText('报关单内容')).toBeInTheDocument();
  });
});
