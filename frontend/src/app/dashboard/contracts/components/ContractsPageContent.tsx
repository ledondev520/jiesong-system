/**
 * Input: 采购合同服务、SortableTableHead、useTableSort
 * Output: 手机前置操作与双列紧凑概览的采购合同管理页面（合同号/供应商/商品服务端检索、分页、具名桌面操作）
 * Pos: 核心业务页面，管理供应商采购合同
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import {
  BusinessWrite,
  useBusinessReadOnly,
} from "@/lib/hooks/useBusinessReadOnly";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ModuleTabHeader,
  PROCUREMENT_TABS,
} from "@/components/layout/ModuleTabHeader";
import { useRouter, useSearchParams } from "next/navigation";
import { PurchaseContract, PurchaseStatus, PurchaseItem } from "@/types";
import { purchaseService } from "@/services/purchase.service";
import { cachedFetch, invalidateCache } from "@/lib/api-cache";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuthStore } from "@/store/auth.store";
import { ErrorState } from "@/components/ui/data-state";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AmountText } from "@/components/ui/amount-text";
import {
  Plus,
  Eye,
  ShoppingCart,
  Package,
  Loader2,
  FileDown,
  Filter,
  X,
  FileText,
  Store,
  Truck,
  Upload,
  Download,
  Circle,
  CheckCircle2,
  PackageCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { contractDocService } from "@/services/contractDoc.service";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { Card, CardContent } from "@/components/ui/card";
import { useTableSort } from "@/lib/hooks/useTableSort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// 扩展类型
interface PurchaseContractDetail extends PurchaseContract {
  items?: PurchaseItem[];
}

interface TemplateInfoItem {
  exists: boolean;
  filename?: string;
  size?: number;
  updatedAt?: string;
}

/**
 * 职责：生成分页页码数组
 */
function getPageNumbers(
  current: number,
  total: number,
): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "ellipsis")[] = [1];
  if (current > 4) pages.push("ellipsis");
  const start = Math.max(2, current - 2);
  const end = Math.min(total - 1, current + 2);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 3) pages.push("ellipsis");
  if (total > 1) pages.push(total);
  return pages;
}

/**
 * 职责：状态 pill 组件（带图标）
 */
function StatusPill({ status }: { status: PurchaseStatus }) {
  const config: Record<
    PurchaseStatus,
    { label: string; icon: React.ReactNode; className: string }
  > = {
    [PurchaseStatus.DRAFT]: {
      label: "草稿",
      icon: <Circle className="h-3 w-3 fill-current" />,
      className:
        "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-950 dark:text-slate-400 dark:border-slate-800",
    },
    [PurchaseStatus.SIGNED]: {
      label: "已确认",
      icon: <CheckCircle2 className="h-3 w-3" />,
      className:
        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800",
    },
    [PurchaseStatus.PRODUCING]: {
      label: "生产中",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      className:
        "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800",
    },
    [PurchaseStatus.READY]: {
      label: "生产完成",
      icon: <PackageCheck className="h-3 w-3" />,
      className:
        "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-400 dark:border-cyan-800",
    },
    [PurchaseStatus.SHIPPED]: {
      label: "已发货",
      icon: <Truck className="h-3 w-3" />,
      className:
        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800",
    },
    [PurchaseStatus.RECEIVED]: {
      label: "已收货",
      icon: <PackageCheck className="h-3 w-3" />,
      className:
        "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-400 dark:border-violet-800",
    },
    [PurchaseStatus.COMPLETED]: {
      label: "已完成",
      icon: <CheckCircle2 className="h-3 w-3" />,
      className:
        "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800",
    },
    [PurchaseStatus.CANCELLED]: {
      label: "已取消",
      icon: <X className="h-3 w-3" />,
      className:
        "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800",
    },
  };

  const c = config[status] || config[PurchaseStatus.DRAFT];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        c.className,
      )}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

/**
 * 职责：根据采购状态返回左侧色条颜色
 */
const getPurchaseStatusColor = (status: PurchaseStatus) => {
  switch (status) {
    case PurchaseStatus.DRAFT:
    case PurchaseStatus.SIGNED:
      return "#3b82f6";
    case PurchaseStatus.PRODUCING:
    case PurchaseStatus.READY:
    case PurchaseStatus.SHIPPED:
      return "#f59e0b";
    case PurchaseStatus.RECEIVED:
    case PurchaseStatus.COMPLETED:
      return "#10b981";
    case PurchaseStatus.CANCELLED:
      return "#ef4444";
    default:
      return "#10b981";
  }
};

/**
 * 职责：金额格式化（CNY=绿色）
 */
function formatAmount(amount: number) {
  return (
    <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
      ¥{amount.toLocaleString()}
    </span>
  );
}

