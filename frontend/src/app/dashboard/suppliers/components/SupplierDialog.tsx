'use client';

import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Supplier } from '@/types';
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
  FormDescription,
} from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash } from 'lucide-react';

const supplierSchema = z.object({
  name: z.string().min(1, '公司名称必填'),
  shortName: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email('邮箱格式不正确').optional().or(z.literal('')),
  address: z.string().optional(),
  bankAccount: z.string().optional(),
  hasQualityIssue: z.boolean(),
  qualityNote: z.string().optional(),
  aliases: z.array(z.object({
    alias: z.string().min(1, '别名不能为空')
  })).optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;

interface SupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier?: Supplier | null;
  onSubmit: (data: any) => Promise<void>;
}

export function SupplierDialog({
  open,
  onOpenChange,
  supplier,
  onSubmit,
}: SupplierDialogProps) {
  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      name: '',
      shortName: '',
      contactName: '',
      contactPhone: '',
      contactEmail: '',
      address: '',
      bankAccount: '',
      hasQualityIssue: false,
      qualityNote: '',
      aliases: [],
    },
    values: supplier ? {
      name: supplier.name,
      shortName: supplier.shortName || '',
      contactName: supplier.contactName || '',
      contactPhone: supplier.contactPhone || '',
      contactEmail: supplier.contactEmail || '',
      address: supplier.address || '',
      bankAccount: supplier.bankAccount || '',
      hasQualityIssue: supplier.hasQualityIssue,
      qualityNote: supplier.qualityNote || '',
      aliases: supplier.aliases ? supplier.aliases.map(a => ({ alias: a.alias })) : [],
    } : undefined,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "aliases",
  });

  const handleSubmit = async (data: SupplierFormValues) => {
    await onSubmit(data);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{supplier ? '编辑供应商' : '新增供应商'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>公司名称 *</FormLabel>
                    <FormControl>
                      <Input placeholder="工商注册名称" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="shortName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>简称</FormLabel>
                    <FormControl>
                      <Input placeholder="内部称呼" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Aliases Section */}
            <div>
              <FormLabel className="flex items-center justify-between mb-2">
                <span>供应商别名 (昵称)</span>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => append({ alias: '' })}
                >
                  <Plus className="h-3 w-3 mr-1" /> 添加
                </Button>
              </FormLabel>
              <div className="space-y-2">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-2">
                    <FormField
                      control={form.control}
                      name={`aliases.${index}.alias`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormControl>
                            <Input placeholder="例如: 黎总" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                    >
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
                {fields.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">暂无别名。</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="contactName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>联系人</FormLabel>
                    <FormControl>
                      <Input placeholder="姓名" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <FormField
                control={form.control}
                name="contactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>电话</FormLabel>
                    <FormControl>
                      <Input placeholder="手机或座机" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

             <FormField
                control={form.control}
                name="contactEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>邮箱</FormLabel>
                    <FormControl>
                      <Input placeholder="电子邮箱" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

             <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>地址</FormLabel>
                    <FormControl>
                      <Input placeholder="公司地址" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="bankAccount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>银行账号</FormLabel>
                    <FormControl>
                      <Input placeholder="开户行及账号" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

            <div className="rounded-lg border p-4 bg-muted/20">
              <FormField
                control={form.control}
                name="hasQualityIssue"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel className="text-destructive font-semibold">
                        质量问题标记
                      </FormLabel>
                      <FormDescription>
                        如果该供应商出现过质量问题，请勾选此项。
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              
              {form.watch('hasQualityIssue') && (
                <FormField
                  control={form.control}
                  name="qualityNote"
                  render={({ field }) => (
                    <FormItem className="mt-4">
                      <FormLabel>问题描述</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="请描述具体的质量问题..." 
                          className="resize-none" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <DialogFooter>
              <Button type="submit">保存供应商</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
