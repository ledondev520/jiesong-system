/**
 * Input: 报关单初始数据、提交动作
 * Output: 报关单创建/编辑共享表单
 * Pos: 报关单管理共享表单组件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type {
  CustomsDeclaration,
  CustomsDeclarationStatus,
} from '@/types';
import {
  Form,
  FormControl,
  FormDescription,
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
import { Plus, Trash2, FileUp } from 'lucide-react';
import { customsDeclarationStatusOptions } from './CustomsDeclarationStatusBadge';
import type {
  CustomsDeclarationItemInput,
  CustomsDeclarationUpsertInput,
} from '@/services/customsDeclaration.service';
import { BatchImportDialog } from '@/components/dialog/BatchImportDialog';
import type { BatchHsCodeMatchResult } from '@/services/hsCode.service';
import { toast } from 'sonner';

const declarationItemSchema = z.object({
  productName: z.string().trim().min(1, '请输入商品名称'),
  hsCode: z.string().trim().min(1, '请输入 HS 编码'),
  quantity: z.string().trim().min(1, '请输入申报数量'),
  unit: z.string().optional(),
  unitPrice: z.string().trim().min(1, '请输入单价'),
  totalPrice: z.string().optional(),
});

const declarationFormSchema = z.object({
  declarationNo: z.string().trim().min(1, '请输入报关单号'),
  status: z.string().trim().min(1, '请选择状态'),
  exporter: z.string().trim().min(1, '请输入发货人'),
  consignee: z.string().trim().min(1, '请输入收货人'),
  destinationCountry: z.string().trim().min(1, '请输入目的国'),
  portOfLoading: z.string().trim().min(1, '请输入起运港'),
  portOfDestination: z.string().trim().min(1, '请输入目的港'),
  transportMode: z.string().optional(),
  declarationDate: z.string().trim().min(1, '请选择申报日期'),
  releaseDate: z.string().optional(),
  currency: z.string().trim().min(1, '请输入成交币种'),
  totalAmount: z.string().trim().min(1, '请输入货值总额'),
  totalPackages: z.string().trim().min(1, '请输入总件数'),
  grossWeight: z.string().trim().min(1, '请输入毛重'),
  netWeight: z.string().trim().min(1, '请输入净重'),
  remarks: z.string().optional(),
  items: z.array(declarationItemSchema).min(1, '至少录入一条商品明细'),
});

type CustomsDeclarationFormValues = z.infer<typeof declarationFormSchema>;

const defaultItem = {
  productName: '',
  hsCode: '',
  quantity: '',
  unit: '',
  unitPrice: '',
  totalPrice: '',
};

const toText = (value?: string | number | null) =>
  value === undefined || value === null ? '' : String(value);

const toOptionalText = (value?: string | null) => value ?? '';

const toOptionalNumber = (value?: string) => {
  const normalized = value?.trim() ?? '';
  return normalized ? Number(normalized) : null;
};

const buildDefaultValues = (
  declaration?: CustomsDeclaration | null,
): CustomsDeclarationFormValues => ({
  declarationNo: declaration?.declarationNo ?? '',
  status: declaration?.status ?? 'DRAFT',
  exporter: declaration?.exporter ?? '',
  consignee: declaration?.consignee ?? '',
  destinationCountry: declaration?.destinationCountry ?? '',
  portOfLoading: declaration?.portOfLoading ?? '',
  portOfDestination: declaration?.portOfDestination ?? '',
  transportMode: declaration?.transportMode ?? '',
  declarationDate: declaration?.declarationDate ?? '',
  releaseDate: toOptionalText(declaration?.releaseDate),
  currency: declaration?.currency ?? '',
  totalAmount: toText(declaration?.totalAmount),
  totalPackages: toText(declaration?.totalPackages),
  grossWeight: toText(declaration?.grossWeight),
  netWeight: toText(declaration?.netWeight),
  remarks: declaration?.remarks ?? '',
  items:
    declaration?.items?.length
      ? declaration.items.map((item) => ({
          productName: item.productName ?? '',
          hsCode: item.hsCode ?? '',
          quantity: toText(item.quantity),
          unit: item.unit ?? '',
          unitPrice: toText(item.unitPrice),
          totalPrice: toText(item.totalPrice),
        }))
      : [defaultItem],
});

const normalizeItem = (
  item: CustomsDeclarationFormValues['items'][number],
): CustomsDeclarationItemInput => ({
  productName: item.productName.trim(),
  hsCode: item.hsCode.trim(),
  quantity: Number(item.quantity),
  unit: item.unit?.trim() ?? '',
  unitPrice: Number(item.unitPrice),
  totalPrice: toOptionalNumber(item.totalPrice),
});

const normalizePayload = (
  values: CustomsDeclarationFormValues,
): CustomsDeclarationUpsertInput => ({
  declarationNo: values.declarationNo.trim(),
  status: values.status.trim() as CustomsDeclarationStatus,
  exporter: values.exporter.trim(),
  consignee: values.consignee.trim(),
  destinationCountry: values.destinationCountry.trim(),
  portOfLoading: values.portOfLoading.trim(),
  portOfDestination: values.portOfDestination.trim(),
  transportMode: values.transportMode?.trim() ?? '',
  declarationDate: values.declarationDate.trim(),
  releaseDate: values.releaseDate?.trim() ? values.releaseDate.trim() : null,
  currency: values.currency.trim(),
  totalAmount: Number(values.totalAmount),
  totalPackages: Number(values.totalPackages),
  grossWeight: Number(values.grossWeight),
  netWeight: Number(values.netWeight),
  remarks: values.remarks?.trim() ?? '',
  items: values.items.map(normalizeItem),
});

interface CustomsDeclarationFormProps {
  declaration?: CustomsDeclaration | null;
  submitLabel: string;
  onSubmit: (payload: CustomsDeclarationUpsertInput) => Promise<void>;
}

export function CustomsDeclarationForm({
  declaration,
  submitLabel,
  onSubmit,
}: CustomsDeclarationFormProps) {
  const [batchImportOpen, setBatchImportOpen] = useState(false);
  const form = useForm<CustomsDeclarationFormValues>({
    resolver: zodResolver(declarationFormSchema),
    defaultValues: buildDefaultValues(declaration),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  useEffect(() => {
    form.reset(buildDefaultValues(declaration));
  }, [declaration, form]);

  const handleBatchImportComplete = (results: BatchHsCodeMatchResult[]) => {
    results.forEach((result) => {
      if (result.match) {
        append({
          productName: result.match.productName,
          hsCode: result.match.hsCode,
          quantity: '1',
          unit: result.match.unit || '',
          unitPrice: '0',
          totalPrice: '0',
        });
      }
    });
    toast.success(`已导入 ${results.length} 个商品`);
  };

  const handleSubmit = async (values: CustomsDeclarationFormValues) => {
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
              name="declarationNo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>报关单号</FormLabel>
                  <FormControl>
                    <Input placeholder="例如: CUS-2026-001" {...field} />
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
                      {customsDeclarationStatusOptions
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
              name="exporter"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>发货人</FormLabel>
                  <FormControl>
                    <Input placeholder="出口方 / 发货人名称" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="consignee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>收货人</FormLabel>
                  <FormControl>
                    <Input placeholder="海外客户 / 收货人名称" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="destinationCountry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>目的国</FormLabel>
                  <FormControl>
                    <Input placeholder="例如: 秘鲁" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="transportMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>运输方式</FormLabel>
                  <FormControl>
                    <Input placeholder="例如: SEA / AIR / RAIL" {...field} />
                  </FormControl>
                  <FormDescription>可选，用于标记当前报关运输方式。</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="portOfLoading"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>起运港</FormLabel>
                  <FormControl>
                    <Input placeholder="例如: 上海" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="portOfDestination"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>目的港</FormLabel>
                  <FormControl>
                    <Input placeholder="例如: Callao" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="declarationDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>申报日期</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="releaseDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>放行日期</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormDescription>可选，已放行后补录。</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>金额与重量</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <FormField
              control={form.control}
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>成交币种</FormLabel>
                  <FormControl>
                    <Input placeholder="USD" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="totalAmount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>货值总额</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="totalPackages"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>总件数</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" placeholder="0" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="grossWeight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>毛重 (kg)</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="netWeight"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>净重 (kg)</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="remarks"
              render={({ field }) => (
                <FormItem className="md:col-span-2 lg:col-span-3">
                  <FormLabel>备注</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="例如: 查验节点、放行状态、异常说明"
                      className="min-h-24"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>商品明细</CardTitle>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => setBatchImportOpen(true)}
              >
                <FileUp className="mr-2 h-4 w-4" />
                批量导入
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => append({ ...defaultItem })}
              >
                <Plus className="mr-2 h-4 w-4" />
                新增商品行
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.length > 0 && (
              <div className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
                已添加 {fields.length} 个商品，继续添加或提交报关单
              </div>
            )}
            {fields.map((field, index) => (
              <div
                key={field.id}
                className="grid gap-4 rounded-xl border border-border/70 p-4 lg:grid-cols-12"
              >
                <div className="lg:col-span-3">
                  <FormField
                    control={form.control}
                    name={`items.${index}.productName`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>商品名称</FormLabel>
                        <FormControl>
                          <Input placeholder="请输入商品名称" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="lg:col-span-2">
                  <FormField
                    control={form.control}
                    name={`items.${index}.hsCode`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>商品 HS 编码</FormLabel>
                        <FormControl>
                          <Input placeholder="69072190" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="lg:col-span-2">
                  <FormField
                    control={form.control}
                    name={`items.${index}.quantity`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>申报数量</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" placeholder="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="lg:col-span-2">
                  <FormField
                    control={form.control}
                    name={`items.${index}.unit`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>单位</FormLabel>
                        <FormControl>
                          <Input placeholder="箱 / 件 / 托" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="lg:col-span-2">
                  <FormField
                    control={form.control}
                    name={`items.${index}.unitPrice`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>单价</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" placeholder="0.00" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="lg:col-span-1">
                  <FormField
                    control={form.control}
                    name={`items.${index}.totalPrice`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>总价</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" placeholder="可选" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex items-end justify-end lg:col-span-12">
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-xl text-destructive"
                    aria-label={`删除商品 ${index + 1}`}
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除当前商品
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" className="rounded-xl" disabled={form.formState.isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      </form>

      <BatchImportDialog
        open={batchImportOpen}
        onOpenChange={setBatchImportOpen}
        onImportComplete={handleBatchImportComplete}
      />
    </Form>
  );
}
