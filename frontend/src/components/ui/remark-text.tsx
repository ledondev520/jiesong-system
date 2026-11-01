/**
 * Input: 备注原文、无内容时的占位
 * Output: 只显示真实备注；导入来源痕迹收进默认折叠的「导入来源」
 * Pos: 采购/报关/退税等备注显示处共用；拆分规则见 lib/remark-display.ts，只改显示不改存储
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { splitRemark } from "@/lib/remark-display";
import { cn } from "@/lib/utils";

interface RemarkTextProps {
  note: unknown;
  /** 没有真实备注时显示的内容，默认 "-" */
  fallback?: string;
  className?: string;
}

export function RemarkText({
  note,
  fallback = "-",
  className,
}: RemarkTextProps) {
  const { text, source } = splitRemark(note);
  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {text || fallback}
      {source.length > 0 && (
        <details className="mt-1 text-xs text-muted-foreground">
          {/* 可点击的卡片（如手机列表卡）里点开折叠区不应触发卡片本身的点击。 */}
          <summary
            className="cursor-pointer select-none"
            onClick={(event) => event.stopPropagation()}
          >
            导入来源
          </summary>
          <span className="mt-1 block space-y-0.5 break-all font-mono">
            {source.map((line, index) => (
              <span key={index} className="block">
                {line}
              </span>
            ))}
          </span>
        </details>
      )}
    </span>
  );
}
