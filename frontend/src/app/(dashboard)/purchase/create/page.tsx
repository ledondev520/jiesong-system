'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PurchaseStatus, Product, Supplier } from '@/types';
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
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Wand2, Plus, Trash, Upload, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { purchaseService } from '@/services/purchase.service';
import { supplierService } from '@/services/supplier.service';
import { productService } from '@/services/product.service';

const purchaseSchema = z.object({
  supplierId: z.string().min(1, '请选择供应商'),
  contractNo: z.string().optional(), // Auto-generated if empty
  signedAt: z.date().optional(),
  note: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1, '请选择商品'),
    quantity: z.coerce.number().min(0.01, '数量必须大于0'),
    unitPrice: z.coerce.number().min(0, '单价必须大于等于0'),
    unit: z.string().optional(),
    note: z.string().optional(),
  })).min(1, '至少添加一项商品'),
});

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

export default function CreatePurchasePage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [parseText, setParseText] = useState('');

  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      supplierId: '',
      contractNo: 'CG25' + Math.floor(Math.random() * 10000), // Mock Auto-gen
      signedAt: new Date(),
      note: '',
      items: [{ productId: '', quantity: 0, unitPrice: 0, unit: '', note: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const watchItems = useWatch({ control: form.control, name: 'items' });

  // Calculate Total
  const totalAmount = watchItems.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  }, 0);

  useEffect(() => {
    // Load Dependencies
    const loadData = async () => {
      // Mock loading
      setSuppliers([
        { id: '1', name: '佛山XX陶瓷有限公司', hasQualityIssue: false, isActive: true, createdAt: '', updatedAt: '' },
        { id: '2', name: '广州XX卫浴厂', hasQualityIssue: true, isActive: true, createdAt: '', updatedAt: '' },
      ]);
      setProducts([
        { id: '1', customsName: '800x800瓷砖', unit: '平方米', isActive: true, createdAt: '', updatedAt: '' },
        { id: '2', customsName: '洗手盆', unit: '个', isActive: true, createdAt: '', updatedAt: '' },
      ]);
    };
    loadData();
  }, []);

  const handleParse = async () => {
    if (!parseText) return;
    setIsParsing(true);
    try {
      // Mock Parse
      const result: any = await purchaseService.parseQuote(parseText);
      if (result.success) {
        // Append parsed items
        result.data.forEach((item: any) => {
          append({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unit: item.unit,
            note: item.note,
          });
        });
        toast.success('报价解析成功！');
        setParseText('');
      }
    } catch (e) {
      toast.error('解析失败');
    } finally {
      setIsParsing(false);
    }
  };

  const onSubmit = async (data: PurchaseFormValues) => {
    try {
      // await purchaseService.create(data);
      toast.success('采购合同创建成功');
      router.push('/purchase');
    } catch (error) {
      toast.error('创建失败');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">新增采购合同</h2>
          <p className="text-muted-foreground">填写采购信息，或使用 AI 辅助录入。</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-purple-500" />
              AI 智能录入
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea 
              placeholder="请粘贴供应商报价信息 (例如：'订购100平方米瓷砖，单价45元，供应商佛山陶瓷...')" 
              value={parseText}
              onChange={(e) => setParseText(e.target.value)}
              className="min-h-[100px]"
            />
            <Button 
              onClick={handleParse} 
              disabled={isParsing || !parseText}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isParsing ? '解析中...' : '解析报价'}
            </Button>
          </CardContent>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <Card className="md:col-span-2">
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
                        <Input {...field} disabled />
                      </FormControl>
                      <FormDescription>自动生成</FormDescription>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>供应商</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="选择供应商" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {suppliers.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="signedAt"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel className="mb-1.5">签订日期</FormLabel>
                      <DatePicker date={field.value} setDate={field.onChange} />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="md:col-span-3">
                   <FormLabel>合同附件</FormLabel>
                   <div className="mt-2 border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center text-muted-foreground hover:bg-muted/50 cursor-pointer transition-colors">
                      <Upload className="h-8 w-8 mb-2" />
                      <span className="text-sm">点击上传 PDF 或图片 (最大 50MB)</span>
                      <input type="file" className="hidden" accept=".pdf,image/*" />
                   </div>
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>采购明细</CardTitle>
                <div className="text-lg font-bold">
                  总计: ¥{totalAmount.toLocaleString()}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid gap-4 md:grid-cols-12 items-end border-b pb-4">
                    <div className="md:col-span-4">
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
                        name={`items.${index}.unit`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={index !== 0 ? "sr-only" : ""}>单位</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <FormField
                        control={form.control}
                        name={`items.${index}.unitPrice`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={index !== 0 ? "sr-only" : ""}>单价 (¥)</FormLabel>
                            <FormControl>
                              <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="md:col-span-1 text-right pb-2 font-medium">
                      ¥{((watchItems[index]?.quantity || 0) * (watchItems[index]?.unitPrice || 0)).toLocaleString()}
                    </div>

                    <div className="md:col-span-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                        <Trash className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                <Button type="button" variant="outline" onClick={() => append({ productId: '', quantity: 0, unitPrice: 0, unit: '', note: '' })}>
                  <Plus className="h-4 w-4 mr-2" /> 添加商品
                </Button>
              </CardContent>
            </Card>

            <div className="md:col-span-2 flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => router.back()}>取消</Button>
              <Button type="submit" size="lg">创建合同</Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
