import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageSizeSelect } from './page-size-select';

// Mock Select 组件
vi.mock('@/components/ui/select', () => ({
  Select: (props: { children: React.ReactNode; value?: string; onValueChange?: (value: string) => void }) => (
    <select
      data-testid="page-size-select"
      value={props.value}
      onChange={(e) => props.onValueChange?.(e.target.value)}
    >
      {props.children}
    </select>
  ),
  SelectContent: (props: { children: React.ReactNode }) => <>{props.children}</>,
  SelectItem: (props: { value: string; children: React.ReactNode }) => <option value={props.value}>{props.children}</option>,
  SelectTrigger: (props: { children: React.ReactNode }) => <>{props.children}</>,
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
