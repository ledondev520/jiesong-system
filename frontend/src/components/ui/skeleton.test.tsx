import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from './skeleton';

describe('skeleton', () => {
  it('应该渲染 Skeleton 组件', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('应该应用默认样式', () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass('animate-pulse', 'rounded-md', 'bg-gray-200');
  });

  it('应该支持自定义 className', () => {
    const { container } = render(<Skeleton className="custom-class w-20 h-20" />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass('custom-class', 'w-20', 'h-20');
  });

  it('应该渲染为 div 元素', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild?.nodeName).toBe('DIV');
  });
});
