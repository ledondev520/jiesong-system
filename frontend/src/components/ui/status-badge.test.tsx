import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge, getStatusBadgeConfig, registerStatusBadgeMap } from './status-badge';

describe('status-badge', () => {
  it('内置状态映射为统一文案和语义色', () => {
    expect(getStatusBadgeConfig(' shipped ')).toEqual({
      label: '已发运',
      tone: 'progress',
    });
  });

  it('自定义映射优先于默认映射', () => {
    const custom = registerStatusBadgeMap({
      DRAFT: { label: '草稿(自定义)', tone: 'success' },
    });
    expect(getStatusBadgeConfig('draft', custom)).toEqual({
      label: '草稿(自定义)',
      tone: 'success',
    });
  });

  it('未知状态回退显示原始文本', () => {
    render(<StatusBadge status="UNKNOWN_STATUS" />);
    const badge = screen.getByText('UNKNOWN_STATUS');
    expect(badge.className).toContain('bg-muted');
  });

  it('PACKING 显示装箱中文案', () => {
    render(<StatusBadge status="PACKING" />);
    expect(screen.getByText('装箱中')).toBeInTheDocument();
  });
});
