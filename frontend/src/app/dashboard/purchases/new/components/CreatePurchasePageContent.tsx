/**
 * Input: purchaseService, supplierService, productService
 * Output: 支持独立内联供应商编辑会话的采购表单；迟到保存不覆盖当前选择或草稿
 * Pos: 采购合同创建入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loadPaginatedCatalog } from "@/services/paginatedCatalog";
import { invalidateCache } from "@/lib/api-cache";
import { ErrorState } from "@/components/ui/data-state";
import { Product, Supplier, PurchaseContract } from "@/types";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Save, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  ParsedQuoteItem,
  PurchaseCreatePayload,
  purchaseService,
} from "@/services/purchase.service";
import type {
  PriceHistoryWithSuppliers,
  SupplierPriceSummary,
} from "@/services/priceComparison";
import { supplierService } from "@/services/supplier.service";
import { productService } from "@/services/product.service";
import { contractTemplateService } from "@/services/contractTemplate.service";
import { ContractTemplate } from "@/types";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  emptyNewSupplier,
  purchaseSchema,
  StepIndicator,
  type PurchaseFormValues,
  type RecommendedSupplier,
} from "./purchaseFormParts";
import { PurchaseItemsStep } from "./PurchaseItemsStep";
import { PurchaseContractStep } from "./PurchaseContractStep";
import { BatchProductDialog } from "./BatchProductDialog";
import { NewSupplierDialog } from "./NewSupplierDialog";
import { SaveTemplateDialog } from "./SaveTemplateDialog";

export default function CreatePurchasePage() {
  const router = useRouter();
  const editId = useSearchParams().get("editId");
  const [loadError, setLoadError] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  // 基础数据
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [contractNoLoading, setContractNoLoading] = useState(true);

  // 供应商 Combobox
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");

  // 推荐供应商（根据选中商品）
  const [recommendedSupplierIds, setRecommendedSupplierIds] = useState<
    Set<string>
  >(new Set());

  // 新增供应商弹窗
  const [showNewSupplierDialog, setShowNewSupplierDialog] = useState(false);
  const [newSupplierForm, setNewSupplierForm] = useState(emptyNewSupplier);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const supplierSession = useRef(0);
  const pendingSupplierSave = useRef<number | null>(null);
  const mounted = useRef(false);
  const contractContext = useRef(0);
  const catalogRequest = useRef(0);

  const changeSupplierDialog = useCallback((open: boolean, name = "") => {
    supplierSession.current += 1;
    pendingSupplierSave.current = null;
    setSavingSupplier(false);
    setNewSupplierForm({ ...emptyNewSupplier, name });
    setShowNewSupplierDialog(open);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      supplierSession.current += 1;
      contractContext.current += 1;
      catalogRequest.current += 1;
    };
  }, []);

  useEffect(() => {
    contractContext.current += 1;
    setSupplierOpen(false);
    setSupplierSearch("");
    changeSupplierDialog(false);
  }, [editId, changeSupplierDialog]);

  // AI 解析
  const [parseText, setParseText] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  // 合同模板
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // 批量商品选择器
  const [showBatchSelector, setShowBatchSelector] = useState(false);
  const [batchSearch, setBatchSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    new Set(),
  );

  // 表单
  const form = useForm<PurchaseFormValues>({
    resolver: zodResolver(purchaseSchema),
    defaultValues: {
      supplierId: "",
      contractNo: "",
      signedAt: undefined,
      taxRate: 13,
      note: "",
      items: [
        {
          productId: "",
          quantity: 0,
          unitPrice: 0,
          unit: "",
          note: "",
          priceNote: "",
        },
      ],
    },
  });

  // 商品价格历史缓存（按 productId）
  const [priceHistoryMap, setPriceHistoryMap] = useState<
    Record<string, PriceHistoryWithSuppliers>
  >({});

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchItems = useWatch({ control: form.control, name: "items" });
  const watchSupplierId = useWatch({
    control: form.control,
    name: "supplierId",
  });
  const watchTaxRate =
    useWatch({ control: form.control, name: "taxRate" }) ?? 13;

  useEffect(() => {
    if (!form.getValues("signedAt")) {
      form.setValue("signedAt", new Date(), { shouldDirty: false });
    }
  }, [form]);

  // 计算总价
  const totalAmount = watchItems.reduce((sum, item) => {
    return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  }, 0);

  // ============== 加载商品价格历史 ==============
  const productIdsKey = useMemo(
    () =>
      watchItems
        .map((i) => i.productId)
        .filter(Boolean)
        .sort()
        .join(","),
    [watchItems],
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

  const supplierRows = (item: { productId?: string } | undefined) =>
    priceHistoryMap[item?.productId ?? ""]?.bySupplier ?? [];

  const pickSupplier = (index: number, row: SupplierPriceSummary) => {
    form.setValue("supplierId", row.supplierId, { shouldDirty: true });
    form.setValue(`items.${index}.unitPrice`, row.lastPrice, {
      shouldDirty: true,
    });
  };

  // ============== 加载合同模板 ==============
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const res = await contractTemplateService.getByType("PURCHASE");
        setTemplates(res.data || []);
      } catch {
        // 静默失败，模板功能是辅助性的
      } finally {
        setTemplatesLoading(false);
      }
    };
    void loadTemplates();
  }, []);

  // 创建与草稿更正复用完整目录和同一表单。
  const loadData = useCallback(async () => {
    const request = ++catalogRequest.current;
    setDataLoading(true);
    setLoadError(false);
    try {
      const [allSuppliers, allProducts, contractRes] = await Promise.all([
        loadPaginatedCatalog((page) =>
          supplierService.getAll({ page, pageSize: 100, lite: true }),
        ),
        loadPaginatedCatalog((page) =>
          productService.getAll({ page, pageSize: 100, lite: true }),
        ),
        editId
          ? purchaseService.getById(editId)
          : purchaseService.getNextContractNo(),
      ]);
      if (!mounted.current || request !== catalogRequest.current) return;
      setSuppliers(allSuppliers);
      setProducts(allProducts);
      if (editId && contractRes.data && "items" in contractRes.data) {
        const draft = contractRes.data as PurchaseContract;
        if (draft.status !== "DRAFT") throw new Error("仅草稿可更正");
        form.reset({
          supplierId: draft.supplierId,
          contractNo: draft.contractNo,
          signedAt: draft.signedAt ? new Date(draft.signedAt) : undefined,
          expectedDate: draft.expectedDate
            ? new Date(draft.expectedDate)
            : undefined,
          taxRate: draft.taxRate,
          note: draft.note ?? "",
          items: (draft.items ?? []).map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            unit: item.unit ?? "",
            note: item.note ?? "",
            priceNote: "",
          })),
        });
      } else if (contractRes.data?.contractNo) {
        form.setValue("contractNo", contractRes.data.contractNo);
      }
    } catch {
      if (mounted.current && request === catalogRequest.current) {
        setLoadError(true);
        toast.error("加载数据失败");
      }
    } finally {
      if (mounted.current && request === catalogRequest.current) {
        setDataLoading(false);
        setContractNoLoading(false);
      }
    }
  }, [editId, form]);
  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ============== 根据选中商品推荐供应商 ==============
  useEffect(() => {
    const selectedProductIds = watchItems
      .map((item) => item.productId)
      .filter((id) => id && id.length > 0);

    if (selectedProductIds.length === 0) {
      setRecommendedSupplierIds(new Set());
      return;
    }

    // 查询曾经供应过这些商品的供应商
    const fetchRecommendedSuppliers = async () => {
      try {
        const res =
          await purchaseService.getSuppliersByProducts(selectedProductIds);
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
            (s.contactName &&
              s.contactName
                .toLowerCase()
                .includes(supplierSearch.toLowerCase())),
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
        return a.name.localeCompare(b.name, "zh-CN");
      });
  }, [suppliers, supplierSearch, recommendedSupplierIds]);

  // ============== 新增供应商 ==============
  const handleSaveNewSupplier = async () => {
    const session = supplierSession.current;
    const context = contractContext.current;
    if (
      !mounted.current ||
      dataLoading ||
      loadError ||
      !showNewSupplierDialog ||
      pendingSupplierSave.current === session
    )
      return;
    if (!newSupplierForm.name.trim()) {
      toast.error("请输入供应商名称");
      return;
    }
    pendingSupplierSave.current = session;
    setSavingSupplier(true);
    const isCurrent = () =>
      mounted.current && session === supplierSession.current;
    try {
      const response = await supplierService.create(newSupplierForm);
      const newSupplier = response.data;
      invalidateCache("suppliers-list");
      // Closing the editor cannot undo a write; only its original session may select the result.
      if (mounted.current && context === contractContext.current) {
        setSuppliers((prev) => [
          newSupplier,
          ...prev.filter((item) => item.id !== newSupplier.id),
        ]);
      }
      if (!isCurrent()) return;
      form.setValue("supplierId", newSupplier.id);
      setSupplierSearch("");
      changeSupplierDialog(false);
      toast.success("供应商创建成功");
    } catch {
      if (isCurrent()) toast.error("创建供应商失败");
    } finally {
      if (pendingSupplierSave.current === session)
        pendingSupplierSave.current = null;
      if (isCurrent()) setSavingSupplier(false);
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
                return product.customsName
                  .toLowerCase()
                  .includes(item.productName.toLowerCase());
              });

          const fallbackNote = item.productName
            ? `AI识别商品：${item.productName}`
            : undefined;

          return {
            productId: matchedProduct?.id || item.productId || "",
            quantity: item.quantity || 0,
            unitPrice: item.unitPrice || 0,
            unit: item.unit || matchedProduct?.unit || "",
            note: item.note || fallbackNote || "",
          };
        });

        const unresolvedCount = normalizedItems.filter(
          (item) => !item.productId,
        ).length;
        normalizedItems.forEach((item) => append(item));

        if (unresolvedCount > 0) {
          toast.success(
            `解析完成，已添加 ${normalizedItems.length} 条，${unresolvedCount} 条需手动选择商品`,
          );
        } else {
          toast.success(`解析完成，已添加 ${normalizedItems.length} 条报价`);
        }
        setParseText("");
      } else {
        toast.error(result.message || "解析失败");
      }
    } catch {
      toast.error("解析失败");
    } finally {
      setIsParsing(false);
    }
  };

  // ============== 应用模板 ==============
  const handleApplyTemplate = (templateId: string) => {
    if (!templateId) {
      setSelectedTemplateId("");
      return;
    }
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;

    // 预填充表单
    if (template.supplierId) {
      form.setValue("supplierId", template.supplierId);
    }
    if (template.taxRate !== null && template.taxRate !== undefined) {
      form.setValue("taxRate", template.taxRate);
    }
    if (template.note) {
      form.setValue("note", template.note);
    }

    // 应用明细（仅保留当前仍存在的商品）
    const validItems = (template.items || []).filter((item) =>
      products.some((p) => p.id === item.productId),
    );
    if (validItems.length > 0) {
      form.setValue(
        "items",
        validItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity || 0,
          unitPrice: item.unitPrice || 0,
          unit: item.unit || "",
          note: item.note || "",
          priceNote: "",
        })),
      );
      if (validItems.length < (template.items || []).length) {
        toast.warning("部分模板商品已不存在，已自动过滤");
      }
    }

    setSelectedTemplateId(templateId);
    toast.success(`已应用模板：${template.name}`);
  };

  // ============== 保存为模板 ==============
  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("请输入模板名称");
      return;
    }
    const data = form.getValues();
    if (!data.items || data.items.length === 0) {
      toast.error("请至少添加一项商品");
      return;
    }

    setSavingTemplate(true);
    try {
      await contractTemplateService.create({
        name: templateName.trim(),
        type: "PURCHASE",
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
      toast.success("模板保存成功");
      setShowSaveTemplateDialog(false);
      setTemplateName("");
      // 刷新模板列表
      const res = await contractTemplateService.getByType("PURCHASE");
      setTemplates(res.data || []);
    } catch {
      toast.error("保存模板失败");
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
        unit: p.unit || "",
        note: "",
        priceNote: "",
      });
    });
    setSelectedProductIds(new Set());
    setShowBatchSelector(false);
    setBatchSearch("");
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
        if (
          history &&
          history.averagePrice !== null &&
          item.unitPrice > history.averagePrice * 1.1
        ) {
          if (!item.priceNote || item.priceNote.trim().length === 0) {
            setCurrentStep(1);
            form.setError(`items.${i}.priceNote`, {
              message: "请填写价格上涨原因",
            });
            toast.error(
              `第 ${i + 1} 项商品价格高于历史均价，请填写备注说明原因`,
            );
            return;
          }
        }
      }

      // 转换数据格式以匹配后端期望（将 priceNote 合并到 note）
      const submitData: PurchaseCreatePayload = {
        supplierId: data.supplierId,
        // 新增页的禁用编号只是预览，不能把过期预览作为显式编号提交。
        ...(editId ? { contractNo: data.contractNo } : {}),
        signedAt: data.signedAt?.toISOString(),
        expectedDate: data.expectedDate?.toISOString() ?? null,
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
            note: notes.join(" | ") || undefined,
          };
        }),
      };
      if (editId) {
        await purchaseService.update(editId, submitData);
        toast.success("草稿更正已保存");
      } else {
        const response = await purchaseService.create(submitData);
        toast.success("采购合同创建成功");
        if (response.data && "warnings" in response.data)
          response.data.warnings.forEach((warning) =>
            toast.warning(warning.message, { duration: 10000 }),
          );
      }
      invalidateCache("purchase-contracts-list");
      router.push(
        editId ? `/dashboard/purchases/${editId}` : "/dashboard/purchases",
      );
    } catch (error) {
      toast.error(
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "保存失败",
      );
    }
  };

  const goToStep1 = () => setCurrentStep(1);

  const goToStep2 = async () => {
    const valid = await form.trigger("items", { shouldFocus: true });
    if (!valid) {
      toast.error("请完善采购明细信息");
      return;
    }
    setCurrentStep(2);
  };

  // 当前选中的供应商
  const selectedSupplier = suppliers.find((s) => s.id === watchSupplierId);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <PageHeader
        title={editId ? "更正采购草稿" : "新增采购合同"}
        description="先添加商品，系统会推荐曾供应过该商品的供应商"
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              window.open(
                "/dashboard/products",
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            维护商品
          </Button>
        }
      />

      {loadError && (
        <ErrorState
          title="采购资料加载失败"
          action={
            <Button type="button" onClick={() => void loadData()}>
              重试
            </Button>
          }
        />
      )}

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
            <SelectTrigger className="h-10 w-full rounded-md text-xs sm:w-[240px]">
              <SelectValue
                placeholder={templatesLoading ? "加载中..." : "选择合同模板"}
              />
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
        steps={["采购明细", "合同信息"]}
        currentStep={currentStep}
        onChange={(step) => {
          if (step === 1) goToStep1();
          else void goToStep2();
        }}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, (errors) => {
              setCurrentStep(errors.items ? 1 : 2);
              toast.error(
                errors.items ? "请完善采购明细信息" : "请完善合同信息",
              );
            })}
            className="contents"
          >
            {currentStep === 1 && (
              <>
                <PurchaseItemsStep
                  form={form}
                  router={router}
                  fields={fields}
                  append={append}
                  remove={remove}
                  products={products}
                  parseText={parseText}
                  setParseText={setParseText}
                  isParsing={isParsing}
                  handleParse={handleParse}
                  setShowBatchSelector={setShowBatchSelector}
                  priceHistoryMap={priceHistoryMap}
                  supplierRows={supplierRows}
                  pickSupplier={pickSupplier}
                  watchItems={watchItems}
                  watchSupplierId={watchSupplierId}
                  watchTaxRate={watchTaxRate}
                  totalAmount={totalAmount}
                  goToStep2={goToStep2}
                />
              </>
            )}

            {currentStep === 2 && (
              <>
                <PurchaseContractStep
                  form={form}
                  editId={editId}
                  router={router}
                  dataLoading={dataLoading}
                  loadError={loadError}
                  contractNoLoading={contractNoLoading}
                  goToStep1={goToStep1}
                  supplierOpen={supplierOpen}
                  setSupplierOpen={setSupplierOpen}
                  supplierSearch={supplierSearch}
                  setSupplierSearch={setSupplierSearch}
                  sortedSuppliers={sortedSuppliers}
                  recommendedSupplierIds={recommendedSupplierIds}
                  selectedSupplier={selectedSupplier}
                  changeSupplierDialog={changeSupplierDialog}
                />
              </>
            )}
          </form>
        </Form>
      </div>

      {/* 批量商品选择器弹窗 */}
      <BatchProductDialog
        showBatchSelector={showBatchSelector}
        setShowBatchSelector={setShowBatchSelector}
        batchSearch={batchSearch}
        setBatchSearch={setBatchSearch}
        selectedProductIds={selectedProductIds}
        setSelectedProductIds={setSelectedProductIds}
        filteredBatchProducts={filteredBatchProducts}
        handleBatchAdd={handleBatchAdd}
      />

      {/* 新增供应商弹窗 */}
      <NewSupplierDialog
        showNewSupplierDialog={showNewSupplierDialog}
        changeSupplierDialog={changeSupplierDialog}
        savingSupplier={savingSupplier}
        newSupplierForm={newSupplierForm}
        setNewSupplierForm={setNewSupplierForm}
        handleSaveNewSupplier={handleSaveNewSupplier}
        dataLoading={dataLoading}
        loadError={loadError}
      />

      {/* 保存模板弹窗 */}
      <SaveTemplateDialog
        showSaveTemplateDialog={showSaveTemplateDialog}
        setShowSaveTemplateDialog={setShowSaveTemplateDialog}
        templateName={templateName}
        setTemplateName={setTemplateName}
        savingTemplate={savingTemplate}
        handleSaveTemplate={handleSaveTemplate}
      />
    </div>
  );
}
