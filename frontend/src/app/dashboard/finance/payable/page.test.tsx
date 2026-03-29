/**
 * Input: PayablePage（重定向页）
 * Output: 验证页面已重定向至 /dashboard/payments
 * Pos: 财务模块应付账款兼容重定向测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it, vi } from 'vitest';
import PayablePage from './page';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe('PayablePage 重定向', () => {
  it('应付账款页已合并进收付款，调用 redirect 跳转', () => {
    try {
      PayablePage();
    } catch {
      // next/navigation redirect 通过 throw 实现，测试中捕获即可
    }
    expect(mockRedirect).toHaveBeenCalledWith('/dashboard/payments');
  });
});
