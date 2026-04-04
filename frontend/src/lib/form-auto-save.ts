/**
 * 职责：表单自动保存与恢复
 * 思路：使用 localStorage 保存表单草稿，支持定时保存和手动恢复
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';

const STORAGE_PREFIX = 'form_draft_';
const DEFAULT_INTERVAL = 5000; // 5秒自动保存一次

export interface UseAutoSaveOptions {
  /** 表单唯一标识 */
  formId: string;
  /** 自动保存间隔（毫秒） */
  interval?: number;
  /** 保存前验证，返回 false 则不保存 */
  validateBeforeSave?: () => boolean;
  /** 保存成功回调 */
  onSave?: () => void;
  /** 恢复成功回调 */
  onRestore?: () => void;
}

export interface DraftMetadata {
  timestamp: number;
  pathname: string;
}

/**
 * Hook: 表单自动保存
 */
export function useFormAutoSave<T extends Record<string, unknown>>(
  formValues: T,
  options: UseAutoSaveOptions
) {
  const { formId, interval = DEFAULT_INTERVAL, validateBeforeSave, onSave, onRestore } = options;
  const pathname = usePathname();
  const storageKey = `${STORAGE_PREFIX}${formId}`;

  const [hasDraft, setHasDraft] = useState(() => {
    if (typeof window === 'undefined') return false;
    const draft = localStorage.getItem(storageKey);
    return !!draft;
  });
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 自动保存
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 清除之前的定时器
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // 延迟保存，避免频繁写入
    saveTimeoutRef.current = setTimeout(() => {
      if (validateBeforeSave && !validateBeforeSave()) return;

      const draft = {
        values: formValues,
        meta: {
          timestamp: Date.now(),
          pathname,
        } as DraftMetadata,
      };

      try {
        localStorage.setItem(storageKey, JSON.stringify(draft));
        setHasDraft(true);
        setLastSaved(new Date());
        onSave?.();
      } catch (e) {
        // localStorage 可能已满
        console.warn('自动保存失败:', e);
      }
    }, interval);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [formValues, storageKey, interval, validateBeforeSave, onSave, pathname]);

  // 恢复草稿
  const restoreDraft = useCallback((): T | null => {
    if (typeof window === 'undefined') return null;

    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return null;

      const draft = JSON.parse(saved) as { values: T; meta: DraftMetadata };
      onRestore?.();
      return draft.values;
    } catch (e) {
      console.error('恢复草稿失败:', e);
      return null;
    }
  }, [storageKey, onRestore]);

  // 清除草稿
  const clearDraft = useCallback(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(storageKey);
    setHasDraft(false);
    setLastSaved(null);
  }, [storageKey]);

  // 获取草稿信息
  const getDraftInfo = useCallback((): DraftMetadata | null => {
    if (typeof window === 'undefined') return null;

    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return null;

      const draft = JSON.parse(saved) as { values: T; meta: DraftMetadata };
      return draft.meta;
    } catch {
      return null;
    }
  }, [storageKey]);

  return {
    hasDraft,
    lastSaved,
    restoreDraft,
    clearDraft,
    getDraftInfo,
  };
}

/**
 * 清理所有过期草稿（超过7天）
 */
export function cleanupExpiredDrafts(maxAgeDays = 7): void {
  if (typeof window === 'undefined') return;

  const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
  const now = Date.now();

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_PREFIX)) continue;

    try {
      const saved = localStorage.getItem(key);
      if (!saved) continue;

      const draft = JSON.parse(saved) as { meta: DraftMetadata };
      if (now - draft.meta.timestamp > maxAge) {
        localStorage.removeItem(key);
      }
    } catch {
      // 解析失败，删除
      localStorage.removeItem(key);
    }
  }
}
