import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Progress } from './progress';

describe('progress', () => {
  it('应该渲染 Progress 组件', () => {
    render(<Progress value={50} data-testid="progress" />);
    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('应该应用默认样式', () => {
    render(<Progress value={50} data-testid="progress" />);
    const progress = screen.getByTestId('progress');
    expect(progress).toHaveClass('relative', 'h-2', 'w-full', 'overflow-hidden', 'rounded-full');
  });

  it('应该支持自定义 className', () => {
    render(<Progress value={50} className="custom-class" data-testid="progress" />);
    expect(screen.getByTestId('progress')).toHaveClass('custom-class');
  });

  it('应该根据 value 显示进度', () => {
    render(<Progress value={75} data-testid="progress" />);
    expect(screen.getByTestId('progress')).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByTestId('progress')).toHaveAttribute('data-state', 'loading');
  });

  it('应该支持 value 为 0', () => {
    render(<Progress value={0} data-testid="progress" />);
    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('应该支持 value 为 100', () => {
    render(<Progress value={100} data-testid="progress" />);
    expect(screen.getByTestId('progress')).toBeInTheDocument();
  });

  it('应该支持 ref 转发', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<Progress ref={(el) => { ref.current = el; }} value={50} data-testid="progress" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
