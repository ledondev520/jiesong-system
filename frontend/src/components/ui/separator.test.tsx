import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Separator } from './separator';

describe('separator', () => {
  it('应该渲染水平分割线', () => {
    render(<Separator data-testid="separator" />);
    expect(screen.getByTestId('separator')).toBeInTheDocument();
  });

  it('应该应用水平分割线样式', () => {
    render(<Separator data-testid="separator" />);
    const separator = screen.getByTestId('separator');
    expect(separator).toHaveClass('shrink-0', 'bg-border', 'h-[1px]', 'w-full');
  });

  it('应该应用垂直分割线样式', () => {
    render(<Separator orientation="vertical" data-testid="separator" />);
    const separator = screen.getByTestId('separator');
    expect(separator).toHaveClass('h-full', 'w-[1px]');
  });

  it('应该支持自定义 className', () => {
    render(<Separator className="custom-class" data-testid="separator" />);
    expect(screen.getByTestId('separator')).toHaveClass('custom-class');
  });

  it('默认应该是 decorative', () => {
    const { container } = render(<Separator />);
    const separator = container.querySelector('[data-orientation="horizontal"]');
    expect(separator).toHaveAttribute('data-orientation', 'horizontal');
  });
});
