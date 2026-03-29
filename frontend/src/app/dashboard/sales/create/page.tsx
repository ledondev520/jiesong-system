'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Product, Store } from '@/types';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Plus, Trash } from 'lucide-react';
import { toast } from 'sonner';
import { salesService } from '@/services/sales.service';
import { productService } from '@/services/product.service';
import { storeService } from '@/services/store.service';
import { DEFAULT_EXCHANGE_RATE, DEFAULT_PROFIT_RATE } from '@/lib/constants';
import { PageHeader } from '@/components/layout/PageHeader';

const salesSchema = z.object({
  contractNo: z.string().optional(),
  signedAt: z.date().optional(),
  exchangeRate: z.number().min(0.1),
  note: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1, '请选择商品'),
    storeId: z.string().min(1, '请选择门店'),
    quantity: z.number().min(0.01, '数量必填'),
    unit: z.string().optional(),
    costPrice: z.number().min(0, '成本必填'),
    sellingPrice: z.number().min(0, '售价必填'),
    note: z.string().optional(),
  })).min(1, '至少添加一项商品'),
});

type SalesFormValues = z.infer<typeof salesSchema>;

export default function CreateSalesPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [contractNoLoading, setContractNoLoading] = useState(true);

  const form = useForm<SalesFormValues>({
    resolver: zodResolver(salesSchema),
    defaultValues: {
      contractNo: '',
      signedAt: undefined,
      exchangeRate: DEFAULT_EXCHANGE_RATE,
      note: '',
      items: [{ productId: '', storeId: '', quantity: 0, unit: '', costPrice: 0, sellingPrice: 0, note: '' }],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const watchItems = useWatch({ control: form.control, name: 'items' });
  const exchangeRate = useWatch({ control: form.control, name: 'exchangeRate' });

  useEffect(() => {
    if (!form.getValues('signedAt')) {
      form.setValue('signedAt', new Date(), { shouldDirty: false });
    }
  }, [form]);

  // Calculate Total
  const totalAmount = watchItems.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.sellingPrice) || 0);
  }, 0);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [productsRes, storesRes, contractNoRes] = await Promise.all([
          productService.getAll({ pageSize: 100, lite: true }),
          storeService.getAll({ pageSize: 100, lite: true }),
          salesService.getNextContractNo(),
        ]);
        setProducts(productsRes.data?.items || []);
        setStores(storesRes.data?.items || []);
        if (contractNoRes.data?.contractNo) {
          form.setValue('contractNo', contractNoRes.data.contractNo);
        }
      } catch (error) {
        console.error('加载数据失败:', error);
        toast.error('加载商品和门店数据失败');
      } finally {
        setContractNoLoading(false);
      }
    };
    loadData();
  }, [form]);

  // Auto-calculate selling price when cost price changes
  const handleCostChange = (index: number, cost: number) => {
    const price = salesService.calculatePrice(cost, exchangeRate, DEFAULT_PROFIT_RATE);
    // We need to update the form value for sellingPrice
    const currentItem = form.getValues(`items.${index}`);
    update(index, { ...currentItem, costPrice: cost, sellingPrice: price });
  };

  const onSubmit = async (data: SalesFormValues) => {
    try {
      const createResult = await salesService.create({
        exchangeRate: data.exchangeRate,
        signedAt: data.signedAt?.toISOString(),
        note: data.note,
      });

      const contractId = createResult.data?.id;
      if (!contractId) {
        throw new Error('创建合同失败：未返回合同ID');
      }

      await Promise.all(
        data.items.map((item) =>
          salesService.addItem(contractId, {
            productId: item.productId,
            storeId: item.storeId,
            quantity: item.quantity,
            unit: item.unit,
            costPrice: item.costPrice,
            sellingPrice: item.sellingPrice,
            note: item.note,
          })
        )
      );

      toast.success('出口合同创建成功');
      router.push(`/dashboard/sales/${contractId}`);
    } catch (error) {
      console.error('创建出口合同失败:', error);
      toast.error('创建失败');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <PageHeader
        title="创建出口合同"
        description="创建新的销售合同并自动计算报价。"
      />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
          <Card>
            <CardHeader>
              <CardTitle>合同详情</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-3">
              <FormField
                control={form.control}
                name="contractNo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>合同编号</FormLabel>
                    <FormControl>
                      <Input {...field} disabled={contractNoLoading} />
                    </FormControl>
                    <FormDescription>自动生成</FormDescription>
                  </FormItem>
                )}
              />

                <FormField
                  control={form.control}
                  name="signedAt"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                    <Label htmlFor="sales-signed-at" className="mb-1.5">签订日期</Label>
                    <DatePicker
                      date={field.value}
                      setDate={field.onChange}
                      triggerProps={{ id: 'sales-signed-at', name: 'signedAt' }}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="exchangeRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>汇率</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormDescription>默认: {DEFAULT_EXCHANGE_RATE}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>销售明细</CardTitle>
              <div className="text-lg font-bold">
                总计: ${totalAmount.toLocaleString()}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="grid gap-4 md:grid-cols-12 items-end border-b pb-4">
                  <div className="md:col-span-3">
                    <FormField
                      control={form.control}
                      name={`items.${index}.productId`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={index !== 0 ? "sr-only" : ""}>商品</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="选择商品" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {products.map(p => (
                                <SelectItem key={p.id} value={p.id}>{p.customsName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="md:col-span-3">
                    <FormField
                      control={form.control}
                      name={`items.${index}.storeId`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={index !== 0 ? "sr-only" : ""}>门店</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="选择门店" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {stores.map(s => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name={`items.${index}.quantity`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={index !== 0 ? "sr-only" : ""}>数量</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name={`items.${index}.costPrice`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={index !== 0 ? "sr-only" : ""}>成本 (¥)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={(e) => handleCostChange(index, parseFloat(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <FormField
                      control={form.control}
                      name={`items.${index}.sellingPrice`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className={index !== 0 ? "sr-only" : ""}>售价 ($)</FormLabel>
                          <div className="flex gap-2">
                             <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                              <Trash className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              ))}
              
              <Button type="button" variant="outline" onClick={() => append({ productId: '', storeId: '', quantity: 0, unit: '', costPrice: 0, sellingPrice: 0, note: '' })}>
                <Plus className="h-4 w-4 mr-2" /> 添加商品
              </Button>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => router.back()}>取消</Button>
            <Button 
              type="submit" 
              size="lg"
              disabled={!form.formState.isValid || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? '提交中...' : '创建合同'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
