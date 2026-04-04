/**
 * Three Forms Service 单元测试
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { threeFormsService } from './threeForms.service';
import api from '@/lib/axios';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:test-url');
global.URL.revokeObjectURL = vi.fn();

describe('threeFormsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应该一键生成三张表', async () => {
    const mockResponse = { code: 200, data: { customsDeclarationId: 'cd-1', forexId: 'f-1', taxRefundId: 'tr-1' } };
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse);

    const result = await threeFormsService.generateThreeForms({
      salesContractId: 'sc-1',
      items: [],
    });

    expect(api.post).toHaveBeenCalledWith('/three-forms/generate', {
      salesContractId: 'sc-1',
      items: [],
    });
    expect(result.data.customsDeclarationId).toBe('cd-1');
  });

  it('应该单独生成报关单', async () => {
    const mockResponse = { code: 200, data: { customsDeclarationId: 'cd-1' } };
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse);

    const result = await threeFormsService.generateCustomsDeclaration({
      salesContractId: 'sc-1',
      items: [],
    });

    expect(api.post).toHaveBeenCalledWith('/three-forms/customs-declaration', {
      salesContractId: 'sc-1',
      items: [],
    });
    expect(result.data.customsDeclarationId).toBe('cd-1');
  });

  it('应该单独生成外汇核销单', async () => {
    const mockResponse = { code: 200, data: { forexId: 'f-1' } };
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse);

    const result = await threeFormsService.generateForexVerification({
      salesContractId: 'sc-1',
      customsDeclarationId: 'cd-1',
    });

    expect(api.post).toHaveBeenCalledWith('/three-forms/forex-verification', {
      salesContractId: 'sc-1',
      customsDeclarationId: 'cd-1',
    });
    expect(result.data.forexId).toBe('f-1');
  });

  it('应该单独生成出口退税单', async () => {
    const mockResponse = { code: 200, data: { taxRefundId: 'tr-1' } };
    vi.mocked(api.post).mockResolvedValueOnce(mockResponse);

    const result = await threeFormsService.generateTaxRefund({
      salesContractId: 'sc-1',
      customsDeclarationId: 'cd-1',
      forexVerificationId: 'f-1',
      items: [],
    });

    expect(api.post).toHaveBeenCalledWith('/three-forms/tax-refund', {
      salesContractId: 'sc-1',
      customsDeclarationId: 'cd-1',
      forexVerificationId: 'f-1',
      items: [],
    });
    expect(result.data.taxRefundId).toBe('tr-1');
  });

  it('应该下载三张表Excel', async () => {
    const mockBlob = new Blob(['test']);
    vi.mocked(api.get).mockResolvedValueOnce({
      data: mockBlob,
      headers: { 'content-disposition': 'filename=test.xlsx' },
    });

    await threeFormsService.downloadExcel('sc-1');

    expect(api.get).toHaveBeenCalled();
  });
});
