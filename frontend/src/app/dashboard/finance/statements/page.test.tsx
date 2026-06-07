import { describe, expect, it, vi } from 'vitest';
import FinancialStatementsPage from './page';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (href: string) => mockRedirect(href),
}));

describe('FinancialStatementsPage 兼容路由', () => {
  it('跳转到财务总览报表分析锚点', () => {
    FinancialStatementsPage();

    expect(mockRedirect).toHaveBeenCalledWith('/dashboard/finance#financial-statements');
  });
});
