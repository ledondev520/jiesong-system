/**
 * Input: 商品数据
 * Output: 商品编辑对话框
 * Pos: 商品管理组件，支持录入报关名、HS编码、申报要素、规格、体积、重量等信息
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Product } from '@/types';
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

const productSchema = z.object({
  customsName: z.string().min(1, '请输入报关名称'),
  hsCode: z.string().optional(),
  declaration: z.string().optional(),
  description: z.string().optional(),
  specification: z.string().optional(),
  unit: z.string().optional(),
  packingSpec: z.string().optional(),
  grossWeight: z.number().min(0).optional().nullable(),
  netWeight: z.number().min(0).optional().nullable(),
  volume: z.number().min(0).optional().nullable(),
  // 尺寸信息（用于3D可视化）
  length: z.number().min(0).optional().nullable(),
  width: z.number().min(0).optional().nullable(),
  height: z.number().min(0).optional().nullable(),
});

type ProductFormValues = z.infer<typeof productSchema>;

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

export function ProductDialog({
  open,
  onOpenChange,
  product,
  onSubmit,
}: ProductDialogProps) {
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      customsName: '',
      hsCode: '',
      declaration: '',
      description: '',
      specification: '',
      unit: '',
      packingSpec: '',
      grossWeight: null,
      netWeight: null,
      volume: null,
      length: null,
      width: null,
      height: null,
    },
    values: product ? {
      customsName: product.customsName,
      hsCode: product.hsCode || '',
      declaration: product.declaration || '',
      description: product.description || '',
      specification: product.specification || '',
      unit: product.unit || '',
      packingSpec: product.packingSpec || '',
      grossWeight: product.grossWeight ?? null,
      netWeight: product.netWeight ?? null,
      volume: product.volume ?? null,
      length: product.length ?? null,
      width: product.width ?? null,
      height: product.height ?? null,
    } : undefined,
  });

  /**
   * 职责：提交商品表单并做空值标准化后交由外层保存。
   * 思路：
   * 1. 统一将数值空值转换为 null，避免后端收到空字符串；
   * 2. 调用上层 onSubmit 持久化；
   * 3. 提交成功后重置表单。
   * @param data 表单原始值
   * @returns Promise<void>
   */
  const handleSubmit = async (data: ProductFormValues): Promise<void> => {
    // 转换空值为 null
    const submitData = {
      ...data,
      grossWeight: data.grossWeight || null,
      netWeight: data.netWeight || null,
      volume: data.volume || null,
      length: data.length || null,
      width: data.width || null,
      height: data.height || null,
    };
    await onSubmit(submitData);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{product ? '编辑商品' : '新增商品'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="customsName"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>报关名称 *</FormLabel>
                    <FormControl>
                      <Input placeholder="请输入商品报关名" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="specification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>规格</FormLabel>
                    <FormControl>
                      <Input placeholder="例如: 800*800" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>单位</FormLabel>
                    <FormControl>
                      <Input placeholder="例如: 平方米, 个" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hsCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>HS编码</FormLabel>
                    <FormControl>
                      <Input placeholder="例如: 69072190" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="declaration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>申报要素</FormLabel>
                    <FormControl>
                      <Input placeholder="例如: 抛光瓷砖，釉面，600x600mm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 尺寸信息（用于3D可视化） */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">尺寸信息（用于3D装箱可视化）</h4>
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="length"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>长度 (mm)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="500" 
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="width"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>宽度 (mm)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="600" 
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="height"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>高度 (mm)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="700" 
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* 包装与重量信息 */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-medium mb-3">包装与重量信息</h4>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="packingSpec"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>包装规格</FormLabel>
                      <FormControl>
                        <Input placeholder="例如: 4片/箱, 10个/包" {...field} />
                      </FormControl>
                      <FormDescription>每箱/每包装多少件商品</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="grossWeight"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>毛重 (kg/箱)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          placeholder="0.00" 
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
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
                      <FormLabel>净重 (kg/箱)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.01"
                          placeholder="0.00" 
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="volume"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>体积 (CBM/箱)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          step="0.0001"
                          placeholder="0.0000" 
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : null)}
                        />
                      </FormControl>
                      <FormDescription>单箱商品的立方米数</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>备注</FormLabel>
                      <FormControl>
                        <Input placeholder="其他补充信息" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>
                {form.formState.isSubmitting ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
