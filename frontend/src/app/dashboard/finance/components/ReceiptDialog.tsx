/**
 * Input: 用户录入的到账金额与日期
 * Output: 无合同的收款记录（RECEIVABLE_RECEIPT），进入待分配池
 * Pos: 财务收款流程第一步 - 记录客户到账，不绑定具体合同
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { normalizeContractRef } from '@/lib/finance-note';

const receiptSchema = z.object({
  amount: z.number().min(0.01, '金额必须大于0'),
  currency: z.string().min(1, '请选择币种'),
  paymentDate: z.date(),
  paymentMethod: z.string().min(1, '请选择到账方式'),
  customerName: z.string().min(1, '请填写客户名称'),
  contractRef: z
    .string()
    .optional()
    .transform((value) => normalizeContractRef(value))
    .refine((value) => !value || /^EXP\d{5,}$/.test(value), '合同号格式应为 EXP250024'),
  note: z.string().optional(),
});

interface ReceiptFormValues {
  amount: number;
  currency: string;
  paymentDate: Date;
  paymentMethod: string;
  customerName: string;
  contractRef?: string;
  note?: string;
}
export type ReceiptSubmitData = ReceiptFormValues;

interface ReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ReceiptSubmitData) => Promise<void>;
}

/**
 * 职责：录入一笔客户到账款（不绑定合同，进入待分配池）
 * 思路：表单收集金额、币种、日期、方式、备注后提交
 */
export function ReceiptDialog({ open, onOpenChange, onSubmit }: ReceiptDialogProps) {
  const form = useForm<ReceiptFormValues>({
    resolver: zodResolver(receiptSchema),
    defaultValues: {
      amount: 0,
      currency: 'USD',
      paymentDate: new Date(),
      paymentMethod: '',
      customerName: 'Sp food trading LLC',
      contractRef: '',
      note: '',
    },
  });

  const handleSubmit = async (data: ReceiptFormValues) => {
    await onSubmit(data);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>记录客户到账</DialogTitle>
          <DialogDescription>
            记录客户打款金额，之后可以分配到具体合同
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="flex gap-3">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>到账金额</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem className="w-24">
                    <FormLabel>币种</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="CNY">CNY</SelectItem>
                        <SelectItem value="EUR">EUR</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="paymentDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <Label htmlFor="receipt-date">到账日期</Label>
                  <DatePicker
                    date={field.value}
                    setDate={field.onChange}
                    triggerProps={{ id: 'receipt-date', name: 'paymentDate' }}
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
                  <FormLabel>到账方式</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="选择方式" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="wire">电汇 (T/T)</SelectItem>
                      <SelectItem value="bank">银行转账</SelectItem>
                      <SelectItem value="lc">信用证 (L/C)</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                      <SelectItem value="other">其他</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="customerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>客户名称</FormLabel>
                  <FormControl>
                    <Input placeholder="例如: Sp food trading LLC" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contractRef"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>合同号（选填）</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="例如: EXP250024"
                      {...field}
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    填写后系统会按统一备注规范写入，供收款池自动匹配使用。
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>备注（选填）</FormLabel>
                  <FormControl>
                    <Input placeholder="例如: 客户首笔回款, 尾款到账" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="submit"
                disabled={!form.formState.isValid || form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? '记录中...' : '确认到账'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
