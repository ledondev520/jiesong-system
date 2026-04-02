/**
 * Input: PurchasePage（兼容重定向页）
 * Output: 验证页面已重定向到采购合同列表
 * Pos: 采购模块兼容入口测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi } from 'vitest';
import PurchasePage from './page';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe('PurchasePage 重定向', () => {
  it('访问 /dashboard/purchase 时跳转到采购合同列表', () => {
    try {
      PurchasePage();
    } catch {
      // next redirect throws by design
    }

    expect(mockRedirect).toHaveBeenCalledWith('/dashboard/contracts');
  });
});
