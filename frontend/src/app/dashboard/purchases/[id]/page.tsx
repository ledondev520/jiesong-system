/**
 * Input: 采购合同详情API、购销合同生成服务、系统配置（盖章平台/开票抬头）、RecordHeader、UrlTabs、PurchaseFlowPanel、SortableTableHead、useTableSort
 * Output: 采购合同记录页：头部（单号、5 个事实 chips、唯一主操作、「单证」/「更多」菜单、阻塞条）、四维状态 chips、?tab= 页签（概览/明细/生产/收货验货/付款与发票/附件）
 * Pos: 采购管理子页面，承载「签合同→盖章→付款→生产完工→催票」的单合同主线路；在线盖章与生成购销合同收进「单证」菜单，两者都先确认对外法律文件；取消合同在「更多」里并先确认
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { RemarkText } from "@/components/ui/remark-text";
import {
  BusinessWrite,
  useBusinessReadOnly,
} from "@/lib/hooks/useBusinessReadOnly";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  use,
  useCallback,
  useMemo,
} from "react";
import { PurchaseContract, PurchaseItem, PurchaseStatus } from "@/types";
import { purchaseService } from "@/services/purchase.service";
import { contractDocService } from "@/services/contractDoc.service";
import {
  listContractFiles,
  type ContractFile,
} from "@/services/contractFile.service";
import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui/data-state";
import { Skeleton } from "@/components/ui/skeleton";
import { invalidateCache } from "@/lib/api-cache";
import { Button } from "@/components/ui/button";
import { MobileListCard } from "@/components/mobile";
import { useMobile } from "@/lib/hooks/useMobile";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableHead,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/lib/hooks/useTableSort";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Package,
  Building2,
  FileDown,
  Loader2,
  CheckCircle2,
  Truck,
  PackageCheck,
  X,
  FileText,
  Phone,
  User,
  MapPin,
  CreditCard,
  Calendar,
  Store,
  Percent,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import Link from "next/link";
import { RecordHeader } from "@/components/layout/RecordHeader";
import { KpiStat } from "@/components/ui/kpi-stat";
import { UrlTabs } from "@/components/ui/url-tabs";
import { formatMoney, formatUnitPrice } from "@/lib/format";
import { replaceBrowserQuery } from "@/lib/hooks/useBrowserQuery";
import ContractFiles from "@/components/contract/ContractFiles";
import { isPayable, nonPayableNotice } from "../components/purchaseListHelpers";
import { PurchaseReceiptPanel } from "./components/PurchaseReceiptPanel";
import { PurchaseFlowPanel } from "./components/PurchaseFlowPanel";
import { PurchaseProductionPanel } from "./components/PurchaseProductionPanel";
import { configService } from "@/services/config.service";
import { PurchaseStatusChips } from "./components/PurchaseStatusChips";
import { cn } from "@/lib/utils";
import { PURCHASE_STATUS_LABELS } from "@/components/ui/status-badge";
import { useAuthStore } from "@/store/auth.store";
import {
  calculatePurchaseLineAmounts,
  summarizePurchaseAmounts,
} from "@/lib/purchase-amount";

interface PageProps {
  params: Promise<{ id: string }>;
}

const PURCHASE_NEXT_ACTIONS: Partial<
  Record<PurchaseStatus, { status: PurchaseStatus; label: string }>
> = {
  [PurchaseStatus.DRAFT]: {
    status: PurchaseStatus.SIGNED,
    label: "确认已签约",
  },
  [PurchaseStatus.SIGNED]: {
    status: PurchaseStatus.READY,
    label: "登记完工资料",
  },
  [PurchaseStatus.PRODUCING]: {
    status: PurchaseStatus.READY,
    label: "登记完工资料",
  },
  [PurchaseStatus.READY]: {
    status: PurchaseStatus.SHIPPED,
    label: "确认供应商已发货",
  },
};

const PURCHASE_TIMELINE_STEPS = [
  { status: PurchaseStatus.DRAFT, label: "草稿", icon: FileText },
  {
    status: PurchaseStatus.SIGNED,
    label: PURCHASE_STATUS_LABELS.SIGNED,
    icon: CheckCircle2,
  },
  { status: PurchaseStatus.PRODUCING, label: "生产中", icon: Loader2 },
  { status: PurchaseStatus.READY, label: "生产完成", icon: PackageCheck },
  { status: PurchaseStatus.SHIPPED, label: "已发货", icon: Truck },
  { status: PurchaseStatus.RECEIVED, label: "已收货", icon: PackageCheck },
  { status: PurchaseStatus.COMPLETED, label: "已完成", icon: CheckCircle2 },
] as const;

function PurchaseTimelineStep({
  step,
  index,
  currentIndex,
}: {
  step: (typeof PURCHASE_TIMELINE_STEPS)[number];
  index: number;
  currentIndex: number;
}) {
  const isCompleted = index <= currentIndex;
  const isCurrent = index === currentIndex;
  const StepIcon = step.icon;

  return (
    <li className="relative flex flex-1 flex-col items-center gap-2">
      <div
        className={cn(
          "z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
          isCurrent
            ? "border-primary bg-primary text-primary-foreground"
            : isCompleted
              ? "border-status-green bg-status-green-soft text-status-green"
              : "border-border bg-muted text-muted-foreground",
        )}
      >
        {isCompleted && !isCurrent ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <StepIcon className="h-3.5 w-3.5" />
        )}
      </div>
      <span
        className={cn(
          "text-[11px] font-medium",
          isCurrent
            ? "text-primary"
            : isCompleted
              ? "text-foreground"
              : "text-muted-foreground",
        )}
      >
        {step.label}
      </span>
      {index < PURCHASE_TIMELINE_STEPS.length - 1 ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-[calc(50%+1rem)] top-4 h-[2px] w-[calc(100%-2rem)]",
            index < currentIndex ? "bg-status-green" : "bg-border",
          )}
        />
      ) : null}
    </li>
  );
}

/**
 * 职责：合同状态时间线
 * 思路：按标准流程展示各状态节点，当前状态高亮，已完成节点打勾
 */
