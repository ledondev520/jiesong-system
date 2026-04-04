import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from './label';

describe('label', () => {
  it('应该渲染 Label 组件', () => {
    render(<Label>标签文本</Label>);
    expect(screen.getByText('标签文本')).toBeInTheDocument();
  });

  it('应该应用默认样式', () => {
    render(<Label data-testid="label">标签</Label>);
    const label = screen.getByTestId('label');
    expect(label).toHaveClass('flex', 'items-center', 'gap-2', 'text-sm', 'font-medium');
  });

  it('应该支持自定义 className', () => {
    render(<Label className="custom-class" data-testid="label">标签</Label>);
    expect(screen.getByTestId('label')).toHaveClass('custom-class');
  });

  it('应该渲染为 label 元素', () => {
    render(<Label data-testid="label">标签</Label>);
    expect(screen.getByTestId('label').tagName).toBe('LABEL');
  });

  it('应该支持 htmlFor 属性', () => {
    render(<Label htmlFor="input-id" data-testid="label">关联标签</Label>);
    expect(screen.getByTestId('label')).toHaveAttribute('for', 'input-id');
  });
});
