/**
 * Input: purchaseService, supplierService, productService
 * Output: 创建采购合同页面
 * Pos: 采购合同创建入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

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
import {
  Wand2,
  Plus,
  Trash,
  Loader2,
  UserPlus,
  Check,
  ChevronsUpDown,
  Star,
  Save,
  FileText,
  Search,
  Package,
  Calculator,
  ArrowRight,
  ArrowLeft,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  ParsedQuoteItem,
  PurchaseCreatePayload,
  purchaseService,
  ProductPriceHistory,
} from '@/services/purchase.service';
import { supplierService } from '@/services/supplier.service';
import { productService } from '@/services/product.service';
import { contractTemplateService } from '@/services/contractTemplate.service';
import { ContractTemplate } from '@/types';
import { PageHeader } from '@/components/layout/PageHeader';
import { PriceGuard } from '@/components/purchase/PriceGuard';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ============== Schema ==============
const purchaseSchema = z.object({
  supplierId: z.string().min(1, '请选择供应商'),
  contractNo: z.string().optional(),
  signedAt: z.date().optional(),
  taxRate: z.number().min(0).max(100),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, '请选择商品'),
        quantity: z.number().min(0.01, '数量必须大于0'),
        unitPrice: z.number().min(0, '单价必须大于等于0'),
        unit: z.string().optional(),
        note: z.string().optional(),
        priceNote: z.string().optional(),
      })
    )
    .min(1, '至少添加一项商品'),
});

type PurchaseFormValues = z.infer<typeof purchaseSchema>;

// ============== 供应商推荐类型 ==============
interface RecommendedSupplier extends Supplier {
  isRecommended?: boolean;
  purchaseCount?: number;
}

/**
 * 职责：步骤指示器
 * 思路：已完成步骤显示勾选，当前步骤高亮，未完成步骤显示数字
 */
