/**
 * Input: 文件下载工具
 * Output: 下载成功与错误处理测试
 * Pos: 前端业务服务测试
 */

import { describe, expect, it, vi } from 'vitest';
import {
  downloadResponseBlob,
  extractErrorFromResponse,
  saveBlobToFile,
  throwDownloadError,
} from './fileDownload';

const installUrlMocks = (blobUrl: string) => {
  const originalCreate = (URL as unknown as { createObjectURL?: typeof URL.createObjectURL }).createObjectURL;
  const originalRevoke = (URL as unknown as { revokeObjectURL?: typeof URL.revokeObjectURL }).revokeObjectURL;
  const createObjectURL = vi.fn(() => blobUrl);
  const revokeObjectURL = vi.fn();

  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: revokeObjectURL,
  });

  const restore = () => {
    if (originalCreate) {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: originalCreate,
      });
    } else {
      delete (URL as unknown as { createObjectURL?: typeof URL.createObjectURL }).createObjectURL;
    }

    if (originalRevoke) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: originalRevoke,
      });
    } else {
      delete (URL as unknown as { revokeObjectURL?: typeof URL.revokeObjectURL }).revokeObjectURL;
    }
  };

  return { createObjectURL, revokeObjectURL, restore };
};

describe('fileDownload', () => {
  it('extractErrorFromResponse: 可解析 JSON，解析失败返回 null', async () => {
    const jsonResponse = new Response(JSON.stringify({ message: 'bad request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
    const textResponse = new Response('plain text', { status: 500 });

    await expect(extractErrorFromResponse(jsonResponse)).resolves.toEqual({ message: 'bad request' });
    await expect(extractErrorFromResponse(textResponse)).resolves.toBeNull();
  });

  it('throwDownloadError: 优先使用后端 message 构建错误', async () => {
    const response = new Response(JSON.stringify({ message: '导出失败' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });

    await expect(throwDownloadError(response, '文件导出失败')).rejects.toMatchObject({
      status: 400,
      message: '导出失败',
    });
  });

  it('saveBlobToFile: 触发 a 标签下载并释放 URL 资源', () => {
    const { createObjectURL, revokeObjectURL, restore } = installUrlMocks('blob:mock-url');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      saveBlobToFile(new Blob(['demo']), 'demo.txt');

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    } finally {
      restore();
      clickSpy.mockRestore();
    }
  });

  it('downloadResponseBlob: 成功返回文件名，失败抛标准错误', async () => {
    const { revokeObjectURL, restore } = installUrlMocks('blob:ok-url');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      const successResponse = new Response(new Blob(['excel']), {
        status: 200,
        headers: {
          'Content-Disposition': "attachment; filename*=UTF-8''report%20A.xlsx",
        },
      });

      const okResult = await downloadResponseBlob(successResponse, 'fallback.xlsx');
      expect(okResult).toEqual({
        code: 200,
        message: '文件下载成功',
        data: 'report A.xlsx',
      });

      const failedResponse = new Response('server error', { status: 500 });
      await expect(downloadResponseBlob(failedResponse, 'fallback.xlsx')).rejects.toMatchObject({
        status: 500,
        message: '文件导出失败（500）',
      });
      expect(clickSpy).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:ok-url');
    } finally {
      restore();
      clickSpy.mockRestore();
    }
  });
});
