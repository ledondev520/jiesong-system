/**
 * Input: SemanticBadge组件
 * Output: 语义徽章渲染测试
 * Pos: 前端UI组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SemanticBadge } from './semantic-badge';

describe('SemanticBadge', () => {
  it('默认语义为neutral', () => {
    const { getByText } = render(<SemanticBadge>草稿</SemanticBadge>);
    const badge = getByText('草稿');
    expect(badge.className).toContain('bg-muted');
    expect(badge.className).toContain('text-muted-foreground');
  });

  it('warning语义会使用amber语义色系', () => {
    const { getByText } = render(<SemanticBadge tone="warning">生产中</SemanticBadge>);
    const badge = getByText('生产中');
    expect(badge.className).toContain('text-amber-800');
    expect(badge.className).toContain('border-amber-300');
  });
});
