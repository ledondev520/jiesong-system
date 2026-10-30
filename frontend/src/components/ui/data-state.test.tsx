import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { AlertTriangle, Inbox } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { Table, TableBody } from '@/components/ui/table';
import { ErrorState, LoadingState, TableStateRow } from './data-state';

describe('data-state', () => {
  it('渲染 loading state', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('渲染 error state 与 action', () => {
    render(
      <ErrorState
        icon={AlertTriangle}
        title="数据加载失败"
        description="请检查网络连接后重试。"
        action={<button type="button">重试</button>}
      />,
    );

    expect(screen.getByText('数据加载失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('渲染 empty table row', () => {
    render(
      <Table>
        <TableBody>
          <TableStateRow
            colSpan={4}
            variant="empty"
            icon={Inbox}
            title="暂无记录"
            description="当前筛选条件下没有结果。"
          />
        </TableBody>
      </Table>,
    );

    expect(screen.getByText('暂无记录')).toBeInTheDocument();
    expect(screen.getByText('当前筛选条件下没有结果。')).toBeInTheDocument();
  });

  it('error state 显示「失败的事：服务端原因」并提供重试按钮', () => {
    const onRetry = vi.fn();
    render(<ErrorState what="加载港口失败" error={{ message: '数据库忙' }} onRetry={onRetry} />);

    expect(screen.getByText('加载港口失败：数据库忙')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('显式 action 优先于 onRetry；不传 onRetry 不渲染按钮', () => {
    const { rerender } = render(<ErrorState what="加载失败" error="x" />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<ErrorState what="加载失败" error="x" onRetry={() => {}} action={<button type="button">联系管理员</button>} />);
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull();
    expect(screen.getByRole('button', { name: '联系管理员' })).toBeInTheDocument();
  });

  it('table error row 透传 what/error/onRetry', () => {
    render(
      <Table>
        <TableBody>
          <TableStateRow colSpan={3} variant="error" what="加载港口失败" error={{ message: '超时' }} onRetry={() => {}} />
        </TableBody>
      </Table>,
    );
    expect(screen.getByText('加载港口失败：超时')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });
});
