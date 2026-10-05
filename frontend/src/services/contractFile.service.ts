import { getBrowserSessionHeaders } from "@/lib/browser-session";
/**
 * Input: Cookie模式内存CSRF、共享 axios 实例、标签认证令牌与可取消文件请求
 * Output: 合同附件 API 与无缓存认证二进制读取，保留后端权限和可读错误
 * Pos: 合同附件服务层，屏蔽采购/出口合同差异
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import api, { type ApiRequestConfig } from "@/lib/axios";
import { getAuthToken } from "@/lib/auth-token";
import type { ApiResponse } from "@/types";

export interface ContractFile {
  id: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  fileSize: number;
  filePath: string;
  description?: string | null;
  category?: ContractFileCategory;
  checksum?: string | null;
  uploadedAt: string;
  contractType?: "PURCHASE" | "SALES";
}

export type ContractType = "PURCHASE" | "SALES";
export type ContractFileCategory =
  | "OTHER"
  | "SIGNED_CONTRACT"
  | "PRODUCTION_PHOTO"
  | "SUPPLIER_INVOICE"
  | "CARRIER_DOCUMENT"
  | "SYSTEM_GENERATED_WORD"
  | "SYSTEM_GENERATED_PDF"
  | "SYSTEM_GENERATED_XLSX";

/**
 * 职责：获取合同附件列表
 */
export const listContractFiles = async (
  contractId: string,
  contractType: ContractType,
) => {
  return api.get<ApiResponse<ContractFile[]>, ApiResponse<ContractFile[]>>(
    `/contracts/${contractId}/files`,
    { params: { contractType } },
  );
};

/**
 * 职责：上传合同附件
 */
export const uploadContractFile = async (
  contractId: string,
  contractType: ContractType,
  file: File,
  description?: string,
  category: ContractFileCategory = "OTHER",
) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("contractType", contractType);
  if (description) formData.append("description", description);
  formData.append("category", category);

  const token = getAuthToken();
  const res = await fetch(`/api/v1/contracts/${contractId}/files`, {
    method: "POST",
    headers: {
      ...getBrowserSessionHeaders(),
      Authorization: token ? `Bearer ${token}` : "",
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "上传失败" }));
    throw new Error(err.message || "上传失败");
  }
  return res.json() as Promise<ApiResponse<ContractFile>>;
};

/**
 * 职责：删除合同附件
 */
export const deleteContractFile = async (fileId: string) => {
  return api.delete<ApiResponse<void>, ApiResponse<void>>(`/files/${fileId}`);
};

/**
 * 职责：获取下载链接
 */
export const getContractFileDownloadUrl = (fileId: string) => {
  return `/api/v1/files/${fileId}/download`;
};

/** Binary responses bypass the shared JSON GET cache and use the existing Bearer/cookie transport. */
export const fetchContractFileBlob = async (
  fileId: string,
  signal?: AbortSignal,
): Promise<Blob> => {
  try {
    const blob = await api.get<Blob, Blob>(
      `/files/${encodeURIComponent(fileId)}/download`,
      {
        responseType: "blob",
        signal,
        cache: { enabled: false },
      } as ApiRequestConfig,
    );
    if (!(blob instanceof Blob) || blob.size === 0 || /json/i.test(blob.type)) {
      throw new Error("附件内容不可用，请稍后重试");
    }
    return blob;
  } catch (error) {
    // Axios returns response.data directly, including JSON errors received as Blob.
    if (error instanceof Blob) {
      if (/json/i.test(error.type) && error.size <= 4096) {
        let payload: unknown;
        try {
          payload = JSON.parse(await error.text());
        } catch {
          /* Ignore invalid error bodies. */
        }
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "message" in payload
            ? payload.message
            : null;
        if (
          typeof message === "string" &&
          message.trim() &&
          message.length <= 200 &&
          !/[<>\x00-\x1f]/.test(message)
        ) {
          throw new Error(message);
        }
      }
      throw new Error("附件读取失败，请稍后重试");
    }
    throw error;
  }
};

/** Only passive image formats and PDF are embedded; Word/Excel remain downloads. */
export const isContractFilePreviewMime = (mime: string): boolean =>
  [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ].includes(mime.split(";")[0].trim().toLowerCase());
