import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageSizeSelect } from './page-size-select';

// Mock Select 组件
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <select
      data-testid="page-size-select"
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: () => null,
}));

describe('page-size-select', () => {
  it('应该渲染页码选择器', () => {
    render(<PageSizeSelect value={20} onChange={vi.fn()} />);
    expect(screen.getByTestId('page-size-select')).toBeInTheDocument();
  });

  it('应该显示正确的选项', () => {
    render(<PageSizeSelect value={20} onChange={vi.fn()} />);
    expect(screen.getByText('每页 20 条')).toBeInTheDocument();
    expect(screen.getByText('每页 50 条')).toBeInTheDocument();
    expect(screen.getByText('每页 100 条')).toBeInTheDocument();
  });

  it('应该支持自定义选项', () => {
    render(<PageSizeSelect value={10} onChange={vi.fn()} options={[10, 30, 50]} />);
    expect(screen.getByText('每页 10 条')).toBeInTheDocument();
    expect(screen.getByText('每页 30 条')).toBeInTheDocument();
    expect(screen.queryByText('每页 100 条')).not.toBeInTheDocument();
  });
});
