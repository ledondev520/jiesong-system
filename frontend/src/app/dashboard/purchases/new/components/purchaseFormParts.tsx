/**
 * Input: zod
 * Output: 采购表单校验 schema、内联供应商初始值、步骤指示器与价格汇总卡片
 * Pos: CreatePurchasePageContent 拆出的无状态部分
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { z } from "zod";
import { Calculator, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ============== Schema ==============
export const purchaseSchema = z.object({
  supplierId: z.string().min(1, "请选择供应商"),
  contractNo: z.string().optional(),
  signedAt: z.date().optional(),
  expectedDate: z.date().optional(),
  taxRate: z.number().min(0).max(100),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "请选择商品"),
        quantity: z.number().min(0.01, "数量必须大于0"),
        unitPrice: z.number().min(0, "单价必须大于等于0"),
        unit: z.string().optional(),
        note: z.string().optional(),
        priceNote: z.string().optional(),
      }),
    )
    .min(1, "至少添加一项商品"),
});

export type PurchaseFormValues = z.infer<typeof purchaseSchema>;

export const emptyNewSupplier = {
  name: "",
  contactName: "",
  contactPhone: "",
  address: "",
  taxId: "",
  bankAccountName: "",
  bankName: "",
  bankBranch: "",
  bankCode: "",
  bankAccount: "",
};

/**
 * 职责：步骤指示器
 * 思路：已完成步骤显示勾选，当前步骤高亮，未完成步骤显示数字
 */
export function StepIndicator({
  steps,
  currentStep,
  onChange,
}: {
  steps: string[];
  currentStep: number;
  onChange: (step: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((step, idx) => {
        const stepNum = idx + 1;
        const isCompleted = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;
        return (
          <div key={step} className="flex items-center">
            <button
              type="button"
              onClick={() => onChange(stepNum)}
              className="flex items-center gap-2 rounded-full px-2 py-2.5 sm:gap-2.5 sm:px-4 text-sm font-medium transition-all"
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  isCurrent
                    ? "bg-primary text-primary-foreground"
                    : isCompleted
                      ? "bg-emerald-500 text-white"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : stepNum}
              </span>
              <span
                className={cn(
                  isCurrent
                    ? "text-primary"
                    : isCompleted
                      ? "text-foreground"
                      : "text-muted-foreground",
                )}
              >
                {step}
              </span>
            </button>
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "mx-1 h-px w-4 sm:mx-2 sm:w-8",
                  isCompleted ? "bg-emerald-500" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 职责：价格汇总卡片
 */
export function PriceSummary({
  subtotal,
  taxRate,
}: {
  subtotal: number;
  taxRate: number;
}) {
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Calculator className="h-3.5 w-3.5" />
        价格汇总
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">商品小计</span>
          <span className="font-mono font-medium tabular-nums">
            ¥{subtotal.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">税额 ({taxRate}%)</span>
          <span className="font-mono tabular-nums text-muted-foreground">
            ¥{taxAmount.toLocaleString()}
          </span>
        </div>
        <div className="border-t border-border/40 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">合计</span>
            <span className="font-mono text-lg font-bold tabular-nums text-emerald-600">
              ¥{total.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
