import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Textarea } from './textarea';

describe('textarea', () => {
  it('应该渲染 Textarea 组件', () => {
    render(<Textarea placeholder="请输入内容" />);
    expect(screen.getByPlaceholderText('请输入内容')).toBeInTheDocument();
  });

  it('应该应用默认样式', () => {
    render(<Textarea data-testid="textarea" />);
    const textarea = screen.getByTestId('textarea');
    expect(textarea).toHaveClass('min-h-16', 'w-full', 'rounded-md', 'border', 'bg-transparent');
  });

  it('应该支持自定义 className', () => {
    render(<Textarea className="custom-class" data-testid="textarea" />);
    expect(screen.getByTestId('textarea')).toHaveClass('custom-class');
  });

  it('应该支持 disabled 状态', () => {
    render(<Textarea disabled data-testid="textarea" />);
    expect(screen.getByTestId('textarea')).toBeDisabled();
  });

  it('应该响应输入事件', async () => {
    const user = userEvent.setup();
    render(<Textarea data-testid="textarea" />);

    const textarea = screen.getByTestId('textarea');
    await user.type(textarea, '多行\n文本');

    expect(textarea).toHaveValue('多行\n文本');
  });

  it('应该自动分配 id', () => {
    render(<Textarea data-testid="textarea" />);
    expect(screen.getByTestId('textarea')).toHaveAttribute('id');
  });

  it('应该支持自定义 id', () => {
    render(<Textarea id="custom-id" data-testid="textarea" />);
    expect(screen.getByTestId('textarea')).toHaveAttribute('id', 'custom-id');
  });

  it('应该支持 rows 属性', () => {
    render(<Textarea rows={5} data-testid="textarea" />);
    expect(screen.getByTestId('textarea')).toHaveAttribute('rows', '5');
  });
});
