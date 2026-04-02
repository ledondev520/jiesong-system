import { render, screen } from '@testing-library/react';
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
});
