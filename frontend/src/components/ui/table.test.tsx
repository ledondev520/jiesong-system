import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './table';

describe('table', () => {
  it('应该渲染 Table 组件', () => {
    render(
      <Table data-testid="table">
        <TableBody>
          <TableRow>
            <TableCell>单元格</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByTestId('table')).toBeInTheDocument();
    expect(screen.getByText('单元格')).toBeInTheDocument();
  });

  it('应该渲染完整的表格结构', () => {
    render(
      <Table data-testid="table">
        <TableCaption>表格标题</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>表头1</TableHead>
            <TableHead>表头2</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>数据1</TableCell>
            <TableCell>数据2</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>页脚</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    );

    expect(screen.getByText('表格标题')).toBeInTheDocument();
    expect(screen.getByText('表头1')).toBeInTheDocument();
    expect(screen.getByText('数据1')).toBeInTheDocument();
    expect(screen.getByText('页脚')).toBeInTheDocument();
  });

  it('应该支持自定义 className', () => {
    render(
      <Table className="custom-class" data-testid="table">
        <TableBody />
      </Table>
    );
    expect(screen.getByTestId('table')).toHaveClass('custom-class');
  });

  it('TableRow 应该支持 selected 状态', () => {
    render(
      <Table data-testid="table">
        <TableBody>
          <TableRow data-state="selected" data-testid="row">
            <TableCell>选中行</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    );
    expect(screen.getByTestId('row')).toHaveAttribute('data-state', 'selected');
  });
});
