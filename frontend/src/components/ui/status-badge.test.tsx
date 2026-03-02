/**
 * Input: StatusBadge 组件与映射工具
 * Output: 状态映射与覆盖逻辑测试
 * Pos: 前端UI组件测试
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  StatusBadge,
  getStatusBadgeConfig,
  registerStatusBadgeMap,
} from './status-badge';

describe('status-badge', () => {
  it('getStatusBadgeConfig: 内置状态可映射为统一文案与语义色', () => {
    const config = getStatusBadgeConfig(' shipped ');
    expect(config).toEqual({
      label: '已发运',
      tone: 'progress',
    });
  });

  it('getStatusBadgeConfig: 自定义映射优先级高于默认映射', () => {
    const custom = registerStatusBadgeMap({
      DRAFT: { label: '草稿(自定义)', tone: 'success' },
    });

    const config = getStatusBadgeConfig('draft', custom);
    expect(config).toEqual({
      label: '草稿(自定义)',
      tone: 'success',
    });
  });

  it('StatusBadge: 未知状态回退显示原始文本并使用 neutral', () => {
    render(<StatusBadge status="UNKNOWN_STATUS" />);
    const badge = screen.getByText('UNKNOWN_STATUS');
    expect(badge.className).toContain('bg-muted');
    expect(badge.className).toContain('text-muted-foreground');
  });

  it('StatusBadge: 默认映射 PACKING 展示装箱中文案', () => {
    render(<StatusBadge status="PACKING" />);
    expect(screen.getByText('装箱中')).toBeInTheDocument();
  });
});
