/**
 * Input: 选中的 HS 编码记录、AI 填写申报要素状态
 * Output: HS 编码详情卡片（税率、监管条件、申报要素、AI 辅助填写）
 * Pos: 出口模块子页面 - HSCode 检索（page.tsx 拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import type { HsCodeRecord } from "@/types";
import { toast } from "sonner";
import {
  ChevronRight,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Pencil,
} from "lucide-react";
import api from "@/lib/axios";
import type { ApiResponse } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DetailTokenSection,
  formatPercent,
  isExpiredHsCode,
  parseDeclarationElements,
  parseStructuredItems,
  type DeclarationFillResult,
} from "../hs-code-helpers";

export function HsCodeDetailCard({
  selectedRecord,
  setSelectedRecord,
  openEvidenceEditor,
  fillProductName,
  setFillProductName,
  fillProductDescription,
  setFillProductDescription,
  fillLoading,
  setFillLoading,
  fillResult,
  setFillResult,
  fillCopied,
  setFillCopied,
}: {
  selectedRecord: HsCodeRecord;
  setSelectedRecord: (record: HsCodeRecord | null) => void;
  openEvidenceEditor: () => void;
  fillProductName: string;
  setFillProductName: (value: string) => void;
  fillProductDescription: string;
  setFillProductDescription: (value: string) => void;
  fillLoading: boolean;
  setFillLoading: (loading: boolean) => void;
  fillResult: DeclarationFillResult;
  setFillResult: (result: DeclarationFillResult) => void;
  fillCopied: boolean;
  setFillCopied: (copied: boolean) => void;
}) {
  const declarationElements = parseDeclarationElements(
    selectedRecord.declarationElements,
  );
  const supervisionItems = parseStructuredItems(
    selectedRecord.supervisionConditions,
  );
  const inspectionItems = parseStructuredItems(
    selectedRecord.inspectionQuarantine,
  );
  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setSelectedRecord(null)}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
              返回列表
            </button>
            {isExpiredHsCode(selectedRecord) && (
              <Badge variant="destructive" className="text-xs">
                已过期
              </Badge>
            )}
            <BusinessWrite>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={openEvidenceEditor}
              >
                <Pencil className="mr-2 h-4 w-4" />
                人工更新税则
              </Button>
            </BusinessWrite>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">
                HS 编码
              </h3>
              <p className="text-lg font-semibold">{selectedRecord.hsCode}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">
                商品名称
              </h3>
              <p className="text-lg font-semibold">
                {selectedRecord.productName}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">
                计量单位
              </h3>
              <p className="text-lg font-semibold">
                {selectedRecord.unit || "-"}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">
                出口退税率
              </h3>
              <p className="text-lg font-semibold">
                {formatPercent(selectedRecord.refundRate)}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">
                出口税率
              </h3>
              <p className="text-lg font-semibold">
                {formatPercent(selectedRecord.exportTaxRate)}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">
                增值税率
              </h3>
              <p className="text-lg font-semibold">
                {formatPercent(selectedRecord.vatRate)}
              </p>
            </div>
          </div>

          <DetailTokenSection title="监管条件" items={supervisionItems} />

          {selectedRecord.declarationElements && (
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">
                  申报要素
                </h3>
                <Badge variant="secondary" className="text-xs">
                  {declarationElements.length} 项
                </Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {declarationElements.map((item, index) => (
                  <div
                    key={`${item}-${index}`}
                    className="rounded-lg border bg-muted/30 p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="min-w-8 justify-center"
                      >
                        {String(index + 1).padStart(2, "0")}
                      </Badge>
                    </div>
                    <p className="text-sm leading-6">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI 辅助填写申报要素 —— 基于该 HS 码的真实要素模板 */}
          <div className="mt-6 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium">AI 辅助填写申报要素</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              输入商品名称（必填），AI 将根据此 HS
              编码的申报要素格式自动生成填写建议，并提供可复制的标准格式。
            </p>
            <div className="space-y-2">
              <input
                id="hs-ai-fill-product-name"
                name="hsAiFillProductName"
                type="text"
                placeholder="商品名称（必填，如：天然石英石橱柜台面）"
                value={fillProductName}
                onChange={(e) => setFillProductName(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60"
              />
              <textarea
                id="hs-ai-fill-product-description"
                name="hsAiFillProductDescription"
                placeholder="产品描述（选填，如：天然石英石含量≥93%，表面抛光，规格3200×1600mm，厚度20mm）"
                value={fillProductDescription}
                onChange={(e) => setFillProductDescription(e.target.value)}
                rows={2}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60 resize-none"
              />
              <Button
                size="sm"
                disabled={fillLoading || !fillProductName.trim()}
                onClick={async () => {
                  setFillLoading(true);
                  setFillResult(null);
                  try {
                    const desc =
                      fillProductDescription.trim() || fillProductName.trim();
                    const res = await api.post<
                      ApiResponse<{
                        filledDeclarationElements: Array<{
                          element: string;
                          value: string;
                          uncertain?: boolean;
                        }>;
                      }>,
                      ApiResponse<{
                        filledDeclarationElements: Array<{
                          element: string;
                          value: string;
                          uncertain?: boolean;
                        }>;
                      }>
                    >(`/hs-codes/${selectedRecord.hsCode}/fill-declaration`, {
                      productDescription: desc,
                      productName: fillProductName.trim(),
                    });
                    setFillResult(res.data?.filledDeclarationElements ?? null);
                  } catch {
                    toast.error("AI 填写申报要素失败，请稍后重试");
                  } finally {
                    setFillLoading(false);
                  }
                }}
                className="w-full sm:w-auto"
              >
                {fillLoading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    AI 生成中...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    生成申报要素填写建议
                  </>
                )}
              </Button>
            </div>

            {fillResult && fillResult.length > 0 && (
              <div className="space-y-2 pt-1 border-t">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">AI 填写建议</p>
                  <button
                    type="button"
                    onClick={() => {
                      const pipeValues = fillResult
                        .map((item) => item.value)
                        .join("|");
                      void navigator.clipboard
                        .writeText(pipeValues)
                        .then(() => {
                          setFillCopied(true);
                          setTimeout(() => setFillCopied(false), 2000);
                        });
                    }}
                    className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {fillCopied ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    {fillCopied ? "已复制" : "复制报关格式"}
                  </button>
                </div>
                <div className="space-y-1.5">
                  {fillResult.map((item, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-md bg-background px-3 py-2 text-xs border"
                    >
                      <span className="shrink-0 w-5 text-center font-medium text-muted-foreground">
                        {i + 1}.
                      </span>
                      <span className="w-24 shrink-0 break-words text-muted-foreground sm:w-auto">
                        {item.element}：
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 break-words font-medium",
                          item.uncertain &&
                            "text-amber-600 dark:text-amber-400",
                        )}
                      >
                        {item.value}
                        {item.uncertain && (
                          <span className="ml-1 text-[10px] font-normal opacity-70">
                            （待确认）
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  以上内容由 AI
                  根据产品描述和申报要素格式生成，仅供参考，请以实际货物和海关要求为准。
                </p>
              </div>
            )}
          </div>

          <DetailTokenSection title="检验检疫" items={inspectionItems} />

          {selectedRecord.note && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-1">
                备注
              </h3>
              <p className="text-sm">{selectedRecord.note}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
