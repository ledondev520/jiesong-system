/**
 * Input: Badge组件
 * Output: Badge组件单元测试
 * Pos: 前端UI组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('渲染默认Badge', () => {
    const { getByText } = render(<Badge>正常</Badge>);

    expect(getByText('正常')).toBeTruthy();
  });

  it('支持variant属性', () => {
    const { getByText } = render(<Badge variant="destructive">告警</Badge>);
    const badge = getByText('告警');

    expect(badge.className.includes('bg-destructive')).toBe(true);
  });
});
