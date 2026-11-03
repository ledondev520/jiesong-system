"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PaymentType } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useBusinessReadOnly } from "@/lib/hooks/useBusinessReadOnly";
import { isResidual } from "@/lib/finance-ledger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const paymentSchema = z.object({
  amount: z.number().min(0.01, "金额必须大于0"),
  paymentDate: z.date(),
  paymentMethod: z.string().min(1, "请选择支付方式"),
  note: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;
export type PaymentSubmitData = PaymentFormValues;

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: PaymentType;
  contractNo: string;
  contractId: string;
  remainingAmount: number;
  currency?: string;
  /** 台账行内登记：提交前先给出范围与对账影响的确认页（其他入口保持原一步提交）。 */
  confirmStep?: boolean;
  /** Resolve only after saving; reject on failure so the dialog can preserve inputs. */
  onSubmit: (data: PaymentSubmitData) => Promise<void>;
}

export function PaymentDialog({
  open,
  onOpenChange,
  type,
  contractNo,
  contractId,
  remainingAmount,
  currency,
  confirmStep = false,
  onSubmit,
}: PaymentDialogProps) {
  const readOnly = useBusinessReadOnly();
  const submitting = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const previousSession = useRef({ open: false, contractId });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState<PaymentFormValues | null>(null);
  const resolvedCurrency =
    currency || (type === PaymentType.PAYABLE ? "CNY" : "USD");
  const currencySymbol =
    resolvedCurrency === "USD" ? "$" : resolvedCurrency === "CNY" ? "¥" : "";
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    mode: "onChange",
    defaultValues: {
      amount: remainingAmount, // Default to full remaining
      paymentDate: new Date(),
      paymentMethod: "",
      note: "",
    },
  });

  useEffect(() => {
    const shouldReset =
      open &&
      (!previousSession.current.open ||
        previousSession.current.contractId !== contractId);
    previousSession.current = { open, contractId };
    // A balance refresh while editing must not erase the draft or change retry data.
    if (!shouldReset) return;
    form.reset({
      amount: remainingAmount,
      paymentDate: new Date(),
      paymentMethod: "",
      note: "",
    });
    setSubmitError(null);
    setPending(null);
  }, [form, open, contractId, remainingAmount]);

  const handleOpenChange = (next: boolean) => {
    // A request already sent cannot be cancelled by dismissing its dialog.
    if (!submitting.current) onOpenChange(next);
  };

  const handleSubmit = async (data: PaymentFormValues) => {
    if (readOnly || submitting.current) return;
    submitting.current = true;
    setIsSaving(true);
    setSubmitError(null);
    try {
      // The owning page closes on save success; do not close a newer dialog
      // after an older callback finishes refreshing its page.
      await onSubmit(data);
    } catch (error: unknown) {
      const message = (error as { message?: unknown })?.message;
      setSubmitError(
        typeof message === "string" ? message : "记录失败，请稍后重试",
      );
    } finally {
      submitting.current = false;
      setIsSaving(false);
    }
  };

  const isSubmitting = isSaving || form.formState.isSubmitting;
  const afterOpen = pending ? remainingAmount - pending.amount : 0;

  const title = type === PaymentType.PAYABLE ? "录入付款" : "录入收款";
  const label = type === PaymentType.PAYABLE ? "付款金额" : "收款金额";

  if (readOnly) return null;
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[425px]"
        aria-describedby={undefined}
        showCloseButton={!isSubmitting}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-4">
          合同:{" "}
          <span className="font-medium text-foreground">{contractNo}</span>
          <br />
          待结金额:{" "}
          <span className="font-medium text-foreground">
            {resolvedCurrency} {currencySymbol}
            {remainingAmount.toLocaleString()}
          </span>
        </div>
        {pending ? (
          <div className="space-y-4" data-testid="payment-confirm">
            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {submitError}
                  。已保留本次填写内容；请保持原内容重试，避免重复登记。
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-sm">
              <p>
                本次登记 <strong>1 笔</strong>：合同 {contractNo}，{label}{" "}
                {resolvedCurrency} {currencySymbol}
                {pending.amount.toLocaleString()}
              </p>
              <p className="text-muted-foreground">
                {afterOpen < -0.005
                  ? `超出待结金额 ${resolvedCurrency} ${currencySymbol}${Math.abs(afterOpen).toLocaleString()}，该合同将多${type === PaymentType.PAYABLE ? "付" : "收"}。`
                  : afterOpen <= 0.005
                    ? "登记后该合同待结金额为 0，将视为结清。"
                    : `登记后该合同待结 ${resolvedCurrency} ${currencySymbol}${afterOpen.toLocaleString()}${isResidual(afterOpen) ? "（尾差，不会自动核销）" : ""}。`}
              </p>
              <p className="text-muted-foreground">
                保存后立即计入{type === PaymentType.PAYABLE ? "应付" : "应收"}
                合计和对账数据。
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => setPending(null)}
              >
                返回修改
              </Button>
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleSubmit(pending)}
              >
                {isSubmitting ? "提交中..." : "确认登记"}
              </Button>
            </DialogFooter>
          </div>
        ) : null}
        <Form {...form}>
          <form
            hidden={!!pending}
            onSubmit={(event) =>
              form.handleSubmit((data) =>
                confirmStep ? setPending(data) : handleSubmit(data),
              )(event)
            }
            className="space-y-4"
          >
            {submitError && (
              <Alert variant="destructive">
                <AlertDescription>
                  {submitError}
                  。已保留本次填写内容；请保持原内容重试，避免重复登记。
                </AlertDescription>
              </Alert>
            )}
            <fieldset disabled={isSubmitting} className="space-y-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        {...field}
                        value={Number.isNaN(field.value) ? "" : field.value}
                        onChange={(event) =>
                          field.onChange(event.target.valueAsNumber)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="paymentDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <Label htmlFor="payment-date">日期</Label>
                    <DatePicker
                      date={field.value}
                      setDate={field.onChange}
                      triggerProps={{ id: "payment-date", name: "paymentDate" }}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="paymentMethod"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>方式</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="选择方式" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="bank">银行转账</SelectItem>
                        <SelectItem value="cash">现金</SelectItem>
                        <SelectItem value="check">支票</SelectItem>
                        <SelectItem value="other">其他</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>备注</FormLabel>
                    <FormControl>
                      <Input placeholder="例如: 定金, 尾款" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </fieldset>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => handleOpenChange(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={!form.formState.isValid || isSubmitting}
              >
                {isSubmitting
                  ? "提交中..."
                  : confirmStep
                    ? "下一步：确认"
                    : "确认记录"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