export default function ContractsPageContent() {
  const readOnly = useBusinessReadOnly();
  const canImportHistory = useAuthStore(
    (state) => state.user?.role === "ADMIN",
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get("status") || "ALL";

  // 筛选状态
  const [purchaseStatusFilter, setPurchaseStatusFilter] =
    useState(statusFromUrl);
  const [productSearch, setProductSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // 分页状态
  const [purchasePage, setPurchasePage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 同步URL参数变化
  useEffect(() => {
    setPurchaseStatusFilter(statusFromUrl || "ALL");
  }, [statusFromUrl]);

  // 采购合同状态
  const [purchaseContracts, setPurchaseContracts] = useState<
    PurchaseContract[]
  >([]);
  const [purchaseLoading, setPurchaseLoading] = useState(true);
  const [purchaseError, setPurchaseError] = useState(false);
  const purchaseRequest = useRef(0);
  const [purchaseTotal, setPurchaseTotal] = useState(0);
  const [listSummary, setListSummary] = useState<{
    statusCounts: Record<string, number>;
    stores: string[];
  }>({ statusCounts: {}, stores: [] });

  const filteredPurchaseContracts = purchaseContracts;

  /**
   * 职责：按列从采购合同中取出用于排序的可比字段
   */
  const purchaseAccessor = useCallback(
    (item: PurchaseContract, key: string) => {
      switch (key) {
        case "contractNo":
          return item.contractNo;
        case "supplier":
          return item.supplier?.name ?? "";
        case "signedAt":
          return item.signedAt ? new Date(item.signedAt).getTime() : null;
        case "totalAmount":
          return item.totalAmount;
        case "paidAmount":
          return item.paidAmount;
        case "status":
          return item.status;
        default:
          return null;
      }
    },
    [],
  );

  const purchaseSort = useTableSort(
    filteredPurchaseContracts,
    purchaseAccessor,
  );

  const purchaseTotalPages = Math.ceil(purchaseTotal / pageSize);
  const pagedPurchaseContracts = purchaseSort.sortedData;
  const procurementOverview = {
    activeContracts: ["DRAFT", "SIGNED", "PRODUCING", "READY"].reduce(
      (sum, status) => sum + (listSummary.statusCounts[status] ?? 0),
      0,
    ),
    producingContracts: listSummary.statusCounts.PRODUCING ?? 0,
    shippedPendingReceipt: listSummary.statusCounts.SHIPPED ?? 0,
    activeStores: listSummary.stores.length,
  };

  // 筛选或每页条数变化时重置页码
  useEffect(() => {
    setPurchasePage(1);
  }, [purchaseStatusFilter, storeFilter, productSearch, pageSize]);

  // 采购详情弹窗状态
  const [detailOpen, setDetailOpen] = useState(false);
  const detailLoading = false;
  const [purchaseDetail, setPurchaseDetail] =
    useState<PurchaseContractDetail | null>(null);

  // 生成合同文档弹窗状态
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(
    null,
  );
  const [generateForm, setGenerateForm] = useState({
    storeName: "",
    deliveryAddress: "",
    deliveryContact: "",
    depositRate: "30",
  });

  // 批量导入导出状态
  const [importLoading, setImportLoading] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [historicalImport, setHistoricalImport] = useState(false);
  const [importResultOpen, setImportResultOpen] = useState(false);
  const [importResult, setImportResult] = useState<{
    successRows: number;
    failedRows: number;
    errors: { row: number; error: string }[];
  } | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateItems, setTemplateItems] = useState<TemplateInfoItem[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [selectedTemplateFile, setSelectedTemplateFile] = useState<File | null>(
    null,
  );
  const [templateUploading, setTemplateUploading] = useState(false);
  const [templateDeleting, setTemplateDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 0. 初始化加载
  useEffect(() => {
    loadPurchaseContracts();
  }, [
    purchasePage,
    pageSize,
    purchaseStatusFilter,
    storeFilter,
    productSearch,
  ]);

  const currentTemplate = useMemo(
    () => templateItems.find((item) => item.exists) || templateItems[0] || null,
    [templateItems],
  );

  const loadContractTemplates = useCallback(async () => {
    setTemplateLoading(true);
    try {
      const response = await cachedFetch("contract-templates", () =>
        contractDocService.getTemplates(),
      );
      setTemplateItems(response.data?.items || []);
    } catch {
      toast.error("加载合同模板失败");
    } finally {
      setTemplateLoading(false);
    }
  }, []);

  useEffect(() => {
    if (templateDialogOpen) {
      void loadContractTemplates();
    }
  }, [loadContractTemplates, templateDialogOpen]);

  // 1. 加载采购合同（带缓存，pageSize 降至 100 减少负载）
  const loadPurchaseContracts = async () => {
    const request = ++purchaseRequest.current;
    setPurchaseLoading(true);
    setPurchaseError(false);
    try {
      const params = {
        page: purchasePage,
        pageSize,
        status:
          purchaseStatusFilter !== "ALL" ? purchaseStatusFilter : undefined,
        storeName:
          storeFilter && storeFilter !== "ALL" ? storeFilter : undefined,
        keyword: productSearch.trim() || undefined,
      };
      const response = await cachedFetch(
        `purchase-contracts-list-${JSON.stringify(params)}`,
        () => purchaseService.getAll(params),
      );
      if (request !== purchaseRequest.current) return;
      setPurchaseContracts(response.data?.items || []);
      setPurchaseTotal(response.data?.pagination?.total ?? 0);
      if (response.data?.summary) setListSummary(response.data.summary);
    } catch {
      if (request !== purchaseRequest.current) return;
      setPurchaseError(true);
      toast.error("加载采购合同失败");
    } finally {
      if (request === purchaseRequest.current) setPurchaseLoading(false);
    }
  };

  // 4. 打开生成合同文档弹窗
  const openGenerateDialog = (purchaseId: string) => {
    setSelectedPurchaseId(purchaseId);
    setGenerateForm({
      storeName: "",
      deliveryAddress: "",
      deliveryContact: "",
      depositRate: "30",
    });
    setGenerateOpen(true);
  };

  // 5. 生成购销合同文档
  const handleGenerateContract = async () => {
    if (!selectedPurchaseId) return;

    setGenerateLoading(true);
    try {
      const blob = await contractDocService.generateFromPurchase(
        selectedPurchaseId,
        generateForm,
      );

      const contract = purchaseContracts.find(
        (c) => c.id === selectedPurchaseId,
      );
      const filename = `购销合同${contract?.contractNo?.replace("PO", "CG") || ""}.docx`;
      contractDocService.downloadDocument(blob, filename);

      toast.success("合同文档已生成");
      setGenerateOpen(false);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "生成合同文档失败";
      toast.error(message);
    } finally {
      setGenerateLoading(false);
    }
  };

  // 6. 导出采购合同 Excel
  const handleExport = async () => {
    try {
      const params: { status?: string; dateFrom?: string; dateTo?: string } =
        {};
      if (purchaseStatusFilter && purchaseStatusFilter !== "ALL")
        params.status = purchaseStatusFilter;
      const blob = await purchaseService.exportExcel(params);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `采购合同导出_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("导出成功");
    } catch {
      toast.error("导出失败");
    }
  };

  // 7. 批量导入
  const handleImportClick = () => {
    if (readOnly || importLoading) return;
    setHistoricalImport(false);
    setImportDialogOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || readOnly || importLoading) return;
    const historical = canImportHistory && historicalImport;
    setImportDialogOpen(false);
    e.target.value = "";

    setImportLoading(true);
    try {
      const response = historical
        ? await purchaseService.importExcel(file, { historical: true })
        : await purchaseService.importExcel(file);
      setImportResult(response.data);
      setImportResultOpen(true);
      if (response.data?.failedRows === 0) {
        toast.success(`成功导入 ${response.data.successRows} 条合同`);
      } else {
        toast.warning(
          `导入完成：成功 ${response.data.successRows} 条，失败 ${response.data.failedRows} 条`,
        );
      }
      // 导入完成后同时失效自定义列表缓存。
      invalidateCache("purchase-contracts-list");
      await loadPurchaseContracts();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "导入失败";
      toast.error(message);
    } finally {
      setImportLoading(false);
    }
  };

  const handleTemplateUpload = async () => {
    if (!selectedTemplateFile) {
      toast.error("请先选择模板文件");
      return;
    }
    if (!selectedTemplateFile.name.toLowerCase().endsWith(".docx")) {
      toast.error("仅支持 .docx 模板文件");
      return;
    }

    setTemplateUploading(true);
    try {
      await contractDocService.uploadTemplate(selectedTemplateFile);
      invalidateCache("contract-templates");
      toast.success("模板上传成功");
      setSelectedTemplateFile(null);
      await loadContractTemplates();
    } catch {
      toast.error("模板上传失败");
    } finally {
      setTemplateUploading(false);
    }
  };

  const handleTemplateDelete = async () => {
    if (!window.confirm("确定删除当前模板吗？删除后将无法生成购销合同。")) {
      return;
    }

    setTemplateDeleting(true);
    try {
      await contractDocService.deleteTemplate();
      invalidateCache("contract-templates");
      toast.success("模板已删除");
      await loadContractTemplates();
    } catch {
      toast.error("删除模板失败");
    } finally {
      setTemplateDeleting(false);
    }
  };

  // 关闭弹窗时清理状态
  const closeDetail = () => {
    setDetailOpen(false);
    setPurchaseDetail(null);
  };

  const hasActiveFilters =
    purchaseStatusFilter !== "ALL" ||
    Boolean(storeFilter && storeFilter !== "ALL") ||
    Boolean(productSearch);
  const storeOptions = [...listSummary.stores].sort();

  const resetFilters = () => {
    setPurchaseStatusFilter("ALL");
    setStoreFilter("");
    setProductSearch("");
    setPurchasePage(1);
  };

  const renderFilterControls = (variant: "desktop" | "mobile") => {
    const isMobile = variant === "mobile";
    const triggerClassName = isMobile
      ? "h-11 w-full rounded-xl border-border/70 bg-background/80 text-left"
      : "h-9 w-32 rounded-md border-border/60 bg-background text-left text-xs";
    const storeClassName = isMobile
      ? "h-11 w-full rounded-xl border-border/70 bg-background/80 text-left"
      : "h-9 w-36 rounded-md border-border/60 bg-background text-left text-xs";
    const inputClassName = isMobile
      ? "h-11 w-full rounded-xl border-border/70 bg-background/80"
      : "h-9 w-40 rounded-md border-border/60 bg-background text-xs";

    return (
      <>
        <div className={isMobile ? "space-y-2" : "contents"}>
          {isMobile && (
            <Label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              合同状态
            </Label>
          )}
          <Select
            value={purchaseStatusFilter}
            onValueChange={setPurchaseStatusFilter}
          >
            <SelectTrigger className={triggerClassName}>
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              <SelectItem value="DRAFT">草稿</SelectItem>
              <SelectItem value="SIGNED">已签约</SelectItem>
              <SelectItem value="PRODUCING">生产中</SelectItem>
              <SelectItem value="READY">生产完成</SelectItem>
              <SelectItem value="SHIPPED">已发货</SelectItem>
              <SelectItem value="RECEIVED">已收货</SelectItem>
              <SelectItem value="COMPLETED">已完成</SelectItem>
              <SelectItem value="CANCELLED">已取消</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className={isMobile ? "space-y-2" : "contents"}>
          {isMobile && (
            <Label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              发货店铺
            </Label>
          )}
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className={storeClassName}>
              <SelectValue placeholder="全部店铺" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部店铺</SelectItem>
              {storeOptions.map((store) => (
                <SelectItem key={store} value={store}>
                  {store}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={isMobile ? "space-y-2" : "contents"}>
          {isMobile && (
            <Label
              htmlFor="mobile-product-search"
              className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground"
            >
              合同搜索
            </Label>
          )}
          <Input
            id={isMobile ? "mobile-product-search" : undefined}
            aria-label="搜索合同号、供应商或商品"
            placeholder="搜索合同号、供应商或商品..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className={inputClassName}
          />
        </div>
      </>
    );
  };

  const pageNumbers = useMemo(
    () => getPageNumbers(purchasePage, purchaseTotalPages),
    [purchasePage, purchaseTotalPages],
  );

  return (
    <div className="space-y-4 md:space-y-6">
      <ModuleTabHeader tabs={PROCUREMENT_TABS} moduleName="采购" />
      <PageHeader title="采购合同" />

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <BusinessWrite>
          <Button
            className="h-11 rounded-2xl"
            onClick={() => router.push("/dashboard/purchase/create")}
          >
            <Plus className="mr-2 h-4 w-4" /> 新增采购
          </Button>
        </BusinessWrite>
        <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-11 rounded-xl">
              <Filter className="mr-2 h-4 w-4" />
              筛选与搜索
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl px-0 pb-0">
            <SheetHeader className="border-b px-5 pb-4">
              <SheetTitle>筛选与搜索</SheetTitle>
              <SheetDescription>
                筛选并定位合同，也可导出、导入和管理合同模板。
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-5 py-5">
              {renderFilterControls("mobile")}
              <div className="grid grid-cols-1 gap-3 border-t pt-4">
                <BusinessWrite>
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl"
                    onClick={handleExport}
                  >
                    <Download className="mr-2 h-4 w-4" /> 导出 Excel
                  </Button>
                </BusinessWrite>
                <BusinessWrite>
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl"
                    onClick={handleImportClick}
                    disabled={importLoading}
                  >
                    <Upload className="mr-2 h-4 w-4" /> 批量导入
                  </Button>
                </BusinessWrite>
                <BusinessWrite>
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl"
                    onClick={() => setTemplateDialogOpen(true)}
                  >
                    <FileText className="mr-2 h-4 w-4" /> 合同模板
                  </Button>
                </BusinessWrite>
              </div>
            </div>
            <div className="flex gap-3 border-t px-5 py-4">
              <Button
                variant="outline"
                className="h-11 flex-1 rounded-2xl"
                onClick={resetFilters}
              >
                重置
              </Button>
              <Button
                className="h-11 flex-1 rounded-2xl"
                onClick={() => setMobileFiltersOpen(false)}
              >
                查看结果
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* 概览卡片 */}
      <section className="space-y-3 md:space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            采购执行概览
          </h3>
          <Badge
            variant="outline"
            className="rounded-full border-border/60 bg-background px-3 py-1 text-xs shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
          >
            当前活跃合同{" "}
            {purchaseError || purchaseLoading
              ? "—"
              : procurementOverview.activeContracts}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 md:gap-3 xl:grid-cols-4">
          <Card className="overflow-hidden py-0 md:py-6 rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <CardContent className="flex items-center justify-between gap-2 px-3 py-3 md:gap-3 md:px-6 md:pb-0 md:pt-5">
              <div>
                <p className="text-xs text-muted-foreground md:text-sm">
                  待推进合同
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">
                  {purchaseError || purchaseLoading
                    ? "—"
                    : procurementOverview.activeContracts}
                </p>
              </div>
              <div className="flex h-7 w-7 shrink-0 items-center md:h-9 md:w-9 justify-center rounded-lg bg-primary/10">
                <ShoppingCart className="h-4 w-4 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden py-0 md:py-6 rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <CardContent className="flex items-center justify-between gap-2 px-3 py-3 md:gap-3 md:px-6 md:pb-0 md:pt-5">
              <div>
                <p className="text-xs text-muted-foreground md:text-sm">
                  生产中
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">
                  {purchaseError || purchaseLoading
                    ? "—"
                    : procurementOverview.producingContracts}
                </p>
              </div>
              <div className="flex h-7 w-7 shrink-0 items-center md:h-9 md:w-9 justify-center rounded-lg bg-amber-500/10">
                <Package className="h-4 w-4 text-amber-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden py-0 md:py-6 rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <CardContent className="flex items-center justify-between gap-2 px-3 py-3 md:gap-3 md:px-6 md:pb-0 md:pt-5">
              <div>
                <p className="text-xs text-muted-foreground md:text-sm">
                  已发货待收货
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">
                  {purchaseError || purchaseLoading
                    ? "—"
                    : procurementOverview.shippedPendingReceipt}
                </p>
              </div>
              <div className="flex h-7 w-7 shrink-0 items-center md:h-9 md:w-9 justify-center rounded-lg bg-emerald-500/10">
                <Truck className="h-4 w-4 text-emerald-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="overflow-hidden py-0 md:py-6 rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
            <CardContent className="flex items-center justify-between gap-2 px-3 py-3 md:gap-3 md:px-6 md:pb-0 md:pt-5">
              <div>
                <p className="text-xs text-muted-foreground md:text-sm">
                  合作店铺
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">
                  {purchaseError || purchaseLoading
                    ? "—"
                    : procurementOverview.activeStores}
                </p>
              </div>
              <div className="flex h-7 w-7 shrink-0 items-center md:h-9 md:w-9 justify-center rounded-lg bg-sky-500/10">
                <Store className="h-4 w-4 text-sky-600" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 采购合同内容 */}
      <div className="space-y-4">
        <div className="hidden md:flex md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
          {/* 筛选区域 */}
          <div className="hidden flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background p-1.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] md:flex">
            <Filter className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
            {renderFilterControls("desktop")}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-md text-xs"
                onClick={resetFilters}
              >
                <X className="mr-1 h-3 w-3" />
                重置
              </Button>
            )}
          </div>

          <div className="hidden md:flex md:items-center md:gap-2">
            <BusinessWrite>
              <Button
                variant="outline"
                className="h-9 rounded-md text-xs"
                onClick={handleExport}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> 导出 Excel
              </Button>
            </BusinessWrite>
            <BusinessWrite>
              <Button
                variant="outline"
                className="h-9 rounded-md text-xs"
                onClick={handleImportClick}
                disabled={importLoading}
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" /> 批量导入
              </Button>
            </BusinessWrite>
            <BusinessWrite>
              <Button
                variant="outline"
                className="h-9 rounded-md text-xs"
                onClick={() => setTemplateDialogOpen(true)}
              >
                <FileText className="mr-1.5 h-3.5 w-3.5" /> 合同模板
              </Button>
            </BusinessWrite>
            <BusinessWrite>
              <Button
                className="h-9 rounded-md text-xs"
                onClick={() => router.push("/dashboard/purchase/create")}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" /> 新增采购
              </Button>
            </BusinessWrite>
          </div>
        </div>

        {/* 移动端卡片 */}
        <div className="grid gap-3 md:hidden">
          {purchaseError ? (
            <ErrorState
              title="采购合同加载失败"
              action={
                <Button
                  onClick={() => {
                    invalidateCache("purchase-contracts-list");
                    void loadPurchaseContracts();
                  }}
                >
                  重试
                </Button>
              }
            />
          ) : purchaseLoading ? (
            <Card className="border-dashed border-border/70">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                加载中...
              </CardContent>
            </Card>
          ) : pagedPurchaseContracts.length === 0 ? (
            <Card className="border-dashed border-border/70">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {hasActiveFilters ? "没有符合筛选条件的合同" : "暂无采购合同"}
              </CardContent>
            </Card>
          ) : (
            pagedPurchaseContracts.map((contract) => {
              const firstProduct = contract.items?.[0]?.product;
              const productName = firstProduct?.customsName || "未填写商品";
              return (
                <Card
                  key={contract.id}
                  className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]"
                >
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="text-base font-semibold tracking-tight">
                          {contract.contractNo}
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {productName}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <StatusPill status={contract.status} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/40 p-3">
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                          供应商
                        </p>
                        <p className="text-sm font-medium">
                          {contract.supplier?.name || "—"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                          合同总额
                        </p>
                        <p className="text-sm font-semibold tabular-nums text-emerald-600">
                          ¥{contract.totalAmount.toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background px-3 py-2.5">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        已付金额
                      </p>
                      <AmountText
                        tone={
                          contract.paidAmount < contract.totalAmount
                            ? "warning"
                            : "success"
                        }
                        size="sm"
                        className="text-base font-semibold tabular-nums"
                      >
                        ¥{contract.paidAmount.toLocaleString()}
                      </AmountText>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        variant="outline"
                        className="h-9 rounded-lg text-xs"
                        onClick={() =>
                          router.push(`/dashboard/purchase/${contract.id}`)
                        }
                        aria-label={`查看 ${contract.contractNo} 详情`}
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                        查看详情
                      </Button>
                      <BusinessWrite>
                        <Button
                          className="h-9 rounded-lg text-xs"
                          onClick={() => openGenerateDialog(contract.id)}
                          aria-label={`为 ${contract.contractNo} 生成购销合同`}
                        >
                          <FileDown className="mr-1.5 h-3.5 w-3.5" />
                          生成合同
                        </Button>
                      </BusinessWrite>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* 桌面端表格视图 */}
        <div className="hidden overflow-hidden rounded-xl border border-border/40 bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)] md:block">
          {purchaseError ? (
            <ErrorState
              title="采购合同加载失败"
              action={
                <Button
                  onClick={() => {
                    invalidateCache("purchase-contracts-list");
                    void loadPurchaseContracts();
                  }}
                >
                  重试
                </Button>
              }
            />
          ) : purchaseLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              加载中...
            </div>
          ) : pagedPurchaseContracts.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={<ShoppingCart className="h-8 w-8" />}
                title={
                  hasActiveFilters ? "没有符合筛选条件的合同" : "暂无采购合同"
                }
                description={
                  hasActiveFilters
                    ? "请调整或清空筛选后重试"
                    : "还没有创建任何采购合同，点击下方的按钮开始创建"
                }
                action={
                  readOnly
                    ? undefined
                    : {
                        label: "新建采购合同",
                        onClick: () =>
                          router.push("/dashboard/purchase/create"),
                      }
                }
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/60 bg-muted/40 hover:bg-muted/40">
                    <SortableTableHead
                      sortKey="contractNo"
                      currentSortKey={purchaseSort.sortKey}
                      currentSortDir={purchaseSort.sortDir}
                      onSort={purchaseSort.onSort}
                      className="w-[140px]"
                    >
                      合同编号
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="supplier"
                      currentSortKey={purchaseSort.sortKey}
                      currentSortDir={purchaseSort.sortDir}
                      onSort={purchaseSort.onSort}
                    >
                      供应商
                    </SortableTableHead>
                    <TableHead>店铺</TableHead>
                    <SortableTableHead
                      sortKey="signedAt"
                      currentSortKey={purchaseSort.sortKey}
                      currentSortDir={purchaseSort.sortDir}
                      onSort={purchaseSort.onSort}
                      className="w-[110px]"
                    >
                      签订日期
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="totalAmount"
                      currentSortKey={purchaseSort.sortKey}
                      currentSortDir={purchaseSort.sortDir}
                      onSort={purchaseSort.onSort}
                      className="text-right"
                    >
                      合同金额
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="paidAmount"
                      currentSortKey={purchaseSort.sortKey}
                      currentSortDir={purchaseSort.sortDir}
                      onSort={purchaseSort.onSort}
                      className="text-right"
                    >
                      已付金额
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="status"
                      currentSortKey={purchaseSort.sortKey}
                      currentSortDir={purchaseSort.sortDir}
                      onSort={purchaseSort.onSort}
                      className="w-[100px]"
                    >
                      状态
                    </SortableTableHead>
                    <TableHead className="w-[140px] text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedPurchaseContracts.map((contract) => {
                    const isUnpaid = contract.paidAmount < contract.totalAmount;
                    return (
                      <TableRow
                        key={contract.id}
                        className="group cursor-pointer border-b border-border/30 transition-colors hover:bg-muted/30"
                        onClick={() =>
                          router.push(`/dashboard/purchase/${contract.id}`)
                        }
                      >
                        <TableCell className="relative font-mono text-sm font-medium">
                          {/* 左侧状态色条（hover时显示） */}
                          <div
                            className="absolute left-0 top-0 bottom-0 w-[3px] opacity-0 transition-opacity group-hover:opacity-100"
                            style={{
                              backgroundColor: getPurchaseStatusColor(
                                contract.status,
                              ),
                            }}
                          />
                          <div className="flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            {contract.contractNo}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">
                              {contract.supplier?.name || "—"}
                            </span>
                            {contract.supplier?.hasQualityIssue && (
                              <Badge
                                variant="destructive"
                                className="mt-1 w-fit rounded px-1 py-0 text-[10px]"
                              >
                                质量问题
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {contract.storeName || "—"}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">
                          {contract.signedAt
                            ? format(new Date(contract.signedAt), "yyyy-MM-dd")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatAmount(contract.totalAmount)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          <AmountText tone={isUnpaid ? "warning" : "success"}>
                            ¥{contract.paidAmount.toLocaleString()}
                          </AmountText>
                        </TableCell>
                        <TableCell>
                          <StatusPill status={contract.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-md"
                              aria-label={`查看 ${contract.contractNo} 详情`}
                              title="查看详情"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(
                                  `/dashboard/purchase/${contract.id}`,
                                );
                              }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <BusinessWrite>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-md"
                                aria-label={`为 ${contract.contractNo} 生成购销合同`}
                                title="生成购销合同"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openGenerateDialog(contract.id);
                                }}
                              >
                                <FileDown className="h-3.5 w-3.5" />
                              </Button>
                            </BusinessWrite>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* 分页控件 */}
        {purchaseTotalPages > 0 && (
          <div className="flex flex-col gap-3 py-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              共 {purchaseTotal} 条（表列排序仅当前页）
              {purchaseTotalPages > 1 &&
                `，第 ${purchasePage}/${purchaseTotalPages} 页`}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PageSizeSelect
                value={pageSize}
                onChange={(size) => {
                  setPageSize(size);
                  setPurchasePage(1);
                }}
              />
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-md"
                  onClick={() => setPurchasePage((p) => Math.max(1, p - 1))}
                  disabled={purchasePage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {pageNumbers.map((page, idx) =>
                  page === "ellipsis" ? (
                    <span
                      key={`ellipsis-${idx}`}
                      className="px-1 text-xs text-muted-foreground"
                    >
                      ...
                    </span>
                  ) : (
                    <Button
                      key={page}
                      variant={purchasePage === page ? "default" : "outline"}
                      size="sm"
                      className="h-8 min-w-[2rem] rounded-md px-2 text-xs"
                      onClick={() => setPurchasePage(page)}
                    >
                      {page}
                    </Button>
                  ),
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-md"
                  onClick={() =>
                    setPurchasePage((p) => Math.min(purchaseTotalPages, p + 1))
                  }
                  disabled={
                    purchasePage === purchaseTotalPages ||
                    purchaseTotalPages <= 1
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 采购合同详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={closeDetail}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {detailLoading ? (
            <DialogHeader>
              <DialogTitle>加载中...</DialogTitle>
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            </DialogHeader>
          ) : purchaseDetail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  采购合同详情：{purchaseDetail.contractNo}
                </DialogTitle>
                <DialogDescription>
                  供应商：{purchaseDetail.supplier?.name || "未知"}
                  {" | "}
                  {purchaseDetail.signedAt
                    ? `签订日期：${format(new Date(purchaseDetail.signedAt), "yyyy-MM-dd")}`
                    : "未设置签订日期"}
                  {purchaseDetail.storeName && (
                    <> | 发货店铺：{purchaseDetail.storeName}</>
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* 金额汇总 */}
                <div className="grid grid-cols-1 gap-4 rounded-lg bg-muted p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-sm text-muted-foreground">合同金额</p>
                    <p className="text-xl font-bold">
                      ¥{purchaseDetail.totalAmount.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">已付款</p>
                    <AmountText tone="success" size="lg">
                      ¥{purchaseDetail.paidAmount.toLocaleString()}
                    </AmountText>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">状态</p>
                    <div className="mt-1">
                      <StatusPill status={purchaseDetail.status} />
                    </div>
                  </div>
                </div>

                {/* 商品明细 */}
                <div>
                  <h4 className="mb-2 flex items-center gap-2 font-medium">
                    <Package className="h-4 w-4" />
                    商品明细
                  </h4>
                  {purchaseDetail.items && purchaseDetail.items.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>商品名称</TableHead>
                          <TableHead>规格</TableHead>
                          <TableHead>数量</TableHead>
                          <TableHead className="text-right">单价 (¥)</TableHead>
                          <TableHead className="text-right">小计 (¥)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {purchaseDetail.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.product?.customsName || "未知商品"}
                            </TableCell>
                            <TableCell>
                              {item.specification ||
                                item.product?.specification ||
                                "-"}
                            </TableCell>
                            <TableCell>
                              {item.quantity} {item.unit || item.product?.unit}
                            </TableCell>
                            <TableCell className="text-right">
                              ¥{item.unitPrice.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              ¥{item.totalPrice.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="py-4 text-center text-muted-foreground">
                      暂无商品明细
                    </p>
                  )}
                </div>

                {/* 备注 */}
                {purchaseDetail.note && (
                  <div className="rounded bg-muted p-3">
                    <p className="text-sm text-muted-foreground">
                      备注：{purchaseDetail.note}
                    </p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <DialogHeader>
              <DialogTitle>合同详情</DialogTitle>
              <DialogDescription>暂无数据</DialogDescription>
            </DialogHeader>
          )}
        </DialogContent>
      </Dialog>

      {/* 生成购销合同弹窗 */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5 text-primary" />
              生成购销合同
            </DialogTitle>
            <DialogDescription>
              填写收货信息后，系统将自动生成标准购销合同文档
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="storeName">收货店铺名称</Label>
              <Input
                id="storeName"
                placeholder="例如：米尔皮塔"
                value={generateForm.storeName}
                onChange={(e) =>
                  setGenerateForm((prev) => ({
                    ...prev,
                    storeName: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deliveryAddress">收货地址</Label>
              <Input
                id="deliveryAddress"
                placeholder="完整收货地址"
                value={generateForm.deliveryAddress}
                onChange={(e) =>
                  setGenerateForm((prev) => ({
                    ...prev,
                    deliveryAddress: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="deliveryContact">收货联系人</Label>
              <Input
                id="deliveryContact"
                placeholder="联系人及电话"
                value={generateForm.deliveryContact}
                onChange={(e) =>
                  setGenerateForm((prev) => ({
                    ...prev,
                    deliveryContact: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="depositRate">首付比例 (%)</Label>
              <Input
                id="depositRate"
                type="number"
                min="0"
                max="100"
                placeholder="默认30%"
                value={generateForm.depositRate}
                onChange={(e) =>
                  setGenerateForm((prev) => ({
                    ...prev,
                    depositRate: e.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                合同中&quot;第一笔款项&quot;的比例，默认为30%
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleGenerateContract} disabled={generateLoading}>
              {generateLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <FileDown className="mr-2 h-4 w-4" />
                  生成合同
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 合同模板弹窗 */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              合同模板
            </DialogTitle>
            <DialogDescription>
              采购合同生成文档时使用的 Word 模板，作为采购合同页内部工具管理。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
              <p className="text-sm font-medium">当前模板</p>
              {templateLoading ? (
                <p className="mt-2 text-sm text-muted-foreground">加载中...</p>
              ) : currentTemplate ? (
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <p className="break-all text-foreground">
                    {currentTemplate.filename || "未命名模板"}
                  </p>
                  <p>
                    {typeof currentTemplate.size === "number"
                      ? `${(currentTemplate.size / 1024).toFixed(1)} KB`
                      : "大小未知"}
                    {" · "}
                    {currentTemplate.updatedAt
                      ? format(
                          new Date(currentTemplate.updatedAt),
                          "yyyy-MM-dd HH:mm",
                        )
                      : "更新时间未知"}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  当前尚未上传模板。
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="purchase-contract-template-file">替换模板</Label>
              <Input
                id="purchase-contract-template-file"
                type="file"
                accept=".docx"
                onChange={(event) =>
                  setSelectedTemplateFile(event.target.files?.[0] || null)
                }
              />
              <p className="text-xs text-muted-foreground">
                仅支持 .docx 模板文件。
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => void handleTemplateDelete()}
              disabled={!currentTemplate || templateDeleting}
            >
              <X className="mr-2 h-4 w-4" />
              {templateDeleting ? "删除中..." : "删除模板"}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setTemplateDialogOpen(false)}
              >
                关闭
              </Button>
              <Button
                onClick={() => void handleTemplateUpload()}
                disabled={templateUploading}
              >
                {templateUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    上传中...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    上传模板
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importDialogOpen && !readOnly}
        onOpenChange={setImportDialogOpen}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>导入采购合同</DialogTitle>
            <DialogDescription>
              正常导入不代表收货或验货。已收货、已完成或已取消的历史合同仅能由管理员明确选择历史补录。
            </DialogDescription>
          </DialogHeader>
          {canImportHistory && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id="historical-import"
                  checked={historicalImport}
                  onCheckedChange={(checked) =>
                    setHistoricalImport(checked === true)
                  }
                />
                <Label htmlFor="historical-import" className="leading-relaxed">
                  我确认这是历史采购补录，允许导入历史收货或完成状态
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                历史补录保留账面记录，不生成库存或分批验货证据，不能用于重复入库。
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={importLoading}
            >
              选择文件并导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 隐藏的文件选择器 */}
      <input
        id="contract-import-file-input"
        disabled={readOnly || importLoading}
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* 导入结果弹窗 */}
      <Dialog open={importResultOpen} onOpenChange={setImportResultOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>导入结果</DialogTitle>
            <DialogDescription>
              成功 {importResult?.successRows ?? 0} 条，失败{" "}
              {importResult?.failedRows ?? 0} 条
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {(importResult?.errors.length ?? 0) > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">
                  失败明细：
                </p>
                <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-border/70">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">行号</TableHead>
                        <TableHead>错误原因</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResult?.errors.map((err, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="tabular-nums">
                            {err.row}
                          </TableCell>
                          <TableCell className="text-destructive text-sm">
                            {err.error}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                全部导入成功，无失败记录。
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setImportResultOpen(false)}
            >
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
