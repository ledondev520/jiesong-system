/**
 * Input: Attachment scope, shared authenticated binary service and auth generation
 * Output: Cancellable preview/download actions and short-lived object URLs
 * Pos: Shared contract and archived carrier-original access; never persists files or credentials
 */
"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getAuthGeneration,
  subscribeAuthGeneration,
} from "@/lib/browser-session";
import {
  fetchContractFileBlob,
  isContractFilePreviewMime,
  type ContractFile,
} from "@/services/contractFile.service";

type DownloadFile = Pick<ContractFile, "id" | "fileName">;
type FileRequest = {
  controller: AbortController;
  generation: number;
  scope: string;
  url?: string;
};
type Preview = {
  file: ContractFile;
  loading: boolean;
  url: string | null;
  mime: string;
  error: string | null;
};

export function useContractFileAccess(scope: string) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const mounted = useRef(true);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const previewRequest = useRef<FileRequest | null>(null);
  const downloads = useRef(new Map<string, FileRequest>());
  const downloadUrls = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const current = (request: FileRequest) =>
    mounted.current &&
    !request.controller.signal.aborted &&
    request.scope === scopeRef.current &&
    request.generation === getAuthGeneration();

  const cancelDownloads = useCallback(() => {
    downloads.current.forEach((request) => request.controller.abort());
    downloads.current.clear();
    downloadUrls.current.forEach((timer, url) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    });
    downloadUrls.current.clear();
    if (mounted.current) setDownloadingIds(new Set());
  }, []);

  const closePreview = useCallback(() => {
    const request = previewRequest.current;
    previewRequest.current = null;
    request?.controller.abort();
    if (request?.url) URL.revokeObjectURL(request.url);
    cancelDownloads();
    if (mounted.current) setPreview(null);
  }, [cancelDownloads]);

  const reset = closePreview;

  useLayoutEffect(() => {
    mounted.current = true;
    const unsubscribe = subscribeAuthGeneration(reset);
    return () => {
      mounted.current = false;
      unsubscribe();
      reset();
    };
  }, [reset]);
  useLayoutEffect(() => {
    reset();
  }, [scope, reset]);

  const openPreview = async (file: ContractFile) => {
    closePreview();
    const request: FileRequest = {
      controller: new AbortController(),
      generation: getAuthGeneration(),
      scope: scopeRef.current,
    };
    previewRequest.current = request;
    setPreview({ file, loading: true, url: null, mime: "", error: null });
    try {
      const blob = await fetchContractFileBlob(
        file.id,
        request.controller.signal,
      );
      if (!current(request) || previewRequest.current !== request) return;
      if (!isContractFilePreviewMime(blob.type)) {
        throw new Error("此文件类型不支持在线预览，请下载后查看");
      }
      request.url = URL.createObjectURL(blob);
      setPreview({
        file,
        loading: false,
        url: request.url,
        mime: blob.type.toLowerCase(),
        error: null,
      });
    } catch (error) {
      if (!current(request) || previewRequest.current !== request) return;
      setPreview({
        file,
        loading: false,
        url: null,
        mime: "",
        error:
          error instanceof Error ? error.message : "附件预览失败，请稍后重试",
      });
    }
  };

  const failPreview = (expectedUrl: string) => {
    const request = previewRequest.current;
    if (!request || !current(request) || request.url !== expectedUrl) return;
    if (request.url) URL.revokeObjectURL(request.url);
    delete request.url;
    setPreview((value) =>
      value
        ? {
            ...value,
            loading: false,
            url: null,
            error: "浏览器无法显示此附件，请下载后查看",
          }
        : null,
    );
  };

  const downloadFile = async (file: DownloadFile) => {
    if (downloads.current.has(file.id)) return;
    const request: FileRequest = {
      controller: new AbortController(),
      generation: getAuthGeneration(),
      scope: scopeRef.current,
    };
    downloads.current.set(file.id, request);
    setDownloadingIds(new Set(downloads.current.keys()));
    try {
      const blob = await fetchContractFileBlob(
        file.id,
        request.controller.signal,
      );
      if (!current(request) || downloads.current.get(file.id) !== request)
        return;
      const url = URL.createObjectURL(blob);
      // Keep the URL briefly so browsers can consume the download after the click.
      // Close/navigation/session changes revoke it sooner; no file bytes enter storage.
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        downloadUrls.current.delete(url);
      }, 60_000);
      downloadUrls.current.set(url, timer);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.fileName;
      document.body.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
      }
    } catch (error) {
      if (current(request) && downloads.current.get(file.id) === request) {
        toast.error(
          error instanceof Error ? error.message : "附件下载失败，请稍后重试",
        );
      }
    } finally {
      if (downloads.current.get(file.id) === request) {
        downloads.current.delete(file.id);
        if (mounted.current)
          setDownloadingIds(new Set(downloads.current.keys()));
      }
    }
  };

  return {
    preview,
    openPreview,
    closePreview,
    failPreview,
    downloadFile,
    downloadingIds,
  };
}
