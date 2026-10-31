/**
 * Input: 旧 /dashboard/customs-declarations/[id] 路由与查询参数
 * Output: 验证重定向到 /dashboard/customs/[id] 并保留 returnTo 等查询
 * Pos: 前端路由兼容测试
 */

import { describe, expect, it, vi } from 'vitest';
import CustomsDeclarationDetailRedirectPage from './page';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe('CustomsDeclarationDetailRedirectPage', () => {
  it('跳转到新详情并保留查询参数', async () => {
    await CustomsDeclarationDetailRedirectPage({
      params: Promise.resolve({ id: 'cd-1' }),
      searchParams: Promise.resolve({ returnTo: '/dashboard/customs?view=customs' }),
    });
    expect(mockRedirect).toHaveBeenCalledWith(
      '/dashboard/customs/cd-1?returnTo=%2Fdashboard%2Fcustoms%3Fview%3Dcustoms',
    );
  });
});
