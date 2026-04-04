import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from './switch';

describe('switch', () => {
  it('应该渲染 Switch 组件', () => {
    render(<Switch data-testid="switch" />);
    expect(screen.getByTestId('switch')).toBeInTheDocument();
  });

  it('应该应用默认样式', () => {
    render(<Switch data-testid="switch" />);
    const switchEl = screen.getByTestId('switch');
    expect(switchEl).toHaveClass('peer', 'inline-flex', 'h-[1.15rem]', 'w-8', 'shrink-0', 'items-center', 'rounded-full');
  });

  it('应该支持自定义 className', () => {
    render(<Switch className="custom-class" data-testid="switch" />);
    expect(screen.getByTestId('switch')).toHaveClass('custom-class');
  });

  it('应该支持 disabled 状态', () => {
    render(<Switch disabled data-testid="switch" />);
    expect(screen.getByTestId('switch')).toBeDisabled();
  });

  it('应该支持 checked 状态', () => {
    render(<Switch checked data-testid="switch" />);
    expect(screen.getByTestId('switch')).toHaveAttribute('data-state', 'checked');
  });

  it('应该支持 unchecked 状态', () => {
    render(<Switch data-testid="switch" />);
    expect(screen.getByTestId('switch')).toHaveAttribute('data-state', 'unchecked');
  });
});
