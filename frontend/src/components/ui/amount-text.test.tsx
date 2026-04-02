import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AmountText } from './amount-text';

describe('AmountText', () => {
  it('支持 warning 语义', () => {
    render(<AmountText tone="warning">¥100</AmountText>);
    expect(screen.getByText('¥100').className).toContain('text-amber-600');
  });

  it('支持 xl 尺寸', () => {
    render(<AmountText size="xl">$300</AmountText>);
    expect(screen.getByText('$300').className).toContain('text-2xl');
  });
});
