/**
 * Input: 合同文档服务与API实例
 * Output: 合同文档服务接口单元测试
 * Pos: 前端业务服务测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/axios';
import { contractDocService } from './contractDoc.service';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('contractDocService', () => {
  it('checkTemplate/getTemplates/deleteTemplate: 调用正确端点', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');
    (api.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    await contractDocService.checkTemplate();
    await contractDocService.getTemplates();
    await contractDocService.deleteTemplate();

    expect(api.get).toHaveBeenCalledWith('/contract-doc/template/check');
    expect(api.get).toHaveBeenCalledWith('/contract-doc/templates');
    expect(api.delete).toHaveBeenCalledWith('/contract-doc/template');
  });

  it('uploadTemplate: 以 multipart/form-data 上传文件', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ok');

    const file = new File(['demo'], 'contract.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    await contractDocService.uploadTemplate(file);

    expect(api.post).toHaveBeenCalledWith(
      '/contract-doc/template',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  });

  it('generateFromPurchase: 请求 Blob 响应', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('blob');

    await contractDocService.generateFromPurchase('pc-1', {
      storeName: '洛杉矶店',
      deliveryAddress: 'LA',
    });

    expect(api.post).toHaveBeenCalledWith(
      '/contract-doc/generate/pc-1',
      { storeName: '洛杉矶店', deliveryAddress: 'LA' },
      { responseType: 'blob' },
    );
  });

  it('getContractPdf: 请求失败时返回 null', async () => {
    (api.get as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('not found'));

    const result = await contractDocService.getContractPdf('pc-1');

    expect(api.get).toHaveBeenCalledWith('/contract-doc/pdf/pc-1', { responseType: 'blob' });
    expect(result).toBeNull();
  });

  it('exportPurchasePdf: 请求生成并归档 PDF 版本后触发下载', async () => {
    const blob = new Blob(['%PDF-demo'], { type: 'application/pdf' });
    (api.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(blob);
    const download = vi.spyOn(contractDocService, 'downloadDocument').mockImplementation(() => {});

    await contractDocService.exportPurchasePdf('pc-1', 'CG2600001');

    expect(api.post).toHaveBeenCalledWith(
      '/contract-doc/generate/pc-1',
      { format: 'pdf' },
      { responseType: 'blob' },
    );
    expect(download).toHaveBeenCalledWith(blob, 'CG2600001_purchase_contract.pdf');
    download.mockRestore();
  });

  it('downloadDocument: 触发浏览器下载', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:mock'),
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      configurable: true,
    });

    const createObjectURL = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    const revokeObjectURL = URL.revokeObjectURL as unknown as ReturnType<typeof vi.fn>;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const appendChild = vi.spyOn(document.body, 'appendChild');
    const removeChild = vi.spyOn(document.body, 'removeChild');

    contractDocService.downloadDocument(new Blob(['x']), 'demo.docx');

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(appendChild).toHaveBeenCalled();
    expect(removeChild).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');

    Object.defineProperty(URL, 'createObjectURL', {
      value: originalCreateObjectURL,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: originalRevokeObjectURL,
      configurable: true,
    });
    click.mockRestore();
    appendChild.mockRestore();
    removeChild.mockRestore();
  });
});
