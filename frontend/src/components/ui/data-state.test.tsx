import { render, screen } from '@testing-library/react';
import { AlertTriangle, Inbox } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { Table, TableBody } from '@/components/ui/table';
import { ErrorState, LoadingState, TableStateRow } from './data-state';

describe('data-state', () => {
  it('renders loading state with default copy', () => {
    render(<LoadingState />);

    expect(screen.getByText('加载中...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders error state with action', () => {
    render(
      <ErrorState
        icon={AlertTriangle}
        title="数据加载失败"
        description="请检查网络连接后重试。"
        action={<button type="button">重试</button>}
      />,
    );

    expect(screen.getByText('数据加载失败')).toBeInTheDocument();
    expect(screen.getByText('请检查网络连接后重试。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument();
  });

  it('renders empty table row with shared empty state', () => {
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
});
