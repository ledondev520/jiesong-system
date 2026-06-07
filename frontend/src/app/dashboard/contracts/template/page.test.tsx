/**
 * Input: 旧合同模板上传路由
 * Output: 验证模板上传不再作为独立页面
 * Pos: 前端路由兼容测试
 */

import { describe, expect, it, vi } from 'vitest';
import ContractTemplateUploadPage from './page';

const mockRedirect = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => mockRedirect(...args),
}));

describe('ContractTemplateUploadPage', () => {
  it('旧模板上传路由回到采购合同页', () => {
    ContractTemplateUploadPage();

    expect(mockRedirect).toHaveBeenCalledWith('/dashboard/contracts');
  });
});
