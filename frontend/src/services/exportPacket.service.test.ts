/**
 * Input: exportPacketService、API mock 与下载 mock
 * Output: 出口三单预览、生成和下载路径契约测试
 * Pos: 出口三单前端数据 Module 测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPost = vi.fn();
const mockDownload = vi.fn();

vi.mock('@/lib/axios', () => ({
  default: { post: (...args: unknown[]) => mockPost(...args) },
}));

vi.mock('@/lib/auth-token', () => ({ getAuthToken: () => 'test-token' }));

vi.mock('./fileDownload', () => ({
  downloadResponseBlob: (...args: unknown[]) => mockDownload(...args),
}));

import { exportPacketService } from './exportPacket.service';

describe('exportPacketService', () => {
  const input = {
    spotRate: 6.8,
    sellerName: '上海捷淞国际物流有限公司',
    buyerName: 'Test Buyer LLC',
    packageKind: '木箱',
    tradeTerm: 'FOB',
    documentDate: '2026-08-13',
  };

  beforeEach(() => {
    mockPost.mockReset();
    mockDownload.mockReset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('xlsx')));
  });

  it('预览调用只读出口三单端点', async () => {
    mockPost.mockResolvedValue({ data: { ready: true } });
    await exportPacketService.preview('sales-1', input);
    expect(mockPost).toHaveBeenCalledWith('/sales/sales-1/export-packet/preview', input);
  });

  it('确认生成调用生成端点并可从统一受保护附件路径下载', async () => {
    mockPost.mockResolvedValue({ data: { file: { id: 'file-1' } } });
    await exportPacketService.generate('sales-1', input);
    await exportPacketService.download('file-1', 'EXP260011_出口三单.xlsx');
    expect(mockPost).toHaveBeenCalledWith('/sales/sales-1/export-packet/generate', input);
    expect(fetch).toHaveBeenCalledWith('/api/v1/files/file-1/download', {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(mockDownload).toHaveBeenCalled();
  });
});
