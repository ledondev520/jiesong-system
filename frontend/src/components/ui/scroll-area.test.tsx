import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScrollArea } from './scroll-area';

describe('scroll-area', () => {
  it('应该渲染子元素', () => {
    render(<ScrollArea data-testid="scroll-area">滚动内容</ScrollArea>);
    expect(screen.getByText('滚动内容')).toBeInTheDocument();
  });

  it('应该应用默认样式', () => {
    render(<ScrollArea data-testid="scroll-area">内容</ScrollArea>);
    expect(screen.getByTestId('scroll-area')).toHaveClass('overflow-auto');
  });

  it('应该支持自定义 className', () => {
    render(<ScrollArea className="custom-class" data-testid="scroll-area">内容</ScrollArea>);
    expect(screen.getByTestId('scroll-area')).toHaveClass('custom-class');
  });
});
