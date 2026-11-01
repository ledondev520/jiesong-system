/**
 * Input: AI 推荐输入与结果状态
 * Output: AI 智能推荐弹窗
 * Pos: 出口模块子页面 - HSCode 检索（page.tsx 拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type AiRecommendPayload } from "../hs-code-helpers";

export function HsCodeAiRecommendDialog({
  aiRecommendOpen,
  handleAiRecommendDialogChange,
  aiRecommendInput,
  setAiRecommendInput,
  aiRecommendLoading,
  aiRecommendResult,
  handleAiRecommendClick,
  runAiRecommend,
  copied,
  setCopied,
  setAiRecommendOpen,
  setHsCodeInput,
  setKeyword,
}: {
  aiRecommendOpen: boolean;
  handleAiRecommendDialogChange: (open: boolean) => void;
  aiRecommendInput: string;
  setAiRecommendInput: (value: string) => void;
  aiRecommendLoading: boolean;
  aiRecommendResult: AiRecommendPayload | null;
  handleAiRecommendClick: () => unknown;
  runAiRecommend: (text: string, force?: boolean) => unknown;
  copied: boolean;
  setCopied: (copied: boolean) => void;
  setAiRecommendOpen: (open: boolean) => void;
  setHsCodeInput: (value: string) => void;
  setKeyword: (value: string) => void;
}) {
  return (
    <>
      <Dialog
        open={aiRecommendOpen}
        onOpenChange={handleAiRecommendDialogChange}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI 智能推荐 HS 编码
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <form
              className="space-y-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                handleAiRecommendClick();
              }}
            >
              <label
                className="text-sm font-medium"
                htmlFor="hs-ai-recommend-input"
              >
                产品描述
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <Input
                  id="hs-ai-recommend-input"
                  placeholder="例如：天然石英石板材，用于橱柜台面"
                  value={aiRecommendInput}
                  onChange={(e) => setAiRecommendInput(e.target.value)}
                  className="min-w-0 flex-1"
                  enterKeyHint="search"
                />
                <Button
                  type="submit"
                  className="shrink-0 sm:w-10"
                  disabled={aiRecommendLoading}
                  aria-label="发起 AI 推荐"
                >
                  {aiRecommendLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                停半秒自动推荐，亦可点按钮或键盘「搜索」。模型结果仅供参考；下方对照本地税则，分数
                0–100 表示匹配度。
              </p>
            </form>

            {aiRecommendLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 正在分析商品描述并生成申报要素建议...
              </div>
            )}

            {aiRecommendResult && !aiRecommendLoading && (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {aiRecommendResult.recommendation ? (
                  <>
                    {/* HS 编码推荐卡片 */}
                    <div className="rounded-lg border border-accent/60 bg-accent/20 p-4 space-y-2">
                      <div className="flex flex-wrap items-start gap-2">
                        <Badge className="h-auto max-w-full whitespace-normal break-all py-1 text-left font-mono text-sm leading-snug">
                          {aiRecommendResult.recommendation.hsCode}
                        </Badge>
                        <span className="text-sm font-medium">
                          {aiRecommendResult.recommendation.productName}
                        </span>
                        {typeof aiRecommendResult.recommendation.confidence ===
                        "number" ? (
                          <Badge variant="secondary" className="tabular-nums">
                            置信分{" "}
                            {Math.min(
                              100,
                              Math.max(
                                0,
                                Math.round(
                                  aiRecommendResult.recommendation.confidence,
                                ),
                              ),
                            )}{" "}
                            分
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {aiRecommendResult.recommendation.reason}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const code =
                              aiRecommendResult.recommendation!.hsCode.replace(
                                /\D/g,
                                "",
                              );
                            setHsCodeInput(code);
                            setKeyword("");
                            setAiRecommendOpen(false);
                          }}
                        >
                          使用此编码搜索
                        </Button>
                        <BusinessWrite>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            disabled={aiRecommendLoading}
                            onClick={() =>
                              void runAiRecommend(aiRecommendInput, true)
                            }
                          >
                            刷新推荐
                          </Button>
                        </BusinessWrite>
                      </div>
                    </div>

                    {/* 推荐证据链 */}
                    {aiRecommendResult.evidence && (
                      <div className="rounded-lg border bg-background p-4 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">推荐证据链</p>
                          <Badge variant="secondary">
                            {
                              aiRecommendResult.evidence
                                .recommendationSourceLabel
                            }
                          </Badge>
                          <Badge variant="outline">
                            要素模板：
                            {
                              aiRecommendResult.evidence
                                .declarationTemplateSourceLabel
                            }
                          </Badge>
                        </div>
                        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                          <div>
                            <span className="font-medium text-foreground">
                              HSCIQ：
                            </span>
                            {aiRecommendResult.evidence.hsciq?.enabled
                              ? aiRecommendResult.evidence.hsciq.available
                                ? `已启用，剩余额度 ${aiRecommendResult.evidence.hsciq.quotaRemaining}`
                                : "已启用但未配置密钥"
                              : "未启用"}
                          </div>
                          <div>
                            <span className="font-medium text-foreground">
                              归类实例：
                            </span>
                            {aiRecommendResult.evidence.hsciq?.usedInstance
                              ? "已参考"
                              : "未使用"}
                            <span className="mx-1">/</span>
                            <span className="font-medium text-foreground">
                              编码详情：
                            </span>
                            {aiRecommendResult.evidence.hsciq?.usedCodeDetail
                              ? "已命中"
                              : "未命中"}
                          </div>
                          {aiRecommendResult.evidence.localSnapshot ? (
                            <div className="sm:col-span-2">
                              <span className="font-medium text-foreground">
                                本地快照：
                              </span>
                              {aiRecommendResult.evidence.localSnapshot.hsCode}{" "}
                              {
                                aiRecommendResult.evidence.localSnapshot
                                  .productName
                              }
                              {aiRecommendResult.evidence.localSnapshot
                                .effectiveDate
                                ? `，版本日期 ${new Date(aiRecommendResult.evidence.localSnapshot.effectiveDate).toISOString().slice(0, 10)}`
                                : ""}
                            </div>
                          ) : null}
                        </div>
                        {aiRecommendResult.evidence
                          .declarationTemplateElements &&
                        aiRecommendResult.evidence.declarationTemplateElements
                          .length > 0 ? (
                          <div className="space-y-1.5 border-t pt-2">
                            <p className="text-xs font-medium text-muted-foreground">
                              该编码要求填写的申报要素
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {aiRecommendResult.evidence.declarationTemplateElements.map(
                                (item, index) => (
                                  <Badge
                                    key={`${item}-${index}`}
                                    variant="outline"
                                    className="max-w-full whitespace-normal text-left font-normal"
                                  >
                                    {item}
                                  </Badge>
                                ),
                              )}
                            </div>
                          </div>
                        ) : null}
                        {aiRecommendResult.evidence.pendingConfirmationFields &&
                        aiRecommendResult.evidence.pendingConfirmationFields
                          .length > 0 ? (
                          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                            仍需确认：
                            {aiRecommendResult.evidence.pendingConfirmationFields.join(
                              "、",
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* HSCIQ 权威数据（税率、监管条件等） */}
                    {aiRecommendResult.hsciqDetail?.taxes && (
                      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-2">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                          官方税率信息
                        </p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          {(() => {
                            const taxes = aiRecommendResult.hsciqDetail!.taxes!;
                            const labelMap: Record<string, string> = {
                              mfnImportRate: "最惠国进口税率",
                              generalImportRate: "普通进口税率",
                              vatRate: "增值税率",
                              exportTaxRebateRate: "出口退税率",
                              consumptionTaxRate: "消费税率",
                              exportRate: "出口税率",
                              provisionalImportRate: "暂定进口税率",
                              provisionalExportRate: "暂定出口税率",
                            };
                            return Object.entries(taxes)
                              .filter(([, v]) => v && v !== "" && v !== "-")
                              .slice(0, 8)
                              .map(([k, v]) => (
                                <div
                                  key={k}
                                  className="flex justify-between text-xs"
                                >
                                  <span className="text-muted-foreground">
                                    {labelMap[k] || k}
                                  </span>
                                  <span className="font-medium tabular-nums">
                                    {v}
                                  </span>
                                </div>
                              ));
                          })()}
                        </div>
                        {aiRecommendResult.hsciqDetail!.extensions?.cn
                          ?.regulatory &&
                          Object.keys(
                            aiRecommendResult.hsciqDetail!.extensions.cn
                              .regulatory,
                          ).length > 0 && (
                            <div className="text-xs border-t pt-1.5 mt-1.5">
                              <span className="text-muted-foreground">
                                监管条件：
                              </span>
                              <span className="font-medium">
                                {Object.entries(
                                  aiRecommendResult.hsciqDetail!.extensions!.cn!
                                    .regulatory!,
                                )
                                  .map(([k, v]) => `${k}(${v})`)
                                  .join("、")}
                              </span>
                            </div>
                          )}
                        <p className="text-[10px] text-muted-foreground">
                          数据来源：HSCIQ 海关编码智能查询
                        </p>
                      </div>
                    )}

                    {/* AI 填写的申报要素（推断值，建议在详情页使用精确版） */}
                    {aiRecommendResult.filledDeclarationElements &&
                      aiRecommendResult.filledDeclarationElements.length >
                        0 && (
                        <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">
                              AI 申报要素参考
                            </p>
                            <button
                              type="button"
                              onClick={() => {
                                const pipeValues = (
                                  aiRecommendResult.filledDeclarationElements ||
                                  []
                                )
                                  .map((item) => item.value)
                                  .join("|");
                                void navigator.clipboard
                                  .writeText(pipeValues)
                                  .then(() => {
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                  });
                              }}
                              className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            >
                              {copied ? (
                                <Check className="h-3 w-3 text-green-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              {copied ? "已复制" : "复制报关格式"}
                            </button>
                          </div>
                          <div className="space-y-1.5">
                            {aiRecommendResult.filledDeclarationElements.map(
                              (item, i) => (
                                <div
                                  key={i}
                                  className="flex items-start gap-2 text-xs"
                                >
                                  <span className="shrink-0 w-5 text-center font-medium text-muted-foreground">
                                    {i + 1}.
                                  </span>
                                  <span className="w-24 shrink-0 break-words text-muted-foreground sm:w-auto">
                                    {item.element}：
                                  </span>
                                  <span
                                    className={cn(
                                      "flex-1",
                                      item.uncertain &&
                                        "text-amber-600 dark:text-amber-400",
                                    )}
                                  >
                                    {item.value}
                                    {item.uncertain && (
                                      <span className="ml-1 text-[10px] opacity-70">
                                        （待确认）
                                      </span>
                                    )}
                                  </span>
                                </div>
                              ),
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed border-t pt-2">
                            {aiRecommendResult.hsciqDetail
                              ? "申报要素模板来源于 HSCIQ 官方税则库，AI 已据此填写参考值。最终以海关正式归类为准。"
                              : "以上为 AI 参考推断，不保证精确。确认 HS 编码后，建议进入详情页使用「AI 辅助填写申报要素」获得基于真实要素模板的准确填写建议。"}
                          </p>
                        </div>
                      )}
                  </>
                ) : (
                  <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                    {aiRecommendResult.reason ||
                      aiRecommendResult.rawResponse ||
                      "未找到合适的 HS 码推荐，请换用更详细的产品描述。"}
                  </div>
                )}

                {aiRecommendResult.candidates.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      参考候选（{aiRecommendResult.candidates.length} 条）
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      分数＝相似度换算后按名次递减，仅供排序。
                    </p>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {aiRecommendResult.candidates.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                          onClick={() => {
                            setHsCodeInput(c.hsCode.replace(/\D/g, ""));
                            setKeyword("");
                            setAiRecommendOpen(false);
                          }}
                        >
                          <span className="font-mono break-all text-primary">
                            {c.hsCode}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {c.productName}
                          </span>
                          <Badge
                            variant="outline"
                            className="shrink-0 tabular-nums"
                          >
                            {typeof c.confidenceScore === "number"
                              ? `${c.confidenceScore} 分`
                              : "—"}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
