/**
 * Input: AmountText组件
 * Output: 金额语义文本测试
 * Pos: 前端UI组件测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { AmountText } from './amount-text';

describe('AmountText', () => {
  it('支持warning语义', () => {
    const { getByText } = render(<AmountText tone="warning">¥100</AmountText>);
    const amount = getByText('¥100');
    expect(amount.className).toContain('text-amber-600');
  });

  it('支持xl尺寸', () => {
    const { getByText } = render(<AmountText size="xl">$300</AmountText>);
    const amount = getByText('$300');
    expect(amount.className).toContain('text-2xl');
  });
});
