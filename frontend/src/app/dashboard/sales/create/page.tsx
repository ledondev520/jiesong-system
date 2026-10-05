/**
 * Input: 商品、门店、销售服务
 * Output: 原子提交与失败重试防重复的出口合同创建向导，保留合同编号及完整明细
 * Pos: 出口管理创建入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Product, Store } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash,
  Search,
  Store as StoreIcon,
  Package,
  ArrowRight,
  ArrowLeft,
  Container,
  Check,
  Calculator,
} from "lucide-react";
import { toast } from "sonner";
import { salesService } from "@/services/sales.service";
import { productService } from "@/services/product.service";
import { storeService } from "@/services/store.service";
import { DEFAULT_EXCHANGE_RATE, DEFAULT_PROFIT_RATE } from "@/lib/constants";
import { PageHeader } from "@/components/layout/PageHeader";
const salesSchema = z.object({
  contractNo: z.string().optional(),
  signedAt: z.date().optional(),
  exchangeRate: z.number().min(0.1),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "请选择商品"),
        storeId: z.string().min(1, "请选择门店"),
        quantity: z.number().min(0.01, "数量必填"),
        unit: z.string().optional(),
        costPrice: z.number().min(0.01, "成本必填"),
        sellingPrice: z.number().min(0.01, "售价必填"),
        note: z.string().optional(),
      }),
    )
    .min(1, "至少添加一项商品"),
});

type SalesFormValues = z.infer<typeof salesSchema>;

export default function CreateSalesPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [contractNoLoading, setContractNoLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const submitAttempt = useRef<{
    fingerprint: string;
    requestKey: string;
  } | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const form = useForm<SalesFormValues>({
    resolver: zodResolver(salesSchema),
    defaultValues: {
      contractNo: "",
      signedAt: undefined,
      exchangeRate: DEFAULT_EXCHANGE_RATE,
      note: "",
      items: [
        {
          productId: "",
          storeId: "",
          quantity: 0,
          unit: "",
          costPrice: 0,
          sellingPrice: 0,
          note: "",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchItems = useWatch({ control: form.control, name: "items" });
  const exchangeRate = useWatch({
    control: form.control,
    name: "exchangeRate",
  });

  useEffect(() => {
    if (!form.getValues("signedAt")) {
      form.setValue("signedAt", new Date(), { shouldDirty: false });
    }
  }, [form]);

  // Calculate Total
  const totalAmount = watchItems.reduce((sum, item) => {
    return (
      sum + (Number(item.quantity) || 0) * (Number(item.sellingPrice) || 0)
    );
  }, 0);

  const totalCost = watchItems.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.costPrice) || 0);
  }, 0);

  const totalProfit =
    totalAmount * (exchangeRate || DEFAULT_EXCHANGE_RATE) - totalCost;
  const profitMargin =
    totalAmount > 0
      ? (totalProfit /
          (totalAmount * (exchangeRate || DEFAULT_EXCHANGE_RATE))) *
        100
      : 0;

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
          form.setValue("contractNo", contractNoRes.data.contractNo);
        }
      } catch (error) {
        console.error("加载数据失败:", error);
        toast.error("加载商品和门店数据失败");
      } finally {
        setContractNoLoading(false);
      }
    };
    loadData();
  }, [form]);

  // Auto-calculate selling price when cost price changes
  const handleCostChange = (index: number, cost: number) => {
    const price = salesService.calculatePrice(
      cost,
      exchangeRate,
      DEFAULT_PROFIT_RATE,
    );
    form.setValue(`items.${index}.costPrice`, cost, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue(`items.${index}.sellingPrice`, price, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const onSubmit = async (data: SalesFormValues) => {
    if (submitting.current) return;
    submitting.current = true;
    try {
      const payload = {
        contractNo: data.contractNo?.trim() || undefined,
        exchangeRate: data.exchangeRate,
        signedAt: data.signedAt?.toISOString(),
        note: data.note?.trim() || undefined,
        items: data.items.map((item) => ({
          ...item,
          unit: item.unit?.trim() || undefined,
          note: item.note?.trim() || undefined,
        })),
      };
      const fingerprint = JSON.stringify(payload);
      if (submitAttempt.current?.fingerprint !== fingerprint) {
        submitAttempt.current = {
          fingerprint,
          requestKey: crypto.randomUUID(),
        };
      }
      const createResult = await salesService.createWithItems(
        payload,
        submitAttempt.current.requestKey,
      );

      const contractId = createResult.data?.id;
      if (!contractId) {
        throw new Error("创建合同失败：未返回合同ID");
      }

      if (!mounted.current) return;
      toast.success("出口合同创建成功");
      router.push(`/dashboard/sales/${contractId}`);
    } catch (error) {
      if (mounted.current)
        toast.error(
          error instanceof Error ? error.message : "创建失败，请重试",
        );
    } finally {
      submitting.current = false;
    }
  };

  const goToStep2 = async () => {
    const valid = await form.trigger("exchangeRate");
    if (valid) setCurrentStep(2);
  };

  const goToStep1 = () => setCurrentStep(1);

  const steps = [
    { id: 1, label: "基本信息", description: "合同编号、日期、汇率" },
    { id: 2, label: "出口明细", description: "门店、商品、定价" },
  ];

  const [storeSearch, setStoreSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");

  const filteredStores = useMemo(() => {
    if (!storeSearch.trim()) return stores;
    const q = storeSearch.toLowerCase();
    return stores.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.port?.name?.toLowerCase().includes(q),
    );
  }, [stores, storeSearch]);

  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.customsName?.toLowerCase().includes(q) ||
        p.specification?.toLowerCase().includes(q) ||
        p.hsCode?.toLowerCase().includes(q),
    );
  }, [products, productSearch]);

  return (
    <div className="min-w-0 space-y-6 max-w-5xl mx-auto pb-10">
      <PageHeader
        title="创建出口合同"
        description="创建新的出口合同并自动计算报价。"
      />

      {/* Stepper */}
      <div className="flex items-center justify-center">
        <div className="flex items-center gap-0">
          {steps.map((step, idx) => (
            <div key={step.id} className="flex items-center">
              <button
                type="button"
                onClick={() => step.id === 1 && setCurrentStep(1)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  currentStep === step.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : currentStep > step.id
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    currentStep === step.id
                      ? "bg-primary-foreground text-primary"
                      : currentStep > step.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-muted-foreground"
                  }`}
                >
                  {currentStep > step.id ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    step.id
                  )}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-medium leading-none">
                    {step.label}
                  </p>
                  <p
                    className={`text-[11px] mt-0.5 ${currentStep === step.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                  >
                    {step.description}
                  </p>
                </div>
              </button>
              {idx < steps.length - 1 && (
                <div
                  className={`w-8 h-px mx-1 ${currentStep > step.id ? "bg-primary" : "bg-border"}`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
          <fieldset disabled={form.formState.isSubmitting} className="contents">
            {currentStep === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Container className="h-5 w-5 text-primary" />
                    基本信息
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="contractNo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>合同编号</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={contractNoLoading} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="signedAt"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <Label htmlFor="sales-signed-at" className="mb-1.5">
                          签订日期
                        </Label>
                        <DatePicker
                          className="w-full min-w-0"
                          date={field.value}
                          setDate={field.onChange}
                          triggerProps={{
                            id: "sales-signed-at",
                            name: "signedAt",
                          }}
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
                        <FormLabel>
                          汇率 <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            onChange={(event) =>
                              field.onChange(Number(event.target.value))
                            }
                          />
                        </FormControl>
                        <FormDescription>
                          默认: {DEFAULT_EXCHANGE_RATE}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="md:col-span-3">
                    <FormField
                      control={form.control}
                      name="note"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>备注</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="填写备注信息（可选）"
                              className="min-h-[80px]"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
                <div className="px-6 pb-6 flex flex-wrap justify-end gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.back()}
                  >
                    取消
                  </Button>
                  <Button type="button" onClick={goToStep2}>
                    下一步：出口明细
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </Card>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                {/* 利润概览 */}
                <Card className="border-border/60">
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          合同总额
                        </p>
                        <p className="text-lg font-bold tabular-nums">
                          ${totalAmount.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          总成本 (¥)
                        </p>
                        <p className="text-lg font-bold tabular-nums">
                          ¥{totalCost.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          预估利润 (¥)
                        </p>
                        <p
                          className={`text-lg font-bold tabular-nums ${totalProfit >= 0 ? "text-emerald-600" : "text-destructive"}`}
                        >
                          ¥{Math.round(totalProfit).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                          利润率
                        </p>
                        <p
                          className={`text-lg font-bold tabular-nums ${profitMargin >= 0 ? "text-emerald-600" : "text-destructive"}`}
                        >
                          {profitMargin.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-4">
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-primary" />
                      出口明细
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {fields.map((field, index) => (
                      <div
                        key={field.id}
                        className="rounded-xl border border-border/60 p-4 space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            第 {index + 1} 项
                          </span>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-destructive"
                              onClick={() => remove(index)}
                            >
                              <Trash className="h-3.5 w-3.5 mr-1" />
                              删除
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-12 items-end">
                          {/* 商品选择 */}
                          <div className="md:col-span-4">
                            <FormField
                              control={form.control}
                              name={`items.${index}.productId`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    商品{" "}
                                    <span className="text-destructive">*</span>
                                  </FormLabel>
                                  <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground z-10" />
                                    <Input
                                      placeholder="搜索商品..."
                                      value={productSearch}
                                      onChange={(e) =>
                                        setProductSearch(e.target.value)
                                      }
                                      className="pl-8 h-9 text-sm mb-1.5"
                                    />
                                  </div>
                                  <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="h-9 w-full">
                                        <SelectValue placeholder="选择商品" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="max-h-[280px]">
                                      {filteredProducts.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                          <div className="flex items-center gap-2">
                                            <Package className="h-3 w-3 text-muted-foreground" />
                                            <span>{p.customsName}</span>
                                            {p.hsCode && (
                                              <span className="text-[10px] text-muted-foreground font-mono">
                                                HS:{p.hsCode}
                                              </span>
                                            )}
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* 门店选择 */}
                          <div className="md:col-span-3">
                            <FormField
                              control={form.control}
                              name={`items.${index}.storeId`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    门店{" "}
                                    <span className="text-destructive">*</span>
                                  </FormLabel>
                                  <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground z-10" />
                                    <Input
                                      placeholder="搜索门店..."
                                      value={storeSearch}
                                      onChange={(e) =>
                                        setStoreSearch(e.target.value)
                                      }
                                      className="pl-8 h-9 text-sm mb-1.5"
                                    />
                                  </div>
                                  <Select
                                    onValueChange={field.onChange}
                                    defaultValue={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger className="h-9 w-full">
                                        <SelectValue placeholder="选择门店" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="max-h-[280px]">
                                      {filteredStores.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                          <div className="flex items-center gap-2">
                                            <StoreIcon className="h-3 w-3 text-muted-foreground" />
                                            <span>{s.name}</span>
                                            {s.port?.name && (
                                              <span className="text-[10px] text-muted-foreground">
                                                {s.port.name}
                                              </span>
                                            )}
                                          </div>
                                        </SelectItem>
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
                                  <FormLabel>
                                    数量{" "}
                                    <span className="text-destructive">*</span>
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      {...field}
                                      onChange={(event) =>
                                        field.onChange(
                                          Number(event.target.value),
                                        )
                                      }
                                      className="h-9"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="md:col-span-3">
                            <FormField
                              control={form.control}
                              name={`items.${index}.unit`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>单位</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      placeholder="件 / 箱 / kg"
                                      className="h-9"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>

                        {/* 定价行 */}
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-12 items-end">
                          <div className="md:col-span-3">
                            <FormField
                              control={form.control}
                              name={`items.${index}.costPrice`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    成本 (¥){" "}
                                    <span className="text-destructive">*</span>
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      {...field}
                                      className="h-9"
                                      onChange={(e) =>
                                        handleCostChange(
                                          index,
                                          Number(e.target.value),
                                        )
                                      }
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="md:col-span-3">
                            <FormField
                              control={form.control}
                              name={`items.${index}.sellingPrice`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>
                                    售价 ($){" "}
                                    <span className="text-destructive">*</span>
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      {...field}
                                      onChange={(event) =>
                                        field.onChange(
                                          Number(event.target.value),
                                        )
                                      }
                                      className="h-9"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* 实时利润计算 */}
                          <div className="md:col-span-6">
                            <div className="rounded-lg bg-muted/50 p-3">
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <Calculator className="h-3 w-3 text-muted-foreground" />
                                <span className="text-[11px] text-muted-foreground">
                                  实时计算
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-4">
                                <div>
                                  <p className="text-[10px] text-muted-foreground">
                                    小计 ($)
                                  </p>
                                  <p className="text-sm font-semibold tabular-nums">
                                    $
                                    {(
                                      watchItems[index]?.quantity *
                                        watchItems[index]?.sellingPrice || 0
                                    ).toLocaleString()}
                                  </p>
                                </div>
                                <div className="h-6 w-px bg-border" />
                                <div>
                                  <p className="text-[10px] text-muted-foreground">
                                    成本 (¥)
                                  </p>
                                  <p className="text-sm font-semibold tabular-nums">
                                    ¥
                                    {(
                                      watchItems[index]?.quantity *
                                        watchItems[index]?.costPrice || 0
                                    ).toLocaleString()}
                                  </p>
                                </div>
                                <div className="h-6 w-px bg-border" />
                                <div>
                                  <p className="text-[10px] text-muted-foreground">
                                    利润 (¥)
                                  </p>
                                  <p
                                    className={`text-sm font-semibold tabular-nums ${
                                      (watchItems[index]?.quantity *
                                        watchItems[index]?.sellingPrice || 0) *
                                        exchangeRate -
                                        (watchItems[index]?.quantity *
                                          watchItems[index]?.costPrice || 0) >=
                                      0
                                        ? "text-emerald-600"
                                        : "text-destructive"
                                    }`}
                                  >
                                    ¥
                                    {Math.round(
                                      (watchItems[index]?.quantity *
                                        watchItems[index]?.sellingPrice || 0) *
                                        exchangeRate -
                                        (watchItems[index]?.quantity *
                                          watchItems[index]?.costPrice || 0),
                                    ).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div>
                          <FormField
                            control={form.control}
                            name={`items.${index}.note`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>备注</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder="可选备注"
                                    className="h-9"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        append({
                          productId: "",
                          storeId: "",
                          quantity: 0,
                          unit: "",
                          costPrice: 0,
                          sellingPrice: 0,
                          note: "",
                        })
                      }
                      className="w-full h-10"
                    >
                      <Plus className="h-4 w-4 mr-2" /> 添加商品
                    </Button>
                  </CardContent>
                  <div className="px-6 pb-6 flex flex-wrap justify-end gap-3">
                    <Button type="button" variant="outline" onClick={goToStep1}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      上一步
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => router.back()}
                    >
                      取消
                    </Button>
                    <Button
                      type="submit"
                      size="lg"
                      disabled={form.formState.isSubmitting}
                    >
                      {form.formState.isSubmitting ? "提交中..." : "创建合同"}
                    </Button>
                  </div>
                </Card>
              </div>
            )}
          </fieldset>
        </form>
      </Form>
    </div>
  );
}
