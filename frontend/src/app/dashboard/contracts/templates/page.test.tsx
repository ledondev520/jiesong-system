/**
 * Input: 旧模板管理路由
 * Output: 验证模板管理不再作为独立页面
 * Pos: 前端路由兼容测试
 */

import { describe, expect, it, vi } from 'vitest';
import ContractTemplatesPage from './page';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe('ContractTemplatesPage', () => {
  it('旧模板管理路由回到采购合同页', () => {
    ContractTemplatesPage();

    expect(mockRedirect).toHaveBeenCalledWith('/dashboard/contracts');
  });
});
