/**
 * Input: 选中的无会话 Token 行
 * Output: 其他 AI 调用详情弹窗
 * Pos: Dashboard AI 管理模块（settings/ai-usage 页面拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type AiStandaloneTokenRow } from "@/services/ai.service";
import { formatDateTime } from "@/lib/date-format";
import { estimateCost, labelStandaloneRequestType } from "../ai-usage-helpers";

export function StandaloneDetailDialog({
  standaloneDetailRow,
  setStandaloneDetailRow,
}: {
  standaloneDetailRow: AiStandaloneTokenRow | null;
  setStandaloneDetailRow: (row: AiStandaloneTokenRow | null) => void;
}) {
  return (
    <>
      <Dialog
        open={!!standaloneDetailRow}
        onOpenChange={(open) => !open && setStandaloneDetailRow(null)}
      >
        <DialogContent
          className="max-w-2xl max-h-[90vh] flex flex-col gap-0"
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle className="text-base">其他 AI 调用详情</DialogTitle>
            <DialogDescription className="sr-only">
              展示该次调用的类型、模型与已保存的输出快照。
            </DialogDescription>
          </DialogHeader>
          {standaloneDetailRow ? (
            <>
              <div className="grid gap-1.5 text-xs text-muted-foreground border-b border-border/60 pb-3">
                <div>
                  <span className="text-muted-foreground/80">时间：</span>
                  {formatDateTime(standaloneDetailRow.createdAt)}
                </div>
                {standaloneDetailRow.promptBrief?.trim() ? (
                  <div>
                    <span className="text-muted-foreground/80">用户输入：</span>
                    <span className="text-foreground/90">
                      {standaloneDetailRow.promptBrief.trim()}
                    </span>
                  </div>
                ) : null}
                <div>
                  <span className="text-muted-foreground/80">类型：</span>
                  {labelStandaloneRequestType(standaloneDetailRow.requestType)}
                  <span className="mx-2 text-border">·</span>
                  <span className="text-muted-foreground/80">模型：</span>
                  <span className="font-mono text-foreground/90">
                    {standaloneDetailRow.model}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground/80">Token：</span>
                  输入 {standaloneDetailRow.promptTokens} / 输出{" "}
                  {standaloneDetailRow.outputTokens} / 合计{" "}
                  {standaloneDetailRow.totalTokens}
                  {(() => {
                    const c = estimateCost(
                      standaloneDetailRow.model,
                      standaloneDetailRow.totalTokens,
                    );
                    return c ? (
                      <span className="ml-2 text-foreground/80">（{c}）</span>
                    ) : null;
                  })()}
                </div>
              </div>
              <ScrollArea className="mt-3 max-h-[min(56vh,520px)] rounded-xl border border-border/60 bg-muted/20">
                <pre className="p-4 text-xs leading-relaxed whitespace-pre-wrap font-mono text-foreground/90">
                  {standaloneDetailRow.detailSnapshot?.trim()
                    ? standaloneDetailRow.detailSnapshot
                    : "暂无保存的输出快照（可能为升级前的历史记录，或该次调用未写入正文）。"}
                </pre>
              </ScrollArea>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
