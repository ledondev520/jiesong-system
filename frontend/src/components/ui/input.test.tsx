import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from './input';

describe('input', () => {
  it('应该渲染 Input 组件', () => {
    render(<Input placeholder="请输入" />);
    expect(screen.getByPlaceholderText('请输入')).toBeInTheDocument();
  });

  it('应该应用默认样式', () => {
    render(<Input data-testid="input" />);
    const input = screen.getByTestId('input');
    expect(input).toHaveClass('flex', 'h-9', 'w-full', 'min-w-0', 'rounded-md', 'border');
  });

  it('应该支持自定义 className', () => {
    render(<Input className="custom-class" data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveClass('custom-class');
  });

  it('应该支持 type 属性', () => {
    render(<Input type="password" data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveAttribute('type', 'password');
  });

  it('应该支持 disabled 状态', () => {
    render(<Input disabled data-testid="input" />);
    expect(screen.getByTestId('input')).toBeDisabled();
  });

  it('应该响应输入事件', async () => {
    const user = userEvent.setup();
    render(<Input data-testid="input" />);

    const input = screen.getByTestId('input');
    await user.type(input, 'hello');

    expect(input).toHaveValue('hello');
  });

  it('应该自动分配 id', () => {
    render(<Input data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveAttribute('id');
  });

  it('应该支持自定义 id', () => {
    render(<Input id="custom-id" data-testid="input" />);
    expect(screen.getByTestId('input')).toHaveAttribute('id', 'custom-id');
  });
});
