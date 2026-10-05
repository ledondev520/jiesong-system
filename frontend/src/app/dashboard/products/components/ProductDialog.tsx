/**
 * Input: 已保存商品数据、独立编辑会话、HSCode 查询
 * Output: 取消丢弃编辑、同名手动匹配不被重复防抖隐藏、异步结果仅更新当前会话
 * Pos: 商品管理组件，支持录入报关名、HS编码、申报要素、规格、体积、重量等信息
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import {
  BusinessWrite,
  useBusinessReadOnly,
} from "@/lib/hooks/useBusinessReadOnly";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Product } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { hsCodeService, type HsCodeMatch } from "@/services/hsCode.service";

const productSchema = z.object({
  customsName: z.string().min(1, "请输入报关名称"),
  hsCode: z.string().optional(),
  taxRate: z.number().min(0).max(100).optional().nullable(),
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

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

export function ProductDialog(props: ProductDialogProps) {
  // Closing or switching records ends the edit session, including form/debounce state.
  if (!props.open) return null;
  return (
    <ProductDialogSession key={props.product?.id ?? "new-product"} {...props} />
  );
}

function ProductDialogSession({
  open,
  onOpenChange,
  product,
  onSubmit,
}: ProductDialogProps) {
  const readOnly = useBusinessReadOnly();
  const [hsSuggestions, setHsSuggestions] = useState<HsCodeMatch[]>([]);
  const [hsLoading, setHsLoading] = useState(false);
  const [hsLookupMessage, setHsLookupMessage] = useState<string | null>(null);
  const [fillingCode, setFillingCode] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const activeSession = useRef(true);
  const latestSearch = useRef(0);
  const latestSelection = useRef(0);
  const requestedName = useRef<string | null>(null);

  useEffect(() => {
    activeSession.current = true;
    return () => {
      activeSession.current = false;
      latestSearch.current += 1;
      latestSelection.current += 1;
    };
  }, []);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      customsName: "",
      hsCode: "",
      taxRate: null,
      declaration: "",
      description: "",
      specification: "",
      unit: "",
      packingSpec: "",
      grossWeight: null,
      netWeight: null,
      volume: null,
      length: null,
      width: null,
      height: null,
    },
    values: product
      ? {
          customsName: product.customsName,
          hsCode: product.hsCode || "",
          taxRate: null,
          declaration: product.declaration || "",
          description: product.description || "",
          specification: product.specification || "",
          unit: product.unit || "",
          packingSpec: product.packingSpec || "",
          grossWeight: product.grossWeight ?? null,
          netWeight: product.netWeight ?? null,
          volume: product.volume ?? null,
          length: product.length ?? null,
          width: product.width ?? null,
          height: product.height ?? null,
        }
      : undefined,
  });

  const customsName = form.watch("customsName");
  const debouncedCustomsName = useDebouncedValue(customsName, 350);

  useEffect(() => {
    // A new name also invalidates requests when the user returns to an earlier name.
    requestedName.current = null;
    latestSearch.current += 1;
    latestSelection.current += 1;
    setHsSuggestions([]);
    setHsLoading(false);
    setFillingCode(null);
    const keyword = customsName.trim();
    setHsLookupMessage(
      keyword.length > 0 && keyword.length < 2
        ? "至少输入 2 个字符开始匹配"
        : null,
    );
  }, [customsName]);

  const loadHsSuggestions = useCallback(
    async (rawKeyword: string): Promise<void> => {
      const keyword = rawKeyword.trim();
      if (
        !activeSession.current ||
        keyword !== form.getValues("customsName").trim()
      )
        return;
      const request = ++latestSearch.current;
      const isCurrent = () =>
        activeSession.current &&
        request === latestSearch.current &&
        keyword === form.getValues("customsName").trim();

      if (keyword.length < 2) {
        setHsSuggestions([]);
        setHsLookupMessage(
          keyword.length === 0 ? null : "至少输入 2 个字符开始匹配",
        );
        setHsLoading(false);
        return;
      }

      requestedName.current = keyword;
      setHsLoading(true);
      setHsLookupMessage(null);

      try {
        const searchMethod =
          hsCodeService.searchByProductName ?? hsCodeService.search;
        const response = await searchMethod(keyword);
        if (!isCurrent()) return;
        const matches = response.data || [];
        setHsSuggestions(matches);
        setHsLookupMessage(
          matches.length === 0 ? "未找到匹配的 HSCode 建议" : null,
        );
      } catch {
        if (!isCurrent()) return;
        setHsSuggestions([]);
        setHsLookupMessage("HSCode 建议加载失败，请稍后重试");
      } finally {
        if (isCurrent()) setHsLoading(false);
      }
    },
    [form],
  );

  useEffect(() => {
    const keyword = debouncedCustomsName.trim();
    // Manual matching already requested this name, even when that attempt failed.
    // Only automatic duplicates are skipped; the button still performs real retries.
    if (keyword !== customsName.trim() || requestedName.current === keyword)
      return;
    void loadHsSuggestions(keyword);
  }, [customsName, debouncedCustomsName, loadHsSuggestions]);

  const handleSelectHsCode = async (suggestion: HsCodeMatch): Promise<void> => {
    const request = ++latestSelection.current;
    const keyword = form.getValues("customsName").trim();
    const isCurrent = () =>
      activeSession.current &&
      request === latestSelection.current &&
      keyword === form.getValues("customsName").trim();
    setFillingCode(suggestion.hsCode);

    try {
      const getByCodeMethod =
        hsCodeService.searchByHsCode ?? hsCodeService.getByCode;
      const response = getByCodeMethod
        ? await getByCodeMethod(suggestion.hsCode)
        : null;
      if (!isCurrent()) return;
      const detail = response?.data ?? suggestion;

      form.setValue("hsCode", detail.hsCode, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("taxRate", detail.taxRate ?? suggestion.taxRate ?? null, {
        shouldDirty: true,
      });

      if (!form.getValues("customsName")) {
        form.setValue(
          "customsName",
          detail.productName || suggestion.productName,
          {
            shouldDirty: true,
            shouldValidate: true,
          },
        );
      }
      if (!form.getValues("unit") && detail.unit) {
        form.setValue("unit", detail.unit, { shouldDirty: true });
      }

      setHsLookupMessage(`已匹配 HSCode ${detail.hsCode}`);
    } catch {
      if (isCurrent()) setHsLookupMessage("HSCode 详情加载失败，请稍后重试");
    } finally {
      if (isCurrent()) setFillingCode(null);
    }
  };

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
    if (submitting.current || !activeSession.current) return;
    submitting.current = true;
    setSaving(true);
    // Freeze pending matches along with the submitted fields.
    latestSearch.current += 1;
    latestSelection.current += 1;
    setHsLoading(false);
    setFillingCode(null);
    // 转换空值为 null
    const submitData = {
      ...data,
      taxRate: data.taxRate || null,
      grossWeight: data.grossWeight || null,
      netWeight: data.netWeight || null,
      volume: data.volume || null,
      length: data.length || null,
      width: data.width || null,
      height: data.height || null,
    };
    setSaveError(null);
    try {
      await onSubmit(submitData);
      if (activeSession.current) form.reset();
    } catch {
      if (activeSession.current) {
        setSaveError("保存失败，请稍后重试");
      }
    } finally {
      submitting.current = false;
      if (activeSession.current) setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {readOnly ? "商品详情" : product ? "编辑商品" : "新增商品"}
          </DialogTitle>
          <DialogDescription>
            维护商品基础资料，并可通过商品名称自动匹配 HSCode 与税率。
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-4"
          >
            <fieldset disabled={readOnly || saving} className="space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="customsName"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>报关名称 *</FormLabel>
                      <FormControl>
                        <Input placeholder="请输入商品报关名" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="sm:col-span-2 rounded-xl border border-border/70 bg-muted/30 p-4">
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">HS 编码智能匹配</p>
                      <p className="text-xs text-muted-foreground">
                        基于报关名称自动推荐编码，也可点击按钮立即发起匹配。
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void loadHsSuggestions(
                          form.getValues("customsName") || "",
                        )
                      }
                      disabled={hsLoading}
                    >
                      HSCode 智能匹配
                    </Button>
                    {hsLoading ? (
                      <p className="text-xs text-muted-foreground">
                        正在匹配 HSCode...
                      </p>
                    ) : null}
                    {!hsLoading && hsSuggestions.length > 0 ? (
                      <div className="space-y-2">
                        {hsSuggestions.map((suggestion) => (
                          <button
                            key={`${suggestion.hsCode}-${suggestion.productName}`}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/70 bg-background px-3 py-2 text-left transition hover:border-primary/40 hover:bg-muted/50"
                            onClick={() => void handleSelectHsCode(suggestion)}
                            disabled={fillingCode === suggestion.hsCode}
                          >
                            <span className="min-w-0">
                              <span className="block text-sm font-medium">
                                {suggestion.productName}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {suggestion.hsCode}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {fillingCode === suggestion.hsCode
                                ? "填充中..."
                                : `税率 ${suggestion.taxRate}%`}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {hsLookupMessage ? (
                      <p className="text-xs text-muted-foreground">
                        {hsLookupMessage}
                      </p>
                    ) : null}
                  </div>
                </div>
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
                  name="taxRate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>税率(%)</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="例如: 13"
                          {...field}
                          value={field.value == null ? "" : `${field.value}%`}
                          readOnly
                          onChange={(e) =>
                            field.onChange(
                              e.target.value
                                ? parseFloat(e.target.value.replace("%", ""))
                                : null,
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        由 HSCode 智能匹配结果自动带出
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="declaration"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>申报要素</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="例如: 抛光瓷砖，釉面，600x600mm"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* 尺寸信息（用于3D可视化） */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">
                  尺寸信息（用于3D装箱可视化）
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? parseFloat(e.target.value)
                                  : null,
                              )
                            }
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
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? parseFloat(e.target.value)
                                  : null,
                              )
                            }
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
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? parseFloat(e.target.value)
                                  : null,
                              )
                            }
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="packingSpec"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>包装规格</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="例如: 4片/箱, 10个/包"
                            {...field}
                          />
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
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? parseFloat(e.target.value)
                                  : null,
                              )
                            }
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
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? parseFloat(e.target.value)
                                  : null,
                              )
                            }
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
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? parseFloat(e.target.value)
                                  : null,
                              )
                            }
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

              {saveError ? (
                <p role="alert" className="text-sm text-destructive">
                  {saveError}
                </p>
              ) : null}
              <DialogFooter>
                <BusinessWrite>
                  <Button
                    type="submit"
                    disabled={!form.formState.isValid || saving}
                  >
                    {saving ? "保存中..." : "保存"}
                  </Button>
                </BusinessWrite>
              </DialogFooter>
            </fieldset>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
