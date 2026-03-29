'use client';

/**
 * Input: purchaseService, supplierService, productService
 * Output: 创建采购合同页面
 * Pos: 采购合同创建入口
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Product, Supplier } from '@/types';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Wand2, Plus, Trash, Eye, FileText, Loader2, UserPlus, Check, ChevronsUpDown, Star } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  ParsedQuoteItem,
  PurchaseCreatePayload,
  purchaseService,
} from '@/services/purchase.service';
import { supplierService } from '@/services/supplier.service';
import { productService } from '@/services/product.service';
import { PageHeader } from '@/components/layout/PageHeader';
import { PriceGuard } from '@/components/purchase/PriceGuard';

// ============== Schema ==============
const purchaseSchema = z.object({
  supplierId: z.string().min(1, '请选择供应商'),
  contractNo: z.string().optional(),
  signedAt: z.date().optional(),
  taxRate: z.number().min(0).max(100),
  note: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1, '请选择商品'),
    quantity: z.number().min(0.01, '数量必须大于0'),
    unitPrice: z.number().min(0, '单价必须大于等于0'),
    unit: z.string().optional(),
    note: z.string().optional(),
  })).min(1, '至少添加一项商品'),
});

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

// ============== 供应商推荐类型 ==============
interface RecommendedSupplier extends Supplier {
  isRecommended?: boolean;
  purchaseCount?: number;
}

export default function CreatePurchasePage() {
  const router = useRouter();
  
  // 基础数据
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [contractNoLoading, setContractNoLoading] = useState(true);
  
  // 供应商 Combobox
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  
  // 推荐供应商（根据选中商品）
  const [recommendedSupplierIds, setRecommendedSupplierIds] = useState<Set<string>>(new Set());
  
  // 新增供应商弹窗
  const [showNewSupplierDialog, setShowNewSupplierDialog] = useState(false);
  const [newSupplierForm, setNewSupplierForm] = useState({
    name: '', contactName: '', contactPhone: '', address: '',
    taxId: '', bankName: '', bankAccount: '',
  });
  const [savingSupplier, setSavingSupplier] = useState(false);
  
  // AI 解析
  const [parseText, setParseText] = useState('');
  const [isParsing, setIsParsing] = useState(false);

  // 表单
  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      supplierId: '',
      contractNo: '',
      signedAt: undefined,
      taxRate: 13,
      note: '',
      items: [{ productId: '', quantity: 0, unitPrice: 0, unit: '', note: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const watchItems = useWatch({ control: form.control, name: 'items' });
  const watchSupplierId = useWatch({ control: form.control, name: 'supplierId' });

  useEffect(() => {
    if (!form.getValues('signedAt')) {
      form.setValue('signedAt', new Date(), { shouldDirty: false });
    }
  }, [form]);

  // 计算总价
  const totalAmount = watchItems.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  }, 0);

  // ============== 加载数据 ==============
  useEffect(() => {
    const loadData = async () => {
      try {
        const [suppliersRes, productsRes, contractNoRes] = await Promise.all([
          supplierService.getAll({ pageSize: 100, lite: true }),
          productService.getAll({ pageSize: 100, lite: true }),
          purchaseService.getNextContractNo(),
        ]);
        setSuppliers(suppliersRes.data?.items || []);
        setProducts(productsRes.data?.items || []);
        if (contractNoRes.data?.contractNo) {
          form.setValue('contractNo', contractNoRes.data.contractNo);
        }
      } catch (error) {
        console.error('加载数据失败:', error);
        toast.error('加载数据失败');
      } finally {
        setContractNoLoading(false);
      }
    };
    loadData();
  }, [form]);

  // ============== 根据选中商品推荐供应商 ==============
  useEffect(() => {
    const selectedProductIds = watchItems
      .map(item => item.productId)
      .filter(id => id && id.length > 0);
    
    if (selectedProductIds.length === 0) {
      setRecommendedSupplierIds(new Set());
      return;
    }
    
    // 查询曾经供应过这些商品的供应商
    const fetchRecommendedSuppliers = async () => {
      try {
        const res = await purchaseService.getSuppliersByProducts(selectedProductIds);
        if (res.data?.supplierIds) {
          setRecommendedSupplierIds(new Set(res.data.supplierIds));
        }
      } catch {
        // 静默失败，推荐功能是辅助性的
      }
    };
    
    fetchRecommendedSuppliers();
  }, [watchItems]);

  // ============== 供应商列表（推荐优先） ==============
  const sortedSuppliers = useMemo((): RecommendedSupplier[] => {
    const filtered = supplierSearch.trim()
      ? suppliers.filter(s =>
          s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
          (s.contactName && s.contactName.toLowerCase().includes(supplierSearch.toLowerCase()))
        )
      : suppliers;
    
    return filtered
      .map(s => ({
        ...s,
        isRecommended: recommendedSupplierIds.has(s.id),
      }))
      .sort((a, b) => {
        // 推荐的排在前面
        if (a.isRecommended && !b.isRecommended) return -1;
        if (!a.isRecommended && b.isRecommended) return 1;
        return a.name.localeCompare(b.name, 'zh-CN');
      });
  }, [suppliers, supplierSearch, recommendedSupplierIds]);

  // ============== 新增供应商 ==============
  const handleSaveNewSupplier = async () => {
    if (!newSupplierForm.name.trim()) {
      toast.error('请输入供应商名称');
      return;
    }
    setSavingSupplier(true);
    try {
      const response = await supplierService.create(newSupplierForm);
      const newSupplier = response.data;
      setSuppliers(prev => [newSupplier, ...prev]);
      form.setValue('supplierId', newSupplier.id);
      setShowNewSupplierDialog(false);
      setNewSupplierForm({ name: '', contactName: '', contactPhone: '', address: '', taxId: '', bankName: '', bankAccount: '' });
      toast.success('供应商创建成功');
    } catch {
      toast.error('创建供应商失败');
    } finally {
      setSavingSupplier(false);
    }
  };

  // ============== AI 解析 ==============
  const handleParse = async () => {
    if (!parseText) return;
    setIsParsing(true);
    try {
      const result = await purchaseService.parseQuote(parseText);
      if (result.success && result.data.length > 0) {
        const normalizedItems = result.data.map((item: ParsedQuoteItem) => {
          const matchedProduct =
            item.productId
              ? products.find((product) => product.id === item.productId)
              : products.find((product) => {
                  if (!item.productName) return false;
                  return product.customsName.toLowerCase().includes(item.productName.toLowerCase());
                });

          const fallbackNote = item.productName ? `AI识别商品：${item.productName}` : undefined;

          return {
            productId: matchedProduct?.id || item.productId || '',
            quantity: item.quantity || 0,
            unitPrice: item.unitPrice || 0,
            unit: item.unit || matchedProduct?.unit || '',
            note: item.note || fallbackNote || '',
          };
        });

        const unresolvedCount = normalizedItems.filter((item) => !item.productId).length;
        normalizedItems.forEach((item) => append(item));

        if (unresolvedCount > 0) {
          toast.success(`解析完成，已添加 ${normalizedItems.length} 条，${unresolvedCount} 条需手动选择商品`);
        } else {
          toast.success(`解析完成，已添加 ${normalizedItems.length} 条报价`);
        }
        setParseText('');
      } else {
        toast.error(result.message || '解析失败');
      }
    } catch {
      toast.error('解析失败');
    } finally {
      setIsParsing(false);
    }
  };

  // ============== 提交 ==============
  const onSubmit = async (data: PurchaseFormValues) => {
    try {
      // 转换数据格式以匹配后端期望
      const submitData: PurchaseCreatePayload = {
        supplierId: data.supplierId,
        contractNo: data.contractNo,
        signedAt: data.signedAt?.toISOString(),
        taxRate: data.taxRate,
        note: data.note,
        items: data.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unit: item.unit,
          note: item.note,
        })),
      };
      await purchaseService.create(submitData);
      toast.success('采购合同创建成功');
      router.push('/dashboard/contracts');
    } catch {
      toast.error('创建失败');
    }
  };

  // 当前选中的供应商
  const selectedSupplier = suppliers.find(s => s.id === watchSupplierId);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <PageHeader
        title="新增采购合同"
        description="先添加商品，系统会推荐曾供应过该商品的供应商"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* AI 智能录入 */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              AI 智能录入
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="purchase-ai-quote-input">采购报价原文</Label>
              <Textarea
                id="purchase-ai-quote-input"
                name="quoteText"
                placeholder="粘贴供应商报价信息 (如：'订购100平方米瓷砖，单价45元，供应商佛山陶瓷...')"
                value={parseText}
                onChange={(e) => setParseText(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
            <Button onClick={handleParse} disabled={isParsing || !parseText} variant="default" className="shadow-sm">
              {isParsing ? '解析中...' : '解析报价'}
            </Button>
          </CardContent>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
            {/* 采购明细 - 放在前面 */}
            <Card className="md:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>采购明细</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">先选择商品，系统会推荐供应商</p>
                </div>
                <div className="text-lg font-bold">总计: ¥{totalAmount.toLocaleString()}</div>
              </CardHeader>
              <CardContent className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid gap-4 md:grid-cols-12 items-end border-b pb-4">
                    <div className="md:col-span-4">
                      <FormField
                        control={form.control}
                        name={`items.${index}.productId`}
                        render={({ field }) => {
                          return (
                            <FormItem>
                              <FormLabel className={index !== 0 ? 'sr-only' : ''}>商品</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
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
                          );
                        }}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <FormField
                        control={form.control}
                        name={`items.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={index !== 0 ? 'sr-only' : ''}>数量</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
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
                            <FormLabel className={index !== 0 ? 'sr-only' : ''}>单位</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="件/箱/平米" />
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
                            <FormLabel className={index !== 0 ? 'sr-only' : ''}>单价 (¥)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" {...field} onChange={e => field.onChange(parseFloat(e.target.value) || 0)} />
                            </FormControl>
                            <FormMessage />
                            {/* 智能比价红绿灯：与历史成交价对比 */}
                            {watchItems[index]?.productId && (
                              <PriceGuard
                                productId={watchItems[index].productId}
                                currentPrice={watchItems[index]?.unitPrice || 0}
                                supplierId={form.watch('supplierId')}
                              />
                            )}
                          </FormItem>
                        )}
                      />
                    </div>
                    <div className="md:col-span-1 text-right pb-2 font-medium">
                      ¥{((watchItems[index]?.quantity || 0) * (watchItems[index]?.unitPrice || 0)).toLocaleString()}
                    </div>
                    <div className="md:col-span-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length <= 1}>
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

            {/* 合同详情 */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>合同信息</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-3">
                {/* 合同编号 */}
                <FormField
                  control={form.control}
                  name="contractNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>合同编号</FormLabel>
                      <FormControl>
                        {contractNoLoading ? (
                          <div className="flex items-center gap-2 h-10 px-3 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />生成中...
                          </div>
                        ) : (
                          <Input {...field} disabled className="font-mono" />
                        )}
                      </FormControl>
                      <FormDescription>格式：CG + 年份 + 5位序号</FormDescription>
                    </FormItem>
                  )}
                />

                {/* 供应商 Combobox */}
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <div className="flex items-center justify-between">
                        <FormLabel>供应商</FormLabel>
                        <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setShowNewSupplierDialog(true)}>
                          <UserPlus className="h-3 w-3 mr-1" />新增
                        </Button>
                      </div>
                      <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              role="combobox"
                              aria-expanded={supplierOpen}
                              className={cn('w-full justify-between font-normal', !field.value && 'text-muted-foreground')}
                            >
                              {selectedSupplier ? selectedSupplier.name : '搜索或选择供应商...'}
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="start">
                          <Command shouldFilter={false}>
                            <Label htmlFor="purchase-supplier-search" className="sr-only">
                              搜索供应商
                            </Label>
                            <CommandInput
                              id="purchase-supplier-search"
                              name="supplierSearch"
                              aria-label="搜索供应商"
                              placeholder="输入供应商名称搜索..."
                              value={supplierSearch}
                              onValueChange={setSupplierSearch}
                            />
                            <CommandList>
                              <CommandEmpty>
                                <div className="py-2">
                                  <p className="text-muted-foreground">未找到匹配供应商</p>
                                  <Button
                                    type="button"
                                    variant="link"
                                    size="sm"
                                    onClick={() => {
                                      setNewSupplierForm(prev => ({ ...prev, name: supplierSearch }));
                                      setShowNewSupplierDialog(true);
                                      setSupplierOpen(false);
                                    }}
                                  >
                                    {`+ 新增 "${supplierSearch}"`}
                                  </Button>
                                </div>
                              </CommandEmpty>
                              {recommendedSupplierIds.size > 0 && sortedSuppliers.some(s => s.isRecommended) && (
                                <CommandGroup heading="推荐供应商">
                                  {sortedSuppliers.filter(s => s.isRecommended).map(s => (
                                    <CommandItem
                                      key={s.id}
                                      value={s.id}
                                      onSelect={() => {
                                        field.onChange(s.id);
                                        setSupplierOpen(false);
                                        setSupplierSearch('');
                                      }}
                                    >
                                      <Check className={cn('mr-2 h-4 w-4', field.value === s.id ? 'opacity-100' : 'opacity-0')} />
                                      <Star className="mr-1 h-3 w-3 text-primary" />
                                      <span>{s.name}</span>
                                      {s.contactName && <span className="text-muted-foreground text-xs ml-2">({s.contactName})</span>}
                                      <Badge variant="secondary" className="ml-auto text-xs">曾供应</Badge>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                              <CommandGroup heading={recommendedSupplierIds.size > 0 ? '全部供应商' : '供应商列表'}>
                                {sortedSuppliers.filter(s => !s.isRecommended).map(s => (
                                  <CommandItem
                                    key={s.id}
                                    value={s.id}
                                    onSelect={() => {
                                      field.onChange(s.id);
                                      setSupplierOpen(false);
                                      setSupplierSearch('');
                                    }}
                                  >
                                    <Check className={cn('mr-2 h-4 w-4', field.value === s.id ? 'opacity-100' : 'opacity-0')} />
                                    <span>{s.name}</span>
                                    {s.contactName && <span className="text-muted-foreground text-xs ml-2">({s.contactName})</span>}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 签订日期 */}
                <FormField
                  control={form.control}
                  name="signedAt"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <Label htmlFor="purchase-signed-at" className="mb-1.5">
                        签订日期
                      </Label>
                      <DatePicker
                        date={field.value}
                        setDate={field.onChange}
                        triggerProps={{ id: 'purchase-signed-at', name: 'signedAt' }}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 税率 */}
                <FormField
                  control={form.control}
                  name="taxRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>税率 (%)</FormLabel>
                      <Select onValueChange={(val) => field.onChange(Number(val))} defaultValue={String(field.value)}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="选择税率" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">1% (小规模纳税人)</SelectItem>
                          <SelectItem value="13">13% (一般纳税人)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>用于生成购销合同</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* 合同预览 */}
                <div className="md:col-span-2">
                  <p className="text-sm font-medium leading-none">合同预览</p>
                  <div className="mt-2 p-4 bg-muted/30 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-primary" />
                      <div className="flex-1">
                        <p className="font-medium">购销合同</p>
                        <p className="text-sm text-muted-foreground">填写完成后，可在采购详情页生成并预览标准购销合同文档</p>
                      </div>
                      <Button type="button" variant="outline" disabled>
                        <Eye className="h-4 w-4 mr-2" />创建后预览
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 提交按钮 */}
            <div className="md:col-span-2 flex justify-end gap-4">
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

      {/* 新增供应商弹窗 */}
      <Dialog open={showNewSupplierDialog} onOpenChange={setShowNewSupplierDialog}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />新增供应商
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-supplier-name">供应商名称 *</Label>
              <Input
                id="new-supplier-name"
                name="name"
                value={newSupplierForm.name}
                onChange={(e) => setNewSupplierForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如：佛山市某某陶瓷有限公司"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-supplier-contact-name">联系人</Label>
                <Input
                  id="new-supplier-contact-name"
                  name="contactName"
                  value={newSupplierForm.contactName}
                  onChange={(e) => setNewSupplierForm(prev => ({ ...prev, contactName: e.target.value }))}
                  placeholder="例如：张经理"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-supplier-contact-phone">联系电话</Label>
                <Input
                  id="new-supplier-contact-phone"
                  name="contactPhone"
                  value={newSupplierForm.contactPhone}
                  onChange={(e) => setNewSupplierForm(prev => ({ ...prev, contactPhone: e.target.value }))}
                  placeholder="例如：138xxxxxxxx"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-supplier-address">公司地址</Label>
              <Input
                id="new-supplier-address"
                name="address"
                value={newSupplierForm.address}
                onChange={(e) => setNewSupplierForm(prev => ({ ...prev, address: e.target.value }))}
                placeholder="例如：广东省佛山市禅城区xxx"
              />
            </div>
            <div className="border-t pt-4">
              <p className="text-sm font-medium mb-3">开票信息（合同用）</p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-tax-id">纳税人识别号</Label>
                  <Input
                    id="new-supplier-tax-id"
                    name="taxId"
                    value={newSupplierForm.taxId}
                    onChange={(e) => setNewSupplierForm(prev => ({ ...prev, taxId: e.target.value }))}
                    placeholder="例如：91440000xxxxxxxxxx"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-bank-name">开户银行</Label>
                  <Input
                    id="new-supplier-bank-name"
                    name="bankName"
                    value={newSupplierForm.bankName}
                    onChange={(e) => setNewSupplierForm(prev => ({ ...prev, bankName: e.target.value }))}
                    placeholder="例如：中国银行佛山禅城支行"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-bank-account">银行账号</Label>
                  <Input
                    id="new-supplier-bank-account"
                    name="bankAccount"
                    value={newSupplierForm.bankAccount}
                    onChange={(e) => setNewSupplierForm(prev => ({ ...prev, bankAccount: e.target.value }))}
                    placeholder="例如：6217xxxxxxxxxxxxxxxx"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSupplierDialog(false)}>取消</Button>
            <Button onClick={handleSaveNewSupplier} disabled={savingSupplier}>
              {savingSupplier ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />保存中...</>) : '保存供应商'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
