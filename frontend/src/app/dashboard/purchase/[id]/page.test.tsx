/**
 * Input: 旧 /dashboard/purchase/[id] 路由
 * Output: 验证重定向到 /dashboard/purchases/[id]
 * Pos: 前端路由兼容测试
 */

import { describe, expect, it, vi } from 'vitest';
import PurchaseDetailRedirectPage from './page';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe('PurchaseDetailRedirectPage', () => {
  it('旧详情路由跳转到新详情页', async () => {
    await PurchaseDetailRedirectPage({ params: Promise.resolve({ id: 'pc-001' }) });
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard/purchases/pc-001');
  });
});
