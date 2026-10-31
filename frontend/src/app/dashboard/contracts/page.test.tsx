/**
 * Input: 旧 /dashboard/contracts 路由
 * Output: 验证重定向到 /dashboard/purchases
 * Pos: 前端路由兼容测试
 */

import { describe, expect, it, vi } from 'vitest';
import ContractsPage from './page';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe('ContractsPage 重定向', () => {
  it('旧采购合同列表路由跳转到 /dashboard/purchases', () => {
    ContractsPage();
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard/purchases');
  });
});
