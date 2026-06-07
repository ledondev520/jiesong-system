/**
 * Input: ReceivablePage 旧路由
 * Output: 验证旧应收入口回跳到收付管理应收视图
 * Pos: 财务模块旧独立页兼容测试
 *
 * Note: 财务顶层 Interface 只保留概览、报表、收付管理。
 */

import { describe, expect, it, vi } from 'vitest';
import ReceivablePage from './page';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (href: string) => mockRedirect(href),
}));

describe('ReceivablePage', () => {
  it('重定向到收付管理应收视图', () => {
    ReceivablePage();

    expect(mockRedirect).toHaveBeenCalledWith('/dashboard/payments?tab=receivable');
  });
});
