import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from './checkbox';

describe('checkbox', () => {
  it('应该渲染 Checkbox 组件', () => {
    render(<Checkbox data-testid="checkbox" />);
    expect(screen.getByTestId('checkbox')).toBeInTheDocument();
  });

  it('应该应用默认样式', () => {
    render(<Checkbox data-testid="checkbox" />);
    const checkbox = screen.getByTestId('checkbox');
    expect(checkbox).toHaveClass('peer', 'size-4', 'shrink-0', 'rounded-sm', 'border');
  });

  it('应该支持自定义 className', () => {
    render(<Checkbox className="custom-class" data-testid="checkbox" />);
    expect(screen.getByTestId('checkbox')).toHaveClass('custom-class');
  });

  it('应该支持 disabled 状态', () => {
    render(<Checkbox disabled data-testid="checkbox" />);
    expect(screen.getByTestId('checkbox')).toBeDisabled();
  });

  it('应该支持 checked 状态', () => {
    render(<Checkbox checked data-testid="checkbox" />);
    expect(screen.getByTestId('checkbox')).toHaveAttribute('data-state', 'checked');
  });

  it('应该支持 unchecked 状态', () => {
    render(<Checkbox data-testid="checkbox" />);
    expect(screen.getByTestId('checkbox')).toHaveAttribute('data-state', 'unchecked');
  });
});
