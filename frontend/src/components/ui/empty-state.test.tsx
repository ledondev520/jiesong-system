import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './empty-state';
import { FileX } from 'lucide-react';

describe('empty-state', () => {
  it('应该渲染标题', () => {
    render(<EmptyState title="暂无数据" />);
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('应该渲染描述', () => {
    render(<EmptyState title="暂无数据" description="请添加数据后重试" />);
    expect(screen.getByText('请添加数据后重试')).toBeInTheDocument();
  });

  it('应该渲染图标', () => {
    const { container } = render(<EmptyState title="暂无数据" icon={FileX} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('应该渲染操作按钮', () => {
    render(<EmptyState title="暂无数据" action={<button>新建</button>} />);
    expect(screen.getByRole('button', { name: '新建' })).toBeInTheDocument();
  });

  it('应该支持自定义 className', () => {
    const { container } = render(<EmptyState title="测试" className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
