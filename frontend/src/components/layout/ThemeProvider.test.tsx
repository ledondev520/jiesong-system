/**
 * Input: ThemeProvider 组件
 * Output: 主题提供器参数透传测试
 * Pos: 前端布局组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from './ThemeProvider';

vi.mock('next-themes', () => ({
  ThemeProvider: ({
    children,
    attribute,
    defaultTheme,
    enableSystem,
    disableTransitionOnChange,
  }: {
    children: ReactNode;
    attribute: string;
    defaultTheme: string;
    enableSystem: boolean;
    disableTransitionOnChange: boolean;
  }) => (
    <div
      data-testid="next-theme-provider"
      data-attribute={attribute}
      data-default-theme={defaultTheme}
      data-enable-system={String(enableSystem)}
      data-disable-transition-on-change={String(disableTransitionOnChange)}
    >
      {children}
    </div>
  ),
}));

describe('ThemeProvider', () => {
  it('使用约定的主题配置并渲染子节点', () => {
    render(
      <ThemeProvider>
        <span>child</span>
      </ThemeProvider>,
    );

    const provider = screen.getByTestId('next-theme-provider');
    expect(provider).toHaveAttribute('data-attribute', 'class');
    expect(provider).toHaveAttribute('data-default-theme', 'system');
    expect(provider).toHaveAttribute('data-enable-system', 'true');
    expect(provider).toHaveAttribute('data-disable-transition-on-change', 'true');
    expect(screen.getByText('child')).toBeInTheDocument();
  });
});
