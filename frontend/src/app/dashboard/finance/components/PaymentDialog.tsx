'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PaymentType } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const paymentSchema = z.object({
  amount: z.number().min(0.01, '金额必须大于0'),
  paymentDate: z.date(),
  paymentMethod: z.string().min(1, '请选择支付方式'),
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
  onSubmit: (data: PaymentSubmitData) => Promise<void>;
}

export function PaymentDialog({
  open,
  onOpenChange,
  type,
  contractNo,
  remainingAmount,
  onSubmit,
}: PaymentDialogProps) {
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: remainingAmount, // Default to full remaining
      paymentDate: new Date(),
      paymentMethod: '',
      note: '',
    },
  });

  const handleSubmit = async (data: PaymentFormValues) => {
    await onSubmit(data);
    form.reset();
  };

  const title = type === PaymentType.PAYABLE ? '录入付款' : '录入收款';
  const label = type === PaymentType.PAYABLE ? '付款金额' : '收款金额';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mb-4">
          合同: <span className="font-medium text-foreground">{contractNo}</span>
          <br />
          待结金额: <span className="font-medium text-foreground">¥{remainingAmount.toLocaleString()}</span>
        </div>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{label}</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
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
                  <FormLabel>日期</FormLabel>
                  <DatePicker date={field.value} setDate={field.onChange} />
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
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
            <DialogFooter>
              <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>
                {form.formState.isSubmitting ? '提交中...' : '确认记录'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
