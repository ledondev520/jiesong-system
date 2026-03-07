/**
 * Input: 退税单初始数据、提交动作
 * Output: 退税单创建/编辑共享表单
 * Pos: 退税管理共享表单组件
 */

'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { TaxRefund, TaxRefundStatus } from '@/types';
import type { TaxRefundUpsertInput } from '@/services/taxRefund.service';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { taxRefundStatusOptions } from './TaxRefundStatusBadge';

const formSchema = z.object({
  refundNo: z.string().trim().min(1, '请输入退税单号'),
  status: z.string().trim().min(1, '请选择状态'),
  salesContractId: z.string().trim().min(1, '请输入出口合同 ID'),
  customsDeclarationId: z.string().trim().min(1, '请输入报关单 ID'),
  forexVerificationId: z.string().optional(),
  declaredAmount: z.string().trim().min(1, '请输入申报金额'),
  refundableAmount: z.string().trim().min(1, '请输入可退金额'),
  refundedAmount: z.string().trim().min(1, '请输入已退金额'),
  appliedAt: z.string().trim().min(1, '请选择申请日期'),
  refundedAt: z.string().optional(),
  note: z.string().optional(),
});

type TaxRefundFormValues = z.infer<typeof formSchema>;

const toText = (value?: string | number | null) =>
  value === undefined || value === null ? '' : String(value);

const buildDefaultValues = (taxRefund?: TaxRefund | null): TaxRefundFormValues => ({
  refundNo: taxRefund?.refundNo ?? '',
  status: taxRefund?.status ?? 'DRAFT',
  salesContractId: taxRefund?.salesContractId ?? '',
  customsDeclarationId: taxRefund?.customsDeclarationId ?? '',
  forexVerificationId: taxRefund?.forexVerificationId ?? '',
  declaredAmount: toText(taxRefund?.declaredAmount),
  refundableAmount: toText(taxRefund?.refundableAmount),
  refundedAmount: toText(taxRefund?.refundedAmount),
  appliedAt: taxRefund?.appliedAt ?? '',
  refundedAt: taxRefund?.refundedAt ?? '',
  note: taxRefund?.note ?? '',
});

const normalizePayload = (values: TaxRefundFormValues): TaxRefundUpsertInput => ({
  refundNo: values.refundNo.trim(),
  status: values.status.trim() as Exclude<TaxRefundStatus, 'ALL'>,
  salesContractId: values.salesContractId.trim(),
  customsDeclarationId: values.customsDeclarationId.trim(),
  forexVerificationId: values.forexVerificationId?.trim() ? values.forexVerificationId.trim() : null,
  declaredAmount: Number(values.declaredAmount),
  refundableAmount: Number(values.refundableAmount),
  refundedAmount: Number(values.refundedAmount),
  appliedAt: values.appliedAt.trim(),
  refundedAt: values.refundedAt?.trim() ? values.refundedAt.trim() : null,
  note: values.note?.trim() ?? '',
});

interface TaxRefundFormProps {
  taxRefund?: TaxRefund | null;
  submitLabel: string;
  onSubmit: (payload: TaxRefundUpsertInput) => Promise<void>;
}

export function TaxRefundForm({ taxRefund, submitLabel, onSubmit }: TaxRefundFormProps) {
  const form = useForm<TaxRefundFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaultValues(taxRefund),
  });

  useEffect(() => {
    form.reset(buildDefaultValues(taxRefund));
  }, [form, taxRefund]);

  const handleSubmit = async (values: TaxRefundFormValues) => {
    await onSubmit(normalizePayload(values));
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>基础信息</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="refundNo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>退税单号</FormLabel>
                  <FormControl>
                    <Input placeholder="例如: TR-20260307-01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>状态</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="选择状态" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {taxRefundStatusOptions
                        .filter((option) => option.value !== 'ALL')
                        .map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="salesContractId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>出口合同 ID</FormLabel>
                  <FormControl>
                    <Input placeholder="例如: sc-1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="customsDeclarationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>报关单 ID</FormLabel>
                  <FormControl>
                    <Input placeholder="例如: cd-1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="forexVerificationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>核销记录 ID</FormLabel>
                  <FormControl>
                    <Input placeholder="例如: fv-1" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="appliedAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>申请日期</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="declaredAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>申报金额</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="refundableAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>可退金额</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="refundedAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>已退金额</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="refundedAt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>到账日期</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>备注</FormLabel>
                  <FormControl>
                    <Textarea rows={4} placeholder="补充当前批次进度、缺口或异常说明" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" className="rounded-xl">
            {submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
