/**
 * Input: PayablePage 旧路由
 * Output: 验证旧应付入口回跳到收付管理应付视图
 * Pos: 财务模块旧独立页兼容测试
 *
 * Note: 财务顶层 Interface 只保留概览、报表、收付管理。
 */

import { describe, expect, it, vi } from 'vitest';
import PayablePage from './page';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (href: string) => mockRedirect(href),
}));

describe('PayablePage', () => {
  it('重定向到收付管理应付视图', () => {
    PayablePage();

    expect(mockRedirect).toHaveBeenCalledWith('/dashboard/payments?tab=payable');
  });
});
