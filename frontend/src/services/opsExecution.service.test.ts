/**
 * Ops Execution Service 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { opsExecutionService } from './opsExecution.service';
import api from '@/lib/axios';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('@/lib/auth-token', () => ({
  getAuthToken: vi.fn().mockReturnValue('test-token'),
}));

describe('opsExecutionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该获取未发货列表', async () => {
    const mockResponse = { code: 200, data: { items: [], summary: { totalItems: 0 } } };
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockResponse });

    const result = await opsExecutionService.getUnshippedList({ page: 1 });

    expect(api.get).toHaveBeenCalledWith('/ops-execution/unshipped', { params: { page: 1 } });
    expect(result.data).toEqual(mockResponse);
  });

  it('应该分配负责人', async () => {
    const mockResponse = { code: 200, data: { key: 'key-1', assigneeName: '张三' } };
    vi.mocked(api.put).mockResolvedValueOnce({ data: mockResponse });

    const result = await opsExecutionService.assignUnshippedAssignee({
      salesContractId: 'sc-1',
      productId: 'p-1',
      status: 'pending',
      assigneeName: '张三',
    });

    expect(api.put).toHaveBeenCalledWith('/ops-execution/unshipped/assign', {
      salesContractId: 'sc-1',
      productId: 'p-1',
      status: 'pending',
      assigneeName: '张三',
    });
    expect(result.data).toEqual(mockResponse);
  });

  it('应该获取采购清单模板', async () => {
    const mockResponse = { code: 200, data: [] };
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockResponse });

    const result = await opsExecutionService.getPurchaseChecklistTemplates();

    expect(api.get).toHaveBeenCalledWith('/ops-execution/purchase-checklist/templates');
    expect(result.data).toEqual(mockResponse);
  });

  it('应该生成采购清单', async () => {
    const mockResponse = { code: 200, data: { templateId: 't-1' } };
    vi.mocked(api.post).mockResolvedValueOnce({ data: mockResponse });

    const result = await opsExecutionService.generatePurchaseChecklist({
      storeType: '标准店',
      openingStage: '筹备期',
    });

    expect(api.post).toHaveBeenCalledWith('/ops-execution/purchase-checklist/generate', {
      storeType: '标准店',
      openingStage: '筹备期',
    });
    expect(result.data).toEqual(mockResponse);
  });

  it('应该保存采购清单模板', async () => {
    const mockResponse = { code: 200, data: { templateId: 't-1' } };
    vi.mocked(api.put).mockResolvedValueOnce({ data: mockResponse });

    const result = await opsExecutionService.savePurchaseChecklistTemplate({
      storeType: '标准店',
      openingStage: '筹备期',
      templateName: '模板1',
      items: [],
    });

    expect(api.put).toHaveBeenCalledWith('/ops-execution/purchase-checklist/templates', {
      storeType: '标准店',
      openingStage: '筹备期',
      templateName: '模板1',
      items: [],
    });
    expect(result.data).toEqual(mockResponse);
  });
});
