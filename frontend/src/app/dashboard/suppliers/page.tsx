/**
 * Input: 供应商服务API、React Hook Form、ModuleTabHeader
 * Output: 手机选中后定位表单的供应商管理页（左侧选择供应商，右侧维护档案表单）
 * Pos: 采购模块基础档案表单页
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { BusinessWrite, useBusinessReadOnly } from '@/lib/hooks/useBusinessReadOnly';
import { loadPaginatedCatalog } from '@/services/paginatedCatalog';
import { ErrorState } from '@/components/ui/data-state';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Mail,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { Supplier } from '@/types';
import { supplierService } from '@/services/supplier.service';
import { Button } from '@/components/ui/button';
import { useMobile } from '@/lib/hooks/useMobile';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, PROCUREMENT_TABS } from '@/components/layout/ModuleTabHeader';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
import { cn } from '@/lib/utils';

interface SupplierDisplay extends Supplier {
  purchaseCount?: number;
  recentTransactionAmount?: number;
}

const supplierSchema = z.object({
  name: z.string().min(1, '公司名称必填'),
  shortName: z.string().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email('邮箱格式不正确').optional().or(z.literal('')),
  address: z.string().optional(),
  phone: z.string().optional(),
  taxId: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  bankCode: z.string().optional(),
  bankAccount: z.string().optional(),
  hasQualityIssue: z.boolean(),
  qualityNote: z.string().optional(),
  aliases: z.array(z.object({
    alias: z.string().min(1, '别名不能为空'),
  })).optional(),
});

type SupplierFormValues = z.infer<typeof supplierSchema>;
type SupplierStatusFilter = 'all' | 'normal' | 'issue';

const emptySupplierValues: SupplierFormValues = {
  name: '',
  shortName: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  address: '',
  phone: '',
  taxId: '',
  bankAccountName: '',
  bankName: '',
  bankBranch: '',
  bankCode: '',
  bankAccount: '',
  hasQualityIssue: false,
  qualityNote: '',
  aliases: [],
};

function supplierToFormValues(supplier: SupplierDisplay): SupplierFormValues {
  return {
    name: supplier.name,
    shortName: supplier.shortName || '',
    contactName: supplier.contactName || '',
    contactPhone: supplier.contactPhone || '',
    contactEmail: supplier.contactEmail || '',
    address: supplier.address || '',
    phone: supplier.phone || '',
    taxId: supplier.taxId || '',
    bankAccountName: supplier.bankAccountName || '',
    bankName: supplier.bankName || '',
    bankBranch: supplier.bankBranch || '',
    bankCode: supplier.bankCode || '',
    bankAccount: supplier.bankAccount || '',
    hasQualityIssue: supplier.hasQualityIssue,
    qualityNote: supplier.qualityNote || '',
    aliases: supplier.aliases?.map((alias) => ({ alias: alias.alias })) || [],
  };
}

function toSupplierPayload(values: SupplierFormValues) {
  return {
    ...values,
    aliases: values.aliases
      ?.map((alias) => ({ alias: alias.alias.trim() }))
      .filter((alias) => alias.alias.length > 0),
  };
}

function supplierInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '供';
}

function SupplierStatusBadge({ hasIssue }: { hasIssue: boolean }) {
  return hasIssue ? (
    <Badge variant="destructive" className="gap-1 rounded-full px-2 py-0.5 text-[11px]">
      <AlertTriangle className="h-3 w-3" />
      质量问题
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 rounded-full border-primary/20 bg-primary/5 px-2 py-0.5 text-[11px] text-primary">
      <CheckCircle2 className="h-3 w-3" />
      正常
    </Badge>
  );
}

export default function SuppliersPage() {
  const readOnly = useBusinessReadOnly();
  const isMobile = useMobile();
  const formSectionRef = useRef<HTMLElement>(null);
  const [suppliers, setSuppliers] = useState<SupplierDisplay[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSupplierId, setActiveSupplierId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<SupplierStatusFilter>('all');

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierSchema),
    defaultValues: emptySupplierValues,
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'aliases',
  });
  const hasQualityIssue = useWatch({
    control: form.control,
    name: 'hasQualityIssue',
  });

  const loadSuppliers = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const items = await cachedFetch('suppliers-list', () => loadPaginatedCatalog((page) => supplierService.getAll({ page, pageSize: 100 }))) as SupplierDisplay[];
      setSuppliers(items);
      return items;
    } catch {
      setLoadError(true);
      toast.error('加载供应商失败');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const activeSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.id === activeSupplierId) || null,
    [activeSupplierId, suppliers],
  );

  useEffect(() => {
    if (activeSupplier) {
      form.reset(supplierToFormValues(activeSupplier));
    } else if (activeSupplierId === null) {
      form.reset(emptySupplierValues);
    }
  }, [activeSupplier, activeSupplierId, form]);

  const filteredSuppliers = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return suppliers.filter((supplier) => {
      const matchesKeyword = !kw || [
        supplier.name,
        supplier.shortName,
        supplier.contactName,
        supplier.contactPhone,
        supplier.contactEmail,
        ...(supplier.aliases?.map((alias) => alias.alias) || []),
      ].some((value) => (value || '').toLowerCase().includes(kw));

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'normal' && !supplier.hasQualityIssue) ||
        (statusFilter === 'issue' && supplier.hasQualityIssue);

      return matchesKeyword && matchesStatus;
    });
  }, [keyword, statusFilter, suppliers]);

  const normalCount = suppliers.filter((supplier) => !supplier.hasQualityIssue).length;
  const issueCount = suppliers.length - normalCount;
  const hasActiveFilters = keyword.trim() || statusFilter !== 'all';

  const resetFilters = () => {
    setKeyword('');
    setStatusFilter('all');
  };

  const startNewSupplier = () => {
    setActiveSupplierId(null);
    form.reset(emptySupplierValues);
    if (isMobile) formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectSupplier = (supplier: SupplierDisplay) => {
    setActiveSupplierId(supplier.id);
    if (isMobile) formSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmit = async (values: SupplierFormValues) => {
    const payload = toSupplierPayload(values);

    try {
      if (activeSupplier) {
        await supplierService.update(activeSupplier.id, payload);
        toast.success('供应商更新成功');
      } else {
        const response = await supplierService.create(payload);
        setActiveSupplierId(response.data?.id || null);
        toast.success('供应商创建成功');
      }
      invalidateCache('suppliers-list');
      await loadSuppliers();
    } catch {
      toast.error(activeSupplier ? '更新失败' : '创建失败');
    }
  };

  const handleDeleteActive = async () => {
    if (!activeSupplier) return;
    if (!confirm(`确定要删除供应商「${activeSupplier.name}」吗？`)) return;

    try {
      await supplierService.delete(activeSupplier.id);
      toast.success('供应商已删除');
      setActiveSupplierId(null);
      form.reset(emptySupplierValues);
      invalidateCache('suppliers-list');
      await loadSuppliers();
    } catch {
      toast.error('删除失败');
    }
  };

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={PROCUREMENT_TABS} moduleName="采购" />
      <PageHeader
        title="供应商管理"
        actions={
          <BusinessWrite><Button onClick={startNewSupplier} className="h-9 rounded-lg text-sm">
            <Plus className="mr-1.5 h-4 w-4" />
            新建供应商档案
          </Button></BusinessWrite>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-xl border border-border/50 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="space-y-4 border-b border-border/50 p-4">
            <div>
              <p className="text-sm font-semibold">供应商索引</p>
              <p className="mt-1 text-xs text-muted-foreground">
                共 {suppliers.length} 家，正常 {normalCount} 家，质量问题 {issueCount} 家。
              </p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索名称、联系人、别名..."
                className="h-9 rounded-lg pl-9"
              />
            </div>

            <div className="grid grid-cols-3 gap-1 rounded-lg border border-border/60 bg-muted/30 p-1">
              {[
                ['all', '全部'],
                ['normal', '正常'],
                ['issue', '质量问题'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value as SupplierStatusFilter)}
                  className={cn(
                    'h-8 rounded-md text-xs font-medium transition-colors',
                    statusFilter === value
                      ? value === 'issue'
                        ? 'bg-destructive text-destructive-foreground'
                        : 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-background hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-8 w-full rounded-lg text-xs" onClick={resetFilters}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                清空筛选
              </Button>
            )}
          </div>

          <div className="max-h-[320px] overflow-y-auto overscroll-contain p-2 lg:max-h-[620px]">
            {loadError ? (<ErrorState title="供应商加载失败" action={<Button onClick={() => { invalidateCache('suppliers-list'); void loadSuppliers(); }}>重试</Button>} />) : loading ? (
              <div className="py-10 text-center text-sm text-muted-foreground">加载中...</div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
                {hasActiveFilters ? '没有符合条件的供应商' : '暂无供应商'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSuppliers.map((supplier) => (
                  <button
                    key={supplier.id}
                    type="button"
                    onClick={() => selectSupplier(supplier)}
                    aria-label={`选择供应商 ${supplier.name}`}
                    className={cn(
                      'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                      activeSupplierId === supplier.id
                        ? 'border-primary/40 bg-primary/5'
                        : 'border-transparent hover:border-border hover:bg-muted/50',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
                          supplier.hasQualityIssue
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-primary/10 text-primary',
                        )}
                      >
                        {supplierInitial(supplier.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-sm font-semibold">{supplier.name}</p>
                          <SupplierStatusBadge hasIssue={supplier.hasQualityIssue} />
                        </div>
                        <div className="mt-1 space-y-1 text-xs text-muted-foreground">
                          <p className="truncate">
                            联系人：<span className="text-foreground">{supplier.contactName || '待补充'}</span>
                          </p>
                          <p className="truncate">
                            电话：<span className="text-foreground">{supplier.contactPhone || '—'}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>

        <section ref={formSectionRef} className="min-w-0 scroll-mt-20 rounded-xl border border-border/50 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="flex flex-col gap-3 border-b border-border/50 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">供应商档案表单</h2>
                <Badge variant={activeSupplier ? 'outline' : 'secondary'} className="rounded-full">
                  {activeSupplier ? '编辑现有档案' : '新建档案'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                维护合同生成、联系人、税号和收款账户信息。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BusinessWrite><Button type="button" variant="outline" className="h-9 rounded-lg text-sm" onClick={startNewSupplier}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                清空新建
              </Button></BusinessWrite>
              <BusinessWrite><Button
                type="button"
                variant="outline"
                className="h-9 rounded-lg border-destructive/30 text-sm text-destructive hover:bg-destructive/5 hover:text-destructive"
                disabled={!activeSupplier}
                onClick={handleDeleteActive}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                删除当前
              </Button></BusinessWrite>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6 p-5">
              <fieldset disabled={readOnly} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
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
                        <Input placeholder="内部常用称呼" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="rounded-xl border border-border/50 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">供应商别名</p>
                    <p className="mt-1 text-xs text-muted-foreground">用于搜索和匹配采购合同里的历史称呼。</p>
                  </div>
                  <BusinessWrite><Button type="button" variant="outline" size="sm" className="h-8 rounded-lg" onClick={() => append({ alias: '' })}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    添加别名
                  </Button></BusinessWrite>
                </div>
                <div className="space-y-2">
                  {fields.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border/70 px-3 py-3 text-sm text-muted-foreground">
                      暂无别名。
                    </p>
                  ) : (
                    fields.map((field, index) => (
                      <div key={field.id} className="flex gap-2">
                        <FormField
                          control={form.control}
                          name={`aliases.${index}.alias`}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormControl>
                                <Input placeholder="例如：黎总、陶瓷厂" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <BusinessWrite><Button type="button" variant="ghost" size="icon" className="h-10 w-10" onClick={() => remove(index)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button></BusinessWrite>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FormField
                  control={form.control}
                  name="contactName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="inline-flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        联系人
                      </FormLabel>
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
                      <FormLabel className="inline-flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />
                        联系电话
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="手机或座机" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contactEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="inline-flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" />
                        邮箱
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="电子邮箱" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="rounded-xl border border-border/50 p-4">
                <div className="mb-4">
                  <p className="text-sm font-semibold">合同与财务信息</p>
                  <p className="mt-1 text-xs text-muted-foreground">这些字段会进入采购合同、付款和后续对账流程。</p>
                </div>
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>公司地址</FormLabel>
                        <FormControl>
                          <Input placeholder="完整公司地址" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>公司电话</FormLabel>
                          <FormControl>
                            <Input placeholder="座机电话" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="taxId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>纳税人识别号</FormLabel>
                          <FormControl>
                            <Input placeholder="税号" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="bankAccountName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>收款户名</FormLabel>
                          <FormControl>
                            <Input placeholder="银行账户户名" {...field} />
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
                            <Input placeholder="银行账号" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="bankName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>开户银行</FormLabel>
                          <FormControl>
                            <Input placeholder="银行名称" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="bankBranch"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>开户支行</FormLabel>
                          <FormControl>
                            <Input placeholder="例如：佛山祖庙支行" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="bankCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>联行号 / 银行编号</FormLabel>
                        <FormControl>
                          <Input placeholder="银行联行号或汇款所需银行编号" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
                <FormField
                  control={form.control}
                  name="hasQualityIssue"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel className="font-semibold text-destructive">质量问题标记</FormLabel>
                        <FormDescription>供应商出现过质量问题时勾选，后续采购选择会显示风险提示。</FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                {hasQualityIssue && (
                  <FormField
                    control={form.control}
                    name="qualityNote"
                    render={({ field }) => (
                      <FormItem className="mt-4">
                        <FormLabel>问题描述</FormLabel>
                        <FormControl>
                          <Textarea placeholder="请描述质量问题、发生时间和处理结果..." className="min-h-24 resize-none" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>

              <div className="flex flex-col-reverse gap-2 border-t border-border/50 pt-5 sm:flex-row sm:justify-end">
                <BusinessWrite><Button type="button" variant="outline" className="h-10 rounded-lg" onClick={startNewSupplier}>
                  取消并新建
                </Button></BusinessWrite>
                <BusinessWrite><Button type="submit" className="h-10 rounded-lg" disabled={form.formState.isSubmitting}>
                  <Save className="mr-1.5 h-4 w-4" />
                  {form.formState.isSubmitting ? '保存中...' : activeSupplier ? '保存修改' : '创建供应商'}
                </Button></BusinessWrite>
              </div>
            </fieldset>
            </form>
          </Form>
        </section>
      </div>
    </div>
  );
}
