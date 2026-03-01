/**
 * 文件下载公共工具
 */
import { ApiResponse } from '@/types';

export interface DownloadRequestError extends Error {
  status: number;
  payload?: unknown;
}

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const toFileName = (contentDisposition: string | null | undefined, fallback: string): string => {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8FileNameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8FileNameMatch) {
    try {
      return decodeURIComponent(utf8FileNameMatch[1].trim().replace(/^["']|["']$/g, ''));
    } catch {
      return utf8FileNameMatch[1].trim().replace(/^["']|["']$/g, '');
    }
  }

  const quotedMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return quotedMatch ? quotedMatch[1] : fallback;
};

export const saveBlobToFile = (blob: Blob, filename: string): void => {
  if (!isBrowser()) {
    return;
  }

  const fileUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = fileUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(fileUrl);
};

export const extractErrorFromResponse = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const throwDownloadError = async (response: Response, baseMessage: string): Promise<never> => {
  const payload = await extractErrorFromResponse(response);
  const message = (() => {
    if (payload && typeof payload === 'object' && 'message' in payload) {
      const maybeMessage = (payload as { message?: unknown }).message;
      if (typeof maybeMessage === 'string') {
        return maybeMessage;
      }
    }

    return `${baseMessage}（${response.status}）`;
  })();

  const error: DownloadRequestError = new Error(message) as DownloadRequestError;
  error.status = response.status;
  error.payload = payload;
  throw error;
};

export const downloadResponseBlob = async (
  response: Response,
  fallbackFilename: string,
): Promise<ApiResponse<string>> => {
  if (!response.ok) {
    await throwDownloadError(response, '文件导出失败');
  }

  const contentDisposition = response.headers.get('Content-Disposition');
  const fileName = toFileName(contentDisposition, fallbackFilename);
  const blob = await response.blob();
  saveBlobToFile(blob, fileName);

  return {
    code: 200,
    message: '文件下载成功',
    data: fileName,
  };
};