function ContractTimeline({
  currentStatus,
}: {
  currentStatus: PurchaseStatus;
}) {
  const currentIndex = PURCHASE_TIMELINE_STEPS.findIndex(
    (step) => step.status === currentStatus,
  );
  const isCancelled = currentStatus === PurchaseStatus.CANCELLED;

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <h3 className="mb-4 text-sm font-medium">合同进度</h3>
      {isCancelled ? (
        <div className="flex items-center gap-2 rounded-lg bg-status-red-soft p-3 text-sm text-status-red">
          <X className="h-4 w-4" />
          该合同已取消
        </div>
      ) : (
        <ol
          className="flex items-start justify-between"
          aria-label="采购合同进度"
        >
          {PURCHASE_TIMELINE_STEPS.map((step, index) => (
            <PurchaseTimelineStep
              key={step.status}
              step={step}
              index={index}
              currentIndex={currentIndex}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

// 与原 `await fn()` 同一时序：直接在请求返回的 Promise 上 then，不额外增加微任务；
// 同步异常/非 Promise 返回值也走失败/成功分支。
function awaitResult<T>(fn: () => T | PromiseLike<T>): Promise<T> {
  try {
    return Promise.resolve(fn());
  } catch (error) {
    return Promise.reject(error);
  }
}

export default function PurchaseDetailPage({ params }: PageProps) {
  const readOnly = useBusinessReadOnly();
  const isMobile = useMobile();
  const router = useRouter();
  const userRole = useAuthStore((state) => state.user?.role);
  // 与后端供应商银行字段可见角色一致；其余角色拿到的是被剔除的数据，不能显示成「未登记」
  const canSeeSupplierBank = ["ADMIN", "FINANCE", "PURCHASE", "BOSS"].includes(
    userRole || "",
  );
  const [loadError, setLoadError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const { id } = use(params);
  const [contract, setContract] = useState<PurchaseContract | null>(null);
  const [loading, setLoading] = useState(true);

  // 生成合同文档弹窗状态
  const [generateOpen, setGenerateOpen] = useState(false);
  const [docConfirm, setDocConfirm] = useState<"stamp" | "generate" | null>(
    null,
  );
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    storeName: "",
    deliveryAddress: "",
    deliveryContact: "",
    depositRate: "30",
  });

  // PDF预览状态
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfDialogOpen, setPdfDialogOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [contractFiles, setContractFiles] = useState<ContractFile[]>([]);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [advanceConfirmOpen, setAdvanceConfirmOpen] = useState(false);
  const [productionEditorOpen, setProductionEditorOpen] = useState(false);

  // 系统配置：线上盖章平台链接 + 我方开票抬头（选填）
  const [stampPlatformUrl, setStampPlatformUrl] = useState("");
  const [invoiceTitleText, setInvoiceTitleText] = useState("");

  /**
   * 职责：加载采购合同详情 + 附件列表
   */
  // 被动 effect 尚未发起新请求前，旧响应不得改写渲染期刚重置的 loading/loadError/notFound
  // （与原先 effect 内同步重置覆盖旧响应的结果一致）。
  const resetPendingRef = useRef(false);
  // 仅在请求结果回调中写状态，供 effect 调用；事件/回调中用 loadData 先重置再请求。
  // 等价于原 async 嵌套 try/await：各分支与返回 Promise 的完成时机相同，且从不 reject。
  const fetchData = useCallback(
    () =>
      new Promise<void>((done) => {
        const finish = () => {
          if (!resetPendingRef.current) setLoading(false);
          done();
        };
        const fail = (error: unknown) => {
          const missing =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === 404;
          if (!resetPendingRef.current) {
            setNotFound(missing);
            setLoadError(!missing);
          }
          if (!missing) toast.error("加载合同详情失败");
          finish();
        };
        awaitResult(() => purchaseService.getById(id)).then((contractRes) => {
          try {
            setContract(contractRes.data || null);
            if (!resetPendingRef.current) setNotFound(!contractRes.data);
          } catch (error) {
            fail(error);
            return;
          }
          awaitResult(() => listContractFiles(id, "PURCHASE")).then(
            (filesRes) => {
              try {
                if (filesRes.data) setContractFiles(filesRes.data);
              } catch {
                toast.error("附件读取失败，请重试刷新详情");
              }
              finish();
            },
            () => {
              toast.error("附件读取失败，请重试刷新详情");
              finish();
            },
          );
        }, fail);
      }),
    [id],
  );
  const loadData = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    setNotFound(false);
    return fetchData();
  }, [fetchData]);
  const [loadedId, setLoadedId] = useState(id);
  if (loadedId !== id) {
    setLoadedId(id);
    setLoading(true);
    setLoadError(false);
    setNotFound(false);
  }
  useLayoutEffect(() => {
    resetPendingRef.current = true;
  }, [fetchData]);
  useEffect(() => {
    resetPendingRef.current = false;
    void fetchData();
  }, [fetchData]);

  // 加载系统配置（盖章平台链接）与统一卖方信息（开票抬头），失败不阻塞页面
  useEffect(() => {
    if (readOnly) return;
    const fetchConfigs = async () => {
      try {
        const response = await configService.getSystemConfig();
        const configs = response.data as Record<string, unknown> | undefined;
        if (typeof configs?.stampPlatformUrl === "string")
          setStampPlatformUrl(configs.stampPlatformUrl);
      } catch {
        // 配置读取失败时保持默认，不影响详情页
      }
      try {
        // 开票抬头由统一的卖方信息生成（公司信息 + 旧抬头别名）；银行行仅在有权限时包含
        const identity = await configService.getSellerIdentity();
        if (typeof identity.data?.invoiceTitleText === "string")
          setInvoiceTitleText(identity.data.invoiceTitleText);
      } catch {
        // 读取失败时催票文本不带抬头，不影响详情页
      }
    };
    void fetchConfigs();
  }, [readOnly]);

  /**
   * 职责：跳转线上盖章平台（系统配置 stampPlatformUrl）
   * 思路：未配置时提示管理员到「设置 > 系统配置」维护链接
   */
  const handleOpenStampPlatform = () => {
    const url = stampPlatformUrl.trim();
    if (!url) {
      toast.info("尚未配置线上盖章平台链接，请到「设置 → 系统配置」中填写");
      return;
    }
    window.open(
      url.startsWith("http") ? url : `https://${url}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  /**
   * 职责：生成购销合同文档
   */
  const handleGenerateContract = async () => {
    if (!contract) return;

    setGenerateLoading(true);
    try {
      const blob = await contractDocService.generateFromPurchase(
        contract.id,
        generateForm,
      );

      // 下载文件
      const filename = `购销合同${contract.contractNo?.replace("PO", "CG") || ""}.docx`;
      contractDocService.downloadDocument(blob, filename);

      toast.success("合同文档已生成");
      setGenerateOpen(false);
      await loadData();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "生成合同文档失败";
      toast.error(message);
    } finally {
      setGenerateLoading(false);
    }
  };

  /**
   * 职责：查看已上传的合同PDF
   */
  const viewContractPdf = async () => {
    if (!contract) return;

    setPdfLoading(true);
    try {
      // 尝试获取合同PDF（假设有此API）
      const response = await contractDocService.getContractPdf(contract.id);
      if (response) {
        const url = URL.createObjectURL(response);
        setPdfUrl(url);
        setPdfDialogOpen(true);
      } else {
        toast.info("暂无合同文档，请先生成");
      }
    } catch {
      toast.info('暂无合同文档，请点击"生成购销合同"创建');
    } finally {
      setPdfLoading(false);
    }
  };

  /**
   * 职责：导出合同 PDF
   */
  const handleExportPdf = async () => {
    if (!contract) return;

    setExportingPdf(true);
    try {
      await contractDocService.exportPurchasePdf(
        contract.id,
        contract.contractNo,
      );
      toast.success("合同 PDF 已下载");
      await loadData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "导出 PDF 失败";
      toast.error(message);
    } finally {
      setExportingPdf(false);
    }
  };

  // 页签以 URL 为准；概览是默认页签，不写进地址
  const goToTab = (tab: string) =>
    replaceBrowserQuery({ tab: tab === "overview" ? undefined : tab });

  /** 顺序推进采购状态，成功后刷新整份合同与付款汇总。 */
  const handleAdvanceStatus = async () => {
    if (!contract || readOnly) return;
    const nextAction = PURCHASE_NEXT_ACTIONS[contract.status];
    if (!nextAction) return;

    if (
      [PurchaseStatus.SIGNED, PurchaseStatus.PRODUCING].includes(
        contract.status,
      )
    ) {
      setProductionEditorOpen(true);
      return;
    }
    setStatusUpdating(true);
    try {
      await purchaseService.updateStatus(contract.id, nextAction.status);
      invalidateCache("purchase-contracts-list");
      invalidateCache("inventory-list");
      toast.success(`已推进到「${nextAction.label}」阶段`);
      await loadData();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "状态推进失败");
    } finally {
      setStatusUpdating(false);
    }
  };

  /** 登记完工资料只是打开编辑器，不改状态；其余推进先确认（手机上误触同样要拦住）。 */
  const requestAdvance = () => {
    if (
      contract &&
      [PurchaseStatus.SIGNED, PurchaseStatus.PRODUCING].includes(
        contract.status,
      )
    ) {
      goToTab("production");
      void handleAdvanceStatus();
      return;
    }
    setAdvanceConfirmOpen(true);
  };

  // 二次确认由 RecordHeader「更多」里的破坏性菜单项负责，这里只执行
  const handleCancel = async () => {
    if (!contract) return;
    setStatusUpdating(true);
    try {
      await purchaseService.updateStatus(contract.id, PurchaseStatus.CANCELLED);
      invalidateCache("purchase-contracts-list");
      toast.success("采购合同已取消");
      await loadData();
    } catch (error) {
      toast.error(
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "取消失败",
      );
    } finally {
      setStatusUpdating(false);
    }
  };

  const purchaseLineItems = useMemo(
    () => contract?.items ?? [],
    [contract?.items],
  );

  /**
   * 职责：采购明细行排序取值（名称、规格、数量、单价、小计）
   */
  const purchaseLineAccessor = useCallback(
    (item: PurchaseItem, key: string) => {
      switch (key) {
        case "productName":
          return item.product?.customsName ?? "";
        case "spec":
          return item.specification || item.product?.specification || "";
        case "quantity":
          return item.quantity;
        case "unitPrice":
          return Number(item.unitPrice) || 0;
        case "lineTotal":
          return calculatePurchaseLineAmounts(item, contract?.taxRate)
            .grossAmount;
        default:
          return null;
      }
    },
    [contract?.taxRate],
  );

  const purchaseLineSort = useTableSort(
    purchaseLineItems,
    purchaseLineAccessor,
  );

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label="加载中">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-8 w-full max-w-xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (loadError)
    return (
      <ErrorState
        title="采购合同读取失败"
        action={<Button onClick={() => void loadData()}>重试</Button>}
      />
    );
  if (notFound || !contract)
    return (
      <ErrorState
        title="合同不存在"
        description="合同可能已被删除，或链接有误。"
        action={
          <Button onClick={() => router.push("/dashboard/purchases")}>
            返回采购合同列表
          </Button>
        }
      />
    );

  // 计算付款进度
  const amountSummary = summarizePurchaseAmounts({
    items: purchaseLineItems,
    taxRate: contract.taxRate,
    totalAmount: contract.totalAmount,
    paidAmount: contract.paidAmount,
  });
  // 只有已生效状态计入应付（规格 §4.7 白名单，见 isPayable）；草稿、已取消不属于应付（与列表页同一口径）：不显示待付金额与付款进度。
  const payable = isPayable(contract);
  const paidPercent =
    amountSummary.grossAmount > 0
      ? Math.min(
          (amountSummary.paidAmount / amountSummary.grossAmount) * 100,
          100,
        )
      : 0;
  const nextPurchaseAction = PURCHASE_NEXT_ACTIONS[contract.status];
  const productionCompletionBlocked =
    contract.status === PurchaseStatus.READY &&
    contract.productionReadiness?.ready === false;
  const productionStageVisible = [
    PurchaseStatus.SIGNED,
    PurchaseStatus.PRODUCING,
    PurchaseStatus.READY,
    PurchaseStatus.SHIPPED,
    PurchaseStatus.RECEIVED,
    PurchaseStatus.COMPLETED,
  ].includes(contract.status);
  const productionPhotoFiles = contractFiles.filter(
    (file) => file.category === "PRODUCTION_PHOTO",
  );
  const generalContractFiles = contractFiles.filter(
    (file) => file.category !== "PRODUCTION_PHOTO",
  );

  const grossText = `¥${amountSummary.grossAmount.toLocaleString()}`;
  const canCorrectDraft =
    contract.status === PurchaseStatus.DRAFT &&
    contract.paidAmount === 0 &&
    !contract.payments?.length &&
    !contract.invoiceNo &&
    contractFiles.length === 0;
  const canCancel =
    [PurchaseStatus.DRAFT, PurchaseStatus.SIGNED].includes(contract.status) &&
    contract.paidAmount === 0 &&
    !contract.payments?.length &&
    !contract.invoiceNo;

  const facts = [
    { label: "供应商", value: contract.supplier?.name },
    {
      label: "关联订单",
      value: contract.salesContractId ? (
        <Link
          href={`/dashboard/orders/${encodeURIComponent(contract.salesContractId)}`}
          className="text-primary underline-offset-2 hover:underline"
        >
          查看订单
        </Link>
      ) : null,
    },
    {
      label: "签订日",
      value: contract.signedAt
        ? format(new Date(contract.signedAt), "yyyy-MM-dd")
        : null,
    },
    { label: "含税合计", value: grossText },
    {
      label: "已付/应付",
      value: payable
        ? `¥${contract.paidAmount.toLocaleString()} / ${grossText}`
        : null,
    },
  ];

  // 「单证」：对外法律文件（盖章、购销合同）仍先确认；老板只读时整组隐藏
  const canGenerateDoc = ["ADMIN", "PURCHASE", "FINANCE"].includes(
    userRole || "",
  );
  const documentsMenu = readOnly
    ? []
    : [
        // 合同文档含供应商银行信息：SALES/WAREHOUSE 后端 403，不展示入口
        ...(canGenerateDoc
          ? [
              {
                key: "generate",
                label: "生成盖章购销合同 (Word)",
                onSelect: () => setDocConfirm("generate"),
              },
              {
                key: "view",
                label: "查看合同",
                onSelect: viewContractPdf,
                disabled: pdfLoading,
              },
            ]
          : []),
        {
          key: "export",
          label: "导出 PDF",
          onSelect: handleExportPdf,
          disabled: exportingPdf,
        },
        {
          key: "stamp",
          label: "在线盖章",
          onSelect: () => setDocConfirm("stamp"),
        },
      ];

  // 「更多」：更正草稿、取消合同；取消是破坏性操作，选中后先确认
  const moreMenu = readOnly
    ? []
    : [
        ...(canCorrectDraft
          ? [
              {
                key: "edit-draft",
                label: "更正草稿",
                onSelect: () =>
                  router.push(`/dashboard/purchases/new?editId=${contract.id}`),
              },
            ]
          : []),
        ...(canCancel
          ? [
              {
                key: "cancel",
                label: "取消合同",
                destructive: true,
                disabled: statusUpdating,
                confirmTitle: `取消采购合同 ${contract.contractNo}？`,
                confirmDescription:
                  "取消后不能再推进或恢复，请确认尚未生产、付款或关联出口。",
                onSelect: handleCancel,
              },
            ]
          : []),
      ];

  // 主操作被挡住或要去别的页签处理时，在头部下方说明原因并给「去处理」
  const blocker = productionCompletionBlocked
    ? {
        reason:
          "请先补齐所有商品的规格、箱数、毛净重和体积，才能确认供应商已发货。",
        actionLabel: "去处理",
        onAction: () => goToTab("production"),
      }
    : contract.status === PurchaseStatus.SHIPPED
      ? {
          reason:
            "供应商已发货：请在「收货验货」逐批登记到货与验货；到齐并合格后自动收货，付款结清后自动完成。",
          actionLabel: "去处理",
          onAction: () => goToTab("receiving"),
        }
      : undefined;

  const primaryAction = nextPurchaseAction ? (
    <BusinessWrite>
      <Button
        className="h-9 rounded-md text-xs"
        onClick={requestAdvance}
        disabled={statusUpdating || productionCompletionBlocked}
        title={
          productionCompletionBlocked
            ? "请先补齐所有商品的规格、箱数、毛净重和体积"
            : undefined
        }
      >
        {statusUpdating ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
        )}
        {nextPurchaseAction.label}
      </Button>
      <ConfirmActionDialog
        open={advanceConfirmOpen}
        onOpenChange={setAdvanceConfirmOpen}
        title="确认推进合同状态"
        description={`将采购合同 ${contract.contractNo} 推进到「${nextPurchaseAction.label}」阶段，确认后立即生效。`}
        onConfirm={() => {
          setAdvanceConfirmOpen(false);
          void handleAdvanceStatus();
        }}
      />
    </BusinessWrite>
  ) : undefined;

  const overview = (
    <div className="space-y-6">
      <ContractTimeline currentStatus={contract.status} />

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiStat label="合同含税金额" value={grossText} />
        <div className="space-y-2">
          <KpiStat
            label="已付金额"
            value={`¥${contract.paidAmount.toLocaleString()}`}
          />
          {payable && (
            <Progress
              value={paidPercent}
              aria-label="付款进度"
              className="h-1.5"
            />
          )}
        </div>
        {payable ? (
          <KpiStat
            label="待付金额"
            value={`¥${amountSummary.remainingAmount.toLocaleString()}`}
          />
        ) : (
          <KpiStat
            label="付款状态"
            value={nonPayableNotice(contract.status).title}
            subLabel={nonPayableNotice(contract.status).hint}
            valueClassName="text-lg"
          />
        )}
      </div>

      {amountSummary.issues.length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-status-amber/30 bg-status-amber-soft p-3 text-sm text-status-amber"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">金额数据需要复核</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                {amountSummary.issues.map((issue) => (
                  <li key={issue.code}>{issue.message}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 两列信息卡片 */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 基本信息 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 break-words pt-0">
            <div className="flex items-start gap-3">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">预计交期</p>
                <p className="text-sm">
                  {contract.expectedDate
                    ? format(new Date(contract.expectedDate), "yyyy-MM-dd")
                    : "未填写"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Store className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">发货店铺</p>
                <p className="text-sm">{contract.storeName || "—"}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Percent className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">税率</p>
                <p className="text-sm">{amountSummary.taxRate}%</p>
              </div>
            </div>
            {contract.note && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">备注</p>
                <div className="mt-1 text-sm">
                  <RemarkText note={contract.note} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 供应商信息 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">供应商信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 break-words pt-0">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">公司名称</p>
                <p className="text-sm font-medium">
                  {contract.supplier?.name || "未登记"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">联系人</p>
                <p className="text-sm">
                  {contract.supplier?.contactName || "未登记"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">联系电话</p>
                <p className="text-sm">
                  {contract.supplier?.contactPhone || "未登记"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">公司地址</p>
                <p className="text-sm">
                  {contract.supplier?.address || "未登记"}
                </p>
              </div>
            </div>
            {canSeeSupplierBank && (
              <div className="flex items-start gap-3">
                <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">收款账户</p>
                  <p className="text-sm">
                    户名：
                    {contract.supplier?.bankAccountName ||
                      contract.supplier?.name ||
                      "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      contract.supplier?.bankName,
                      contract.supplier?.bankBranch,
                      contract.supplier?.bankCode
                        ? `联行号 ${contract.supplier.bankCode}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || "开户行未登记"}
                  </p>
                  <p className="font-mono text-xs">
                    {contract.supplier?.bankAccount
                      ? `账号 ${contract.supplier.bankAccount}`
                      : "账号未登记"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  const tabs = [
    { key: "overview", label: "概览", content: overview },
    {
      key: "items",
      label: "明细",
      badge: purchaseLineItems.length || undefined,
      content: (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4" />
              商品明细
            </CardTitle>
            <CardDescription>
              共 {purchaseLineItems.length} 项商品 · 不含税单价 · 发票税率{" "}
              {amountSummary.taxRate}%
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!purchaseLineSort.sortedData.length ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                暂无商品明细
              </div>
            ) : isMobile ? (
              <div className="space-y-3">
                {purchaseLineSort.sortedData.map((item: PurchaseItem) => (
                  <MobileListCard
                    key={item.id}
                    title={item.product?.customsName || "未知商品"}
                    subtitle={
                      item.specification || item.product?.specification || "-"
                    }
                    fields={[
                      {
                        label: "数量",
                        value: `${item.quantity} ${item.unit || item.product?.unit || ""}`,
                      },
                      {
                        label: "不含税单价",
                        value: `¥${(Number(item.unitPrice) || 0).toLocaleString()}`,
                      },
                    ]}
                    amount={{
                      label: "含税小计",
                      value: `¥${calculatePurchaseLineAmounts(item, amountSummary.taxRate).grossAmount.toLocaleString()}`,
                      emphasis: "success",
                    }}
                  />
                ))}
                <dl className="space-y-2 rounded-lg bg-muted/40 p-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt>不含税合计</dt>
                    <dd className="font-mono">
                      ¥{amountSummary.netAmount.toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt>其中税额 ({amountSummary.taxRate}%)</dt>
                    <dd className="font-mono">
                      ¥{amountSummary.taxAmount.toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 font-semibold">
                    <dt>含税合计</dt>
                    <dd className="font-mono">
                      ¥{amountSummary.lineGrossAmount.toLocaleString()}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table framed={false}>
                  <TableHeader>
                    <TableRow className="border-b border-border/60 bg-muted/40 hover:bg-muted/40">
                      <TableHead className="w-10 text-center text-xs">
                        #
                      </TableHead>
                      <SortableTableHead
                        sortKey="productName"
                        currentSortKey={purchaseLineSort.sortKey}
                        currentSortDir={purchaseLineSort.sortDir}
                        onSort={purchaseLineSort.onSort}
                        className="text-xs"
                      >
                        商品名称
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="spec"
                        currentSortKey={purchaseLineSort.sortKey}
                        currentSortDir={purchaseLineSort.sortDir}
                        onSort={purchaseLineSort.onSort}
                        className="text-xs"
                      >
                        规格
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="quantity"
                        currentSortKey={purchaseLineSort.sortKey}
                        currentSortDir={purchaseLineSort.sortDir}
                        onSort={purchaseLineSort.onSort}
                        className="text-right text-xs"
                      >
                        数量
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="unitPrice"
                        currentSortKey={purchaseLineSort.sortKey}
                        currentSortDir={purchaseLineSort.sortDir}
                        onSort={purchaseLineSort.onSort}
                        className="text-right text-xs"
                      >
                        不含税单价 (¥)
                      </SortableTableHead>
                      <SortableTableHead
                        sortKey="lineTotal"
                        currentSortKey={purchaseLineSort.sortKey}
                        currentSortDir={purchaseLineSort.sortDir}
                        onSort={purchaseLineSort.onSort}
                        className="text-right text-xs"
                      >
                        含税小计 (¥)
                      </SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseLineSort.sortedData.map(
                      (item: PurchaseItem, idx: number) => (
                        <TableRow
                          key={item.id}
                          className="border-b border-border/30"
                        >
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {item.product?.customsName || "未知商品"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {item.specification ||
                              item.product?.specification ||
                              "—"}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {item.quantity} {item.unit || item.product?.unit}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm tabular-nums">
                            {formatUnitPrice(Number(item.unitPrice) || 0, "CNY")}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-medium tabular-nums">
                            {formatMoney(
                              calculatePurchaseLineAmounts(
                                item,
                                amountSummary.taxRate,
                              ).grossAmount,
                              "CNY",
                            )}
                          </TableCell>
                        </TableRow>
                      ),
                    )}
                    {/* 合计行 */}
                    <TableRow className="border-b-0 bg-muted/30 font-medium">
                      <TableCell
                        colSpan={5}
                        className="text-right text-xs text-muted-foreground"
                      >
                        不含税合计
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums text-status-green">
                        ¥{amountSummary.netAmount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-b-0 bg-muted/30">
                      <TableCell
                        colSpan={5}
                        className="text-right text-xs text-muted-foreground"
                      >
                        其中税额 ({amountSummary.taxRate}%)
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                        ¥{amountSummary.taxAmount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                    <TableRow className="border-b-0 bg-muted/40">
                      <TableCell
                        colSpan={5}
                        className="text-right text-sm font-medium"
                      >
                        含税合计
                      </TableCell>
                      <TableCell className="text-right font-mono text-base font-bold tabular-nums text-status-green">
                        ¥{amountSummary.lineGrossAmount.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      ),
    },
    ...(productionStageVisible
      ? [
          {
            key: "production",
            label: "生产",
            badge:
              productionCompletionBlocked ||
              contract.subStatus?.docsComplete === false
                ? ("dot" as const)
                : undefined,
            content: (
              <PurchaseProductionPanel
                contract={contract}
                editorOpen={productionEditorOpen}
                onEditorOpenChange={setProductionEditorOpen}
                photoFiles={productionPhotoFiles}
                onPhotoFilesChange={(files) =>
                  setContractFiles((current) => [
                    ...files,
                    ...current.filter(
                      (file) => file.category !== "PRODUCTION_PHOTO",
                    ),
                  ])
                }
                onUpdated={loadData}
              />
            ),
          },
        ]
      : []),
    {
      key: "receiving",
      label: "收货验货",
      badge:
        contract.status === PurchaseStatus.SHIPPED
          ? ("dot" as const)
          : undefined,
      content: (
        <PurchaseReceiptPanel
          purchaseContractId={id}
          readOnly={readOnly}
          onChanged={loadData}
        />
      ),
    },
    {
      key: "payment",
      label: "付款与发票",
      badge: amountSummary.issues.length > 0 ? ("dot" as const) : undefined,
      content: (
        <PurchaseFlowPanel
          contract={contract}
          onUpdated={loadData}
          invoiceTitleText={invoiceTitleText}
        />
      ),
    },
    {
      key: "files",
      label: "附件",
      badge: generalContractFiles.length || undefined,
      content: (
        <ContractFiles
          contractId={id}
          contractType="PURCHASE"
          files={generalContractFiles}
          onChange={(files) =>
            setContractFiles((current) => [
              ...files,
              ...current.filter((file) => file.category === "PRODUCTION_PHOTO"),
            ])
          }
          title="合同附件"
          description="支持 PDF、JPG、PNG、XLSX、DOCX 格式，单文件最大 10MB，用于归档原始合同或补充文件"
          emptyHint="暂无附件，点击「上传附件」归档合同文件"
          categoryOptions={[
            // 与后端 fileService.assertFileAccess 一致：合同文书类仅 ADMIN/PURCHASE/FINANCE 可上传
            ...(["ADMIN", "PURCHASE", "FINANCE"].includes(userRole || "")
              ? [
                  { value: "SIGNED_CONTRACT" as const, label: "供应商盖章件" },
                  { value: "SUPPLIER_INVOICE" as const, label: "供应商发票" },
                ]
              : []),
            { value: "OTHER", label: "其他附件" },
            // 与后端 assertReceiptPhotoAccess 一致：仅到货角色可补传到货照片
            ...(["ADMIN", "PURCHASE", "WAREHOUSE"].includes(userRole || "")
              ? [{ value: "RECEIPT_PHOTO" as const, label: "到货照片" }]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-10">
      <div className="space-y-3">
        <RecordHeader
          number={contract.contractNo}
          facts={facts}
          primaryAction={primaryAction}
          documentsMenu={documentsMenu}
          moreMenu={moreMenu}
          blocker={blocker}
        />
        <PurchaseStatusChips
          status={contract.status}
          subStatus={contract.subStatus}
        />
        {contract.status === PurchaseStatus.RECEIVED && (
          <p className="text-sm text-muted-foreground">
            已收货，付款记录结清后自动完成采购，无需再确认完成。
          </p>
        )}
      </div>

      <UrlTabs tabs={tabs} defaultTab="overview" />

      {!readOnly && (
        <ConfirmActionDialog
          open={docConfirm !== null}
          onOpenChange={(open) => {
            if (!open) setDocConfirm(null);
          }}
          title={
            docConfirm === "stamp" ? "确认前往在线盖章" : "确认生成购销合同"
          }
          description={
            docConfirm === "stamp"
              ? `将在新窗口打开外部盖章平台；在平台完成盖章后会形成具有法律效力的电子合同（采购合同 ${contract.contractNo}）。`
              : `将为采购合同 ${contract.contractNo} 生成一份对外的购销合同文档（具有法律效力的外部文件），下一步填写收货信息。`
          }
          confirmLabel={docConfirm === "stamp" ? "前往盖章" : "继续"}
          onConfirm={() => {
            const action = docConfirm;
            setDocConfirm(null);
            if (action === "stamp") handleOpenStampPlatform();
            else if (action === "generate") setGenerateOpen(true);
          }}
        />
      )}

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

      {/* PDF预览弹窗 */}
      <Dialog
        open={pdfDialogOpen}
        onOpenChange={(open) => {
          setPdfDialogOpen(open);
          if (!open && pdfUrl) {
            URL.revokeObjectURL(pdfUrl);
            setPdfUrl(null);
          }
        }}
      >
        <DialogContent className="h-[80vh] max-w-4xl">
          <DialogHeader>
            <DialogTitle>合同预览：{contract.contractNo}</DialogTitle>
          </DialogHeader>
          <div className="h-full flex-1">
            {pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="h-full w-full rounded border"
                title="合同预览"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                暂无合同文档
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