function StepIndicator({
  steps,
  currentStep,
  onChange,
}: {
  steps: string[];
  currentStep: number;
  onChange: (step: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((step, idx) => {
        const stepNum = idx + 1;
        const isCompleted = stepNum < currentStep;
        const isCurrent = stepNum === currentStep;
        return (
          <div key={step} className="flex items-center">
            <button
              type="button"
              onClick={() => onChange(stepNum)}
              className="flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-medium transition-all"
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  isCurrent
                    ? 'bg-primary text-primary-foreground'
                    : isCompleted
                      ? 'bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : stepNum}
              </span>
              <span
                className={cn(
                  isCurrent ? 'text-primary' : isCompleted ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {step}
              </span>
            </button>
            {idx < steps.length - 1 && (
              <div className={cn('mx-2 h-px w-8', isCompleted ? 'bg-emerald-500' : 'bg-border')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * 职责：价格汇总卡片
 */
function PriceSummary({
  subtotal,
  taxRate,
}: {
  subtotal: number;
  taxRate: number;
}) {
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Calculator className="h-3.5 w-3.5" />
        价格汇总
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">商品小计</span>
          <span className="font-mono font-medium tabular-nums">¥{subtotal.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">税额 ({taxRate}%)</span>
          <span className="font-mono tabular-nums text-muted-foreground">
            ¥{taxAmount.toLocaleString()}
          </span>
        </div>
        <div className="border-t border-border/40 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">合计</span>
            <span className="font-mono text-lg font-bold tabular-nums text-emerald-600">
              ¥{total.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
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
    name: '',
    contactName: '',
    contactPhone: '',
    address: '',
    taxId: '',
    bankName: '',
    bankAccount: '',
  });
  const [savingSupplier, setSavingSupplier] = useState(false);

  // AI 解析
  const [parseText, setParseText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  // 合同模板
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // 批量商品选择器
  const [showBatchSelector, setShowBatchSelector] = useState(false);
  const [batchSearch, setBatchSearch] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // 表单
  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      supplierId: '',
      contractNo: '',
      signedAt: undefined,
      taxRate: 13,
      note: '',
      items: [{ productId: '', quantity: 0, unitPrice: 0, unit: '', note: '', priceNote: '' }],
    },
  });

  // 商品价格历史缓存（按 productId）
  const [priceHistoryMap, setPriceHistoryMap] = useState<Record<string, ProductPriceHistory>>({});

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'items',
  });

  const watchItems = useWatch({ control: form.control, name: 'items' });
  const watchSupplierId = useWatch({ control: form.control, name: 'supplierId' });
  const watchTaxRate = useWatch({ control: form.control, name: 'taxRate' }) ?? 13;

  useEffect(() => {
    if (!form.getValues('signedAt')) {
      form.setValue('signedAt', new Date(), { shouldDirty: false });
    }
  }, [form]);

  // 计算总价
  const totalAmount = watchItems.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  }, 0);

  // ============== 加载商品价格历史 ==============
  const productIdsKey = useMemo(
    () => watchItems.map((i) => i.productId).filter(Boolean).sort().join(','),
    [watchItems]
  );

  useEffect(() => {
    const selectedProductIds = watchItems
      .map((item) => item.productId)
      .filter((id): id is string => Boolean(id));
    const uniqueIds = [...new Set(selectedProductIds)];

    uniqueIds.forEach(async (productId) => {
      if (priceHistoryMap[productId]) return;
      try {
        const res = await purchaseService.getProductPriceHistory(productId);
        if (res.data) {
          setPriceHistoryMap((prev) => ({ ...prev, [productId]: res.data }));
        }
      } catch {
        // 静默失败，价格对比是辅助性的
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIdsKey]);

  // ============== 加载合同模板 ==============
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const res = await contractTemplateService.getByType('PURCHASE');
        setTemplates(res.data || []);
      } catch {
        // 静默失败，模板功能是辅助性的
      } finally {
        setTemplatesLoading(false);
      }
    };
    void loadTemplates();
  }, []);

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
    const selectedProductIds = watchItems.map((item) => item.productId).filter((id) => id && id.length > 0);

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
      ? suppliers.filter(
          (s) =>
            s.name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
            (s.contactName && s.contactName.toLowerCase().includes(supplierSearch.toLowerCase()))
        )
      : suppliers;

    return filtered
      .map((s) => ({
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
      setSuppliers((prev) => [newSupplier, ...prev]);
      form.setValue('supplierId', newSupplier.id);
      setShowNewSupplierDialog(false);
      setNewSupplierForm({
        name: '',
        contactName: '',
        contactPhone: '',
        address: '',
        taxId: '',
        bankName: '',
        bankAccount: '',
      });
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
          const matchedProduct = item.productId
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
          toast.success(
            `解析完成，已添加 ${normalizedItems.length} 条，${unresolvedCount} 条需手动选择商品`
          );
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

  // ============== 应用模板 ==============
  const handleApplyTemplate = (templateId: string) => {
    if (!templateId) {
      setSelectedTemplateId('');
      return;
    }
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    // 预填充表单
    if (template.supplierId) {
      form.setValue('supplierId', template.supplierId);
    }
    if (template.taxRate !== null && template.taxRate !== undefined) {
      form.setValue('taxRate', template.taxRate);
    }
    if (template.note) {
      form.setValue('note', template.note);
    }

    // 应用明细（仅保留当前仍存在的商品）
    const validItems = (template.items || []).filter((item) => products.some((p) => p.id === item.productId));
    if (validItems.length > 0) {
      form.setValue(
        'items',
        validItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity || 0,
          unitPrice: item.unitPrice || 0,
          unit: item.unit || '',
          note: item.note || '',
          priceNote: '',
        }))
      );
      if (validItems.length < (template.items || []).length) {
        toast.warning('部分模板商品已不存在，已自动过滤');
      }
    }

    setSelectedTemplateId(templateId);
    toast.success(`已应用模板：${template.name}`);
  };

  // ============== 保存为模板 ==============
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error('请输入模板名称');
      return;
    }
    const data = form.getValues();
    if (!data.items || data.items.length === 0) {
      toast.error('请至少添加一项商品');
      return;
    }

    setSavingTemplate(true);
    try {
      await contractTemplateService.create({
        name: templateName.trim(),
        type: 'PURCHASE',
        supplierId: data.supplierId || null,
        taxRate: data.taxRate,
        note: data.note || null,
        items: data.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          unit: item.unit,
          note: item.note,
        })),
      });
      toast.success('模板保存成功');
      setShowSaveTemplateDialog(false);
      setTemplateName('');
      // 刷新模板列表
      const res = await contractTemplateService.getByType('PURCHASE');
      setTemplates(res.data || []);
    } catch {
      toast.error('保存模板失败');
    } finally {
      setSavingTemplate(false);
    }
  };

  // ============== 批量添加商品 ==============
  const handleBatchAdd = () => {
    const toAdd = products.filter((p) => selectedProductIds.has(p.id));
    toAdd.forEach((p) => {
      append({
        productId: p.id,
        quantity: 0,
        unitPrice: 0,
        unit: p.unit || '',
        note: '',
        priceNote: '',
      });
    });
    setSelectedProductIds(new Set());
    setShowBatchSelector(false);
    setBatchSearch('');
    toast.success(`已添加 ${toAdd.length} 项商品`);
  };

  const filteredBatchProducts = useMemo(() => {
    if (!batchSearch.trim()) return products;
    const kw = batchSearch.trim().toLowerCase();
    return products.filter((p) => p.customsName.toLowerCase().includes(kw));
  }, [products, batchSearch]);

  // ============== 提交 ==============
  const onSubmit = async (data: PurchaseFormValues) => {
    try {
      // 检查价格预警：若触发警告但未填写备注，阻止提交
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const history = item.productId ? priceHistoryMap[item.productId] : null;
        if (history && history.averagePrice !== null && item.unitPrice > history.averagePrice * 1.1) {
          if (!item.priceNote || item.priceNote.trim().length === 0) {
            toast.error(`第 ${i + 1} 项商品价格高于历史均价，请填写备注说明原因`);
            return;
          }
        }
      }

      // 转换数据格式以匹配后端期望（将 priceNote 合并到 note）
      const submitData: PurchaseCreatePayload = {
        supplierId: data.supplierId,
        contractNo: data.contractNo,
        signedAt: data.signedAt?.toISOString(),
        taxRate: data.taxRate,
        note: data.note,
        items: data.items.map((item) => {
          const notes: string[] = [];
          if (item.note) notes.push(item.note);
          if (item.priceNote) notes.push(`价格预警说明：${item.priceNote}`);
          return {
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unit: item.unit,
            note: notes.join(' | ') || undefined,
          };
        }),
      };
      await purchaseService.create(submitData);
      toast.success('采购合同创建成功');
      router.push('/dashboard/contracts');
    } catch {
      toast.error('创建失败');
    }
  };

  const goToStep1 = () => setCurrentStep(1);

  const goToStep2 = async () => {
    const valid = await form.trigger('items');
    if (!valid) {
      toast.error('请完善采购明细信息');
      return;
    }
    setCurrentStep(2);
  };

  // 当前选中的供应商
  const selectedSupplier = suppliers.find((s) => s.id === watchSupplierId);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <PageHeader
        title="新增采购合同"
        description="先添加商品，系统会推荐曾供应过该商品的供应商"
      />

      {/* 模板选择器 */}
      <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)] md:col-span-2">
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            从模板创建
          </div>
          <Select
            value={selectedTemplateId}
            onValueChange={handleApplyTemplate}
            disabled={templatesLoading}
          >
            <SelectTrigger className="h-9 w-[240px] rounded-md text-xs">
              <SelectValue placeholder={templatesLoading ? '加载中...' : '选择合同模板'} />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}（{t.items?.length || 0} 项）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-md text-xs"
            onClick={() => setShowSaveTemplateDialog(true)}
          >
            <Save className="mr-1 h-3.5 w-3.5" />
            保存为模板
          </Button>
        </CardContent>
      </Card>

      {/* Stepper */}
      <StepIndicator
        steps={['采购明细', '合同信息']}
        currentStep={currentStep}
        onChange={setCurrentStep}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
            {currentStep === 1 && (
              <>
                {/* AI 智能录入 */}
                <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)] md:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                      <Wand2 className="h-4 w-4 text-primary" />
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
                        className="min-h-[100px] rounded-md"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={handleParse}
                      disabled={isParsing || !parseText}
                      variant="default"
                      className="h-9 rounded-md text-xs shadow-sm"
                    >
                      {isParsing ? '解析中...' : '解析报价'}
                    </Button>
                  </CardContent>
                </Card>

                {/* 采购明细 */}
                <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)] md:col-span-2">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-sm font-medium">
                        <Package className="h-4 w-4" />
                        采购明细
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">先选择商品，系统会推荐供应商</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-md text-xs"
                        onClick={() => setShowBatchSelector(true)}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        批量添加
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* 价格汇总 */}
                    <PriceSummary subtotal={totalAmount} taxRate={watchTaxRate} />

                    {fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="grid gap-3 rounded-lg border border-border/40 bg-card p-4 md:grid-cols-12 md:items-end"
                      >
                        <div className="md:col-span-4">
                          <FormField
                            control={form.control}
                            name={`items.${index}.productId`}
                            render={({ field }) => {
                              return (
                                <FormItem>
                                  <FormLabel className="text-xs">
                                    商品 <span className="text-destructive">*</span>
                                  </FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger className="h-9 rounded-md text-xs">
                                        <SelectValue placeholder="选择商品" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {products.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                          {p.customsName}
                                        </SelectItem>
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
                                <FormLabel className="text-xs">
                                  数量 <span className="text-destructive">*</span>
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    className="h-9 rounded-md text-xs"
                                    {...field}
                                    onChange={(e) =>
                                      field.onChange(parseFloat(e.target.value) || 0)
                                    }
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
                            name={`items.${index}.unit`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">单位</FormLabel>
                                <FormControl>
                                  <Input
                                    className="h-9 rounded-md text-xs"
                                    {...field}
                                    placeholder="件/箱/平米"
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
                            name={`items.${index}.unitPrice`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-xs">
                                  单价 (¥) <span className="text-destructive">*</span>
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    className="h-9 rounded-md text-xs"
                                    {...field}
                                    onChange={(e) =>
                                      field.onChange(parseFloat(e.target.value) || 0)
                                    }
                                  />
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
                        <div className="md:col-span-1 text-right">
                          <p className="text-[11px] text-muted-foreground">小计</p>
                          <p className="font-mono text-sm font-semibold tabular-nums text-emerald-600">
                            ¥
                            {(
                              (watchItems[index]?.quantity || 0) *
                              (watchItems[index]?.unitPrice || 0)
                            ).toLocaleString()}
                          </p>
                        </div>
                        <div className="md:col-span-1 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-md"
                            onClick={() => remove(index)}
                            disabled={fields.length <= 1}
                          >
                            <Trash className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>

                        {/* 价格历史对比与预警备注 */}
                        {(() => {
                          const item = watchItems[index];
                          const history = item?.productId ? priceHistoryMap[item.productId] : null;
                          const showHistory = history && history.count > 0;
                          const isHighPrice =
                            showHistory &&
                            history.averagePrice !== null &&
                            item.unitPrice > history.averagePrice * 1.1;
                          if (!showHistory) return null;
                          return (
                            <div className="md:col-span-12">
                              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                <span>
                                  历史采购：均价 ¥{history.averagePrice} / 最低 ¥
                                  {history.minPrice} / 最高 ¥{history.maxPrice}（共 {history.count}{' '}
                                  笔）
                                </span>
                              </div>
                              {isHighPrice && (
                                <div className="mt-2 space-y-2">
                                  <p className="text-xs font-medium text-destructive">
                                    当前价格高于历史均价{' '}
                                    {(
                                      ((item.unitPrice - history.averagePrice!) /
                                        history.averagePrice!) *
                                      100
                                    ).toFixed(1)}
                                    %，请说明原因
                                  </p>
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.priceNote`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormControl>
                                          <Input
                                            {...field}
                                            placeholder="请填写价格偏高原因（必填）"
                                            className="h-8 rounded-md border-destructive text-xs focus-visible:ring-destructive"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-md text-xs"
                      onClick={() =>
                        append({
                          productId: '',
                          quantity: 0,
                          unitPrice: 0,
                          unit: '',
                          note: '',
                          priceNote: '',
                        })
                      }
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> 添加商品
                    </Button>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-3 md:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-md text-sm"
                    onClick={() => router.back()}
                  >
                    取消
                  </Button>
                  <Button type="button" className="h-10 rounded-md text-sm" onClick={goToStep2}>
                    下一步：合同信息
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {currentStep === 2 && (
              <>
                {/* 合同详情 */}
                <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)] md:col-span-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">合同信息</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-5 md:grid-cols-3">
                    {/* 合同编号 */}
                    <FormField
                      control={form.control}
                      name="contractNo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">合同编号</FormLabel>
                          <FormControl>
                            {contractNoLoading ? (
                              <div className="flex h-10 items-center gap-2 rounded-md border border-border/60 bg-muted px-3 text-xs text-muted-foreground">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                生成中...
                              </div>
                            ) : (
                              <Input
                                {...field}
                                disabled
                                className="h-10 rounded-md font-mono text-xs"
                              />
                            )}
                          </FormControl>
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
                            <FormLabel className="text-xs">
                              供应商 <span className="text-destructive">*</span>
                            </FormLabel>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 text-xs"
                              onClick={() => setShowNewSupplierDialog(true)}
                            >
                              <UserPlus className="mr-1 h-3 w-3" />
                              新增
                            </Button>
                          </div>
                          <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                            <PopoverTrigger asChild>
                              <FormControl>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={supplierOpen}
                                  className={cn(
                                    'h-10 justify-between rounded-md text-xs font-normal',
                                    !field.value && 'text-muted-foreground'
                                  )}
                                >
                                  {selectedSupplier ? selectedSupplier.name : '搜索或选择供应商...'}
                                  <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
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
                                          setNewSupplierForm((prev) => ({
                                            ...prev,
                                            name: supplierSearch,
                                          }));
                                          setShowNewSupplierDialog(true);
                                          setSupplierOpen(false);
                                        }}
                                      >
                                        {`+ 新增 "${supplierSearch}"`}
                                      </Button>
                                    </div>
                                  </CommandEmpty>
                                  {recommendedSupplierIds.size > 0 &&
                                    sortedSuppliers.some((s) => s.isRecommended) && (
                                      <CommandGroup heading="推荐供应商">
                                        {sortedSuppliers
                                          .filter((s) => s.isRecommended)
                                          .map((s) => (
                                            <CommandItem
                                              key={s.id}
                                              value={s.id}
                                              onSelect={() => {
                                                field.onChange(s.id);
                                                setSupplierOpen(false);
                                                setSupplierSearch('');
                                              }}
                                            >
                                              <Check
                                                className={cn(
                                                  'mr-2 h-4 w-4',
                                                  field.value === s.id
                                                    ? 'opacity-100'
                                                    : 'opacity-0'
                                                )}
                                              />
                                              <Star className="mr-1 h-3 w-3 text-primary" />
                                              <span>{s.name}</span>
                                              {s.contactName && (
                                                <span className="ml-2 text-xs text-muted-foreground">
                                                  ({s.contactName})
                                                </span>
                                              )}
                                              <Badge variant="secondary" className="ml-auto text-xs">
                                                曾供应
                                              </Badge>
                                            </CommandItem>
                                          ))}
                                      </CommandGroup>
                                    )}
                                  <CommandGroup
                                    heading={
                                      recommendedSupplierIds.size > 0 ? '全部供应商' : '供应商列表'
                                    }
                                  >
                                    {sortedSuppliers
                                      .filter((s) => !s.isRecommended)
                                      .map((s) => (
                                        <CommandItem
                                          key={s.id}
                                          value={s.id}
                                          onSelect={() => {
                                            field.onChange(s.id);
                                            setSupplierOpen(false);
                                            setSupplierSearch('');
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              'mr-2 h-4 w-4',
                                              field.value === s.id
                                                ? 'opacity-100'
                                                : 'opacity-0'
                                            )}
                                          />
                                          <span>{s.name}</span>
                                          {s.contactName && (
                                            <span className="ml-2 text-xs text-muted-foreground">
                                              ({s.contactName})
                                            </span>
                                          )}
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
                          <Label htmlFor="purchase-signed-at" className="mb-1.5 text-xs">
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
                          <FormLabel className="text-xs">
                            税率 (%) <span className="text-destructive">*</span>
                          </FormLabel>
                          <Select
                            onValueChange={(val) => field.onChange(Number(val))}
                            defaultValue={String(field.value)}
                          >
                            <FormControl>
                              <SelectTrigger className="h-10 rounded-md text-xs">
                                <SelectValue placeholder="选择税率" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1">1% (小规模纳税人)</SelectItem>
                              <SelectItem value="13">13% (一般纳税人)</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* 备注 */}
                    <div className="md:col-span-3">
                      <FormField
                        control={form.control}
                        name="note"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">备注</FormLabel>
                            <FormControl>
                              <Textarea
                                {...field}
                                placeholder="填写合同备注信息（可选）"
                                className="min-h-[80px] rounded-md"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* 提交按钮 */}
                <div className="flex justify-end gap-3 md:col-span-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-md text-sm"
                    onClick={goToStep1}
                  >
                    <ArrowLeft className="mr-1.5 h-4 w-4" />
                    上一步
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-md text-sm"
                    onClick={() => router.back()}
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    className="h-10 rounded-md text-sm"
                    disabled={form.formState.isSubmitting}
                  >
                    {form.formState.isSubmitting ? '提交中...' : '创建合同'}
                  </Button>
                </div>
              </>
            )}
          </form>
        </Form>
      </div>

      {/* 批量商品选择器弹窗 */}
      <Dialog open={showBatchSelector} onOpenChange={setShowBatchSelector}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4" />
              批量添加商品
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索商品名称..."
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
                className="h-9 rounded-md pl-9 text-xs"
              />
            </div>
            <div className="max-h-[320px] overflow-y-auto rounded-md border border-border/40">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-10 text-center">
                      <input
                        id="batch-select-all"
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-border"
                        checked={
                          filteredBatchProducts.length > 0 &&
                          filteredBatchProducts.every((p) => selectedProductIds.has(p.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProductIds(
                              new Set(filteredBatchProducts.map((p) => p.id))
                            );
                          } else {
                            setSelectedProductIds(new Set());
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead className="text-xs">商品名称</TableHead>
                    <TableHead className="text-xs">规格</TableHead>
                    <TableHead className="text-xs">单位</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBatchProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-xs text-muted-foreground">
                        未找到匹配商品
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBatchProducts.map((product) => (
                      <TableRow
                        key={product.id}
                        className="cursor-pointer"
                        onClick={() => {
                          const next = new Set(selectedProductIds);
                          if (next.has(product.id)) {
                            next.delete(product.id);
                          } else {
                            next.add(product.id);
                          }
                          setSelectedProductIds(next);
                        }}
                      >
                        <TableCell className="text-center">
                          <input
                            id={`batch-product-${product.id}`}
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-border"
                            checked={selectedProductIds.has(product.id)}
                            onChange={() => {}}
                          />
                        </TableCell>
                        <TableCell className="text-sm">{product.customsName}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {product.specification || '-'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {product.unit || '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                已选择 {selectedProductIds.size} 项
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md text-xs"
                  onClick={() => {
                    setSelectedProductIds(new Set());
                    setShowBatchSelector(false);
                  }}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className="h-8 rounded-md text-xs"
                  onClick={handleBatchAdd}
                  disabled={selectedProductIds.size === 0}
                >
                  确认添加
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新增供应商弹窗 */}
      <Dialog open={showNewSupplierDialog} onOpenChange={setShowNewSupplierDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-medium">
              <UserPlus className="h-4 w-4" />
              新增供应商
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-supplier-name">供应商名称 *</Label>
              <Input
                id="new-supplier-name"
                name="name"
                value={newSupplierForm.name}
                onChange={(e) =>
                  setNewSupplierForm((prev) => ({ ...prev, name: e.target.value }))
                }
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
                  onChange={(e) =>
                    setNewSupplierForm((prev) => ({ ...prev, contactName: e.target.value }))
                  }
                  placeholder="例如：张经理"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-supplier-contact-phone">联系电话</Label>
                <Input
                  id="new-supplier-contact-phone"
                  name="contactPhone"
                  value={newSupplierForm.contactPhone}
                  onChange={(e) =>
                    setNewSupplierForm((prev) => ({ ...prev, contactPhone: e.target.value }))
                  }
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
                onChange={(e) =>
                  setNewSupplierForm((prev) => ({ ...prev, address: e.target.value }))
                }
                placeholder="例如：广东省佛山市禅城区xxx"
              />
            </div>
            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium">开票信息（合同用）</p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-tax-id">纳税人识别号</Label>
                  <Input
                    id="new-supplier-tax-id"
                    name="taxId"
                    value={newSupplierForm.taxId}
                    onChange={(e) =>
                      setNewSupplierForm((prev) => ({ ...prev, taxId: e.target.value }))
                    }
                    placeholder="例如：91440000xxxxxxxxxx"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-bank-name">开户银行</Label>
                  <Input
                    id="new-supplier-bank-name"
                    name="bankName"
                    value={newSupplierForm.bankName}
                    onChange={(e) =>
                      setNewSupplierForm((prev) => ({ ...prev, bankName: e.target.value }))
                    }
                    placeholder="例如：中国银行佛山禅城支行"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-supplier-bank-account">银行账号</Label>
                  <Input
                    id="new-supplier-bank-account"
                    name="bankAccount"
                    value={newSupplierForm.bankAccount}
                    onChange={(e) =>
                      setNewSupplierForm((prev) => ({ ...prev, bankAccount: e.target.value }))
                    }
                    placeholder="例如：6217xxxxxxxxxxxxxxxx"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSupplierDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSaveNewSupplier} disabled={savingSupplier}>
              {savingSupplier ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                '保存供应商'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 保存模板弹窗 */}
      <Dialog open={showSaveTemplateDialog} onOpenChange={setShowSaveTemplateDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">保存为模板</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="template-name">模板名称</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="例如：标准瓷砖采购模板"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveTemplateDialog(false)}>
              取消
            </Button>
            <Button onClick={handleSaveTemplate} disabled={savingTemplate}>
              {savingTemplate ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
