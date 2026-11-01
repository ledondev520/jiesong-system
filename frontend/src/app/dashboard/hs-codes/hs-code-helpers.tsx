/**
 * Input: HSCode 记录、HSCIQ 与 AI 推荐载荷
 * Output: HSCode 页面共用的解析函数、类型与展示片段
 * Pos: 出口模块子页面 - HSCode 检索（page.tsx 拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import type { HsCodeRecord } from "@/types";
import { Badge } from "@/components/ui/badge";

/**
 * 防抖 Hook - 延迟输入触发
 */

export function parseDeclarationElements(value: string | null | undefined) {
  if (!value) return [];

  return value
    .split(/[|｜]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** HSCIQ 编码详情（API 返回 camelCase 字段） */
export type HsciqDetail = {
  code?: string;
  name?: string;
  taxes?: Record<string, string>;
  extensions?: {
    cn?: {
      reporting?: Array<{ key: string; value: string; isRequired?: boolean }>;
      regulatory?: Record<string, string>;
      inspect?: Record<string, string>;
    };
  };
} | null;

/** AI 推荐接口返回的 data 载荷（与后端 success 的 data 字段一致） */
export type AiRecommendPayload = {
  recommendation: {
    hsCode: string;
    productName: string;
    reason: string;
    confidence?: number;
  } | null;
  candidates: HsCodeRecord[];
  rawResponse?: string;
  reason?: string;
  /** AI 根据产品描述填写的申报要素具体值 */
  filledDeclarationElements?: Array<{
    element: string;
    value: string;
    uncertain?: boolean;
  }> | null;
  /** HSCIQ 权威编码详情 */
  hsciqDetail?: HsciqDetail;
  evidence?: {
    recommendationSource: "hsciq_instance" | "local_snapshot" | "ai";
    recommendationSourceLabel: string;
    declarationTemplateSource: "hsciq" | "local" | "ai";
    declarationTemplateSourceLabel: string;
    declarationTemplateElements?: string[];
    pendingConfirmationFields?: string[];
    hsciq?: {
      enabled: boolean;
      available: boolean;
      usedInstance: boolean;
      usedCodeDetail: boolean;
      quotaRemaining: number;
    };
    localSnapshot?: {
      hsCode: string;
      productName: string;
      sourceUrl?: string | null;
      effectiveDate?: string | Date | null;
      fetchedAt?: string | Date | null;
    } | null;
  };
};

export function parseStructuredItems(value: string | null | undefined) {
  if (!value) return [];

  return value
    .split(/[|｜]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, index) => {
      const matched = item.match(/^([A-Za-z0-9]+)\s*[:：]\s*(.+)$/);
      return {
        id: `${item}-${index}`,
        code: matched ? matched[1] : null,
        text: matched ? matched[2] : item,
      };
    });
}

export function DetailTokenSection({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; code: string | null; text: string }>;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <Badge variant="secondary" className="text-xs">
          {items.length} 项
        </Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-2">
              {item.code ? (
                <Badge
                  variant="outline"
                  className="min-w-10 justify-center font-mono"
                >
                  {item.code}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm leading-6">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export type EvidenceEditForm = {
  refundRate: string;
  exportTaxRate: string;
  vatRate: string;
  effectiveDate: string;
  sourceUrl: string;
  declarationElements: string;
  note: string;
};

export type DeclarationFillResult = Array<{
  element: string;
  value: string;
  uncertain?: boolean;
}> | null;

export type HsSearchParams = {
  searchKeyword: string;
  searchCode?: string;
  nextPage: number;
  currentPageSize?: number;
};

export const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "-";
  return `${value}%`;
};

/**
 * 职责：判断 HS 编码记录是否过期
 * 思路：备注中含"过期"关键字，或 effectiveDate 早于 2025-01-01
 */
export const isExpiredHsCode = (record: HsCodeRecord) => {
  if (record.note && /过期/i.test(record.note)) return true;
  if (!record.effectiveDate) return false;
  return new Date(record.effectiveDate) < new Date("2025-01-01");
};
