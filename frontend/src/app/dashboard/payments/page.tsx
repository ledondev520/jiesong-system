/**
 * Input: 后端 finance API、bank-flow reconciliation/incoming-summary API
 * Output: 以采购/出口中文状态展示的收付管理页面（应付+应收 Tab，合同为空时自动用银行流水 fallback 填充）
 * Pos: 核心业务页面，管理所有收付款，银行流水数据直接嵌入应付/应收列表
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import {
  Suspense,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { useSearchParams } from "next/navigation";
import { PaymentType, PurchaseStatus, SalesStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Search,
  X,
  Plus,
  Split,
  Landmark,
  FileText,
  FileWarning,
  CheckCircle2,
} from "lucide-react";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/lib/hooks/useTableSort";
import Link from "next/link";
import { MobileListCard } from "@/components/mobile";
import {
  PaymentDialog,
  type PaymentSubmitData,
} from "../../dashboard/finance/components/PaymentDialog";
import {
  ReceiptDialog,
  type ReceiptSubmitData,
} from "../../dashboard/finance/components/ReceiptDialog";
import { AllocateDialog } from "../../dashboard/finance/components/AllocateDialog";
import { toast } from "sonner";
import { financeService } from "@/services/finance.service";
import {
  getFullReconciliation,
  type FullReconciliationResult,
  getTransactionStats,
  type BankFlowStats,
  getIncomingSummary,
  type IncomingSummaryResult,
} from "@/services/bankFlow.service";
import { clearApiGetCache } from "@/lib/axios";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { cachedFetch, invalidateCache } from "@/lib/api-cache";
import { errorLogger } from "@/lib/error-logger";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  ModuleTabHeader,
  FINANCE_TABS,
} from "@/components/layout/ModuleTabHeader";
import { LoadingState, TableStateRow } from "@/components/ui/data-state";
import type { Payment } from "@/types";
import { buildReceiptNote } from "@/lib/finance-note";

// Display labels only; statuses and accounting data retain their API values.
const purchaseStatusLabels: Record<PurchaseStatus, string> = {
  DRAFT: "草稿",
  SIGNED: "已确认",
  PRODUCING: "生产中",
  READY: "生产完成",
  SHIPPED: "已发货",
  RECEIVED: "已收货",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};
const salesStatusLabels: Record<SalesStatus, string> = {
  DRAFT: "草稿",
  CONFIRMED: "已确认",
  PACKING: "装柜中",
  SHIPPED: "已发运",
  ARRIVED: "已到港",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

interface PayableContract {
  id: string;
  contractNo: string;
  totalAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  status: string;
  supplier?: { id: string; name: string };
}

interface ReceivableContract {
  id: string;
  contractNo: string;
  totalAmount: number;
  receivedAmount: number;
  unreceiveAmount: number;
  exchangeRate: number;
  status: string;
  stores?: string[];
  hasThirdPartyCargo?: boolean;
  sourceParties?: string[];
  items?: Array<{ store?: { id: string; name: string } }>;
}

interface FinanceStats {
  payable: { total: number; paid: number; unpaid: number };
  receivable: { total: number; received: number; unreceived: number };
}

/**
 * 职责：渲染收付管理页面
 * 思路：
 *   1. 顶部显示统计卡片
 *   2. 使用Tab切换应付/应收列表
 *   3. 支持快速记录付款/收款
 */
function PaymentsPageContent() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab") || "payable";

  // Tab状态（受控模式）
  const [activeTab, setActiveTab] = useState(tabFromUrl);

  // 同步URL参数变化
  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  // 统计数据
  const [, setStats] = useState<FinanceStats | null>(null);

  // 应付账款
  const [payables, setPayables] = useState<PayableContract[]>([]);
  const [payableLoading, setPayableLoading] = useState(true);
  const [payableError, setPayableError] = useState(false);
  const [selectedPayable, setSelectedPayable] =
    useState<PayableContract | null>(null);

  // 应收账款
  const [receivables, setReceivables] = useState<ReceivableContract[]>([]);
  const [receivableLoading, setReceivableLoading] = useState(true);
  const [receivableError, setReceivableError] = useState(false);
  const [selectedReceivable, setSelectedReceivable] =
    useState<ReceivableContract | null>(null);
  // 列表关键词（客户端过滤：合同号 / 供应商或门店）
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [payableTotal, setPayableTotal] = useState(0);
  const [receivableTotal, setReceivableTotal] = useState(0);
  const overdue = searchParams.get("overdue") === "true";
  const pastDelivery = searchParams.get("pastDelivery") === "true";
  useEffect(() => {
    setPage(1);
  }, [activeTab, keyword, pageSize, overdue, pastDelivery]);

  // 待分配收款
  const [unallocatedPayments, setUnallocatedPayments] = useState<Payment[]>([]);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [allocateTarget, setAllocateTarget] = useState<Payment | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);

  // 银行流水对账数据（当合同为空时作为 fallback 填充列表）
  const [reconData, setReconData] = useState<FullReconciliationResult | null>(
    null,
  );
  const [auxiliaryError, setAuxiliaryError] = useState(false);
  const [bankStats, setBankStats] = useState<BankFlowStats | null>(null);
  const [incomingData, setIncomingData] =
    useState<IncomingSummaryResult | null>(null);
  const reconciliationLoadedRef = useRef(false);

  // 1. 加载统计数据
  const fetchStats = useCallback(async () => {
    try {
      const data = await cachedFetch("fin-stats", () =>
        financeService.getStats(),
      );
      setStats(data);
    } catch {
      errorLogger.error("Payments", "获取财务统计失败");
    }
  }, []);

  // 2. 加载应付账款（带缓存）
  const fetchPayables = useCallback(async () => {
    setPayableLoading(true);
    setPayableError(false);
    try {
      const response = await cachedFetch(
        `fin-payables-${page}-${pageSize}-${keyword}-${pastDelivery}`,
        () =>
          financeService.getPayables({
            page,
            pageSize,
            search: keyword,
            outstandingOnly: true,
            pastDelivery,
          }),
      );
      setPayableTotal(
        response.data?.pagination?.total ?? response.data?.items?.length ?? 0,
      );
      setPayables(
        (response.data?.items || []).map((item) => ({
          id: item.id,
          contractNo: item.contractNo,
          totalAmount: item.totalAmount,
          paidAmount: item.paidAmount ?? 0,
          unpaidAmount:
            item.unpaidAmount ??
            Math.max(0, item.totalAmount - (item.paidAmount ?? 0)),
          status: item.status,
          supplier: item.supplier,
        })),
      );
    } catch {
      setPayableError(true);
      toast.error("加载应付账款失败");
    } finally {
      setPayableLoading(false);
    }
  }, [page, pageSize, keyword, pastDelivery]);

  // 3a. 加载待分配收款
  const fetchUnallocated = useCallback(async () => {
    try {
      const res = await financeService.getUnallocatedPayments();
      setUnallocatedPayments(res.data || []);
    } catch {
      setAuxiliaryError(true);
    }
  }, []);

  // 3. 加载应收账款（带缓存）
  const fetchReceivables = useCallback(async () => {
    setReceivableLoading(true);
    setReceivableError(false);
    try {
      const response = await cachedFetch(
        `fin-receivables-${page}-${pageSize}-${keyword}-${overdue}`,
        () =>
          financeService.getReceivables({
            page,
            pageSize,
            search: keyword,
            outstandingOnly: true,
            overdue,
          }),
      );
      setReceivableTotal(
        response.data?.pagination?.total ?? response.data?.items?.length ?? 0,
      );
      setReceivables(
        (response.data?.items || []).map((item) => ({
          id: item.id,
          contractNo: item.contractNo,
          totalAmount: item.totalAmount,
          receivedAmount: item.receivedAmount ?? 0,
          unreceiveAmount:
            item.unreceiveAmount ??
            Math.max(0, item.totalAmount - (item.receivedAmount ?? 0)),
          exchangeRate: 0,
          status: item.status,
          // 后端已聚合好的门店名称数组（优先）
          stores: (item as unknown as { stores?: string[] }).stores,
          hasThirdPartyCargo: (
            item as unknown as { hasThirdPartyCargo?: boolean }
          ).hasThirdPartyCargo,
          sourceParties: (item as unknown as { sourceParties?: string[] })
            .sourceParties,
          items: item.items,
        })),
      );
    } catch {
      setReceivableError(true);
      toast.error("加载应收账款失败");
    } finally {
      setReceivableLoading(false);
    }
  }, [page, pageSize, keyword, overdue]);

  const fetchReconciliation = useCallback(async (force = false) => {
    if (!force && reconciliationLoadedRef.current) {
      return;
    }
    reconciliationLoadedRef.current = true;
    try {
      const data = await getFullReconciliation();
      setReconData(data);
    } catch {
      reconciliationLoadedRef.current = false;
      setAuxiliaryError(true);
    }
  }, []);

  const loadPayableData = useCallback(
    async (_force = false) => {
      await Promise.all([
        fetchPayables(),
        getTransactionStats()
          .then(setBankStats)
          .catch(() => {
            setAuxiliaryError(true);
          }),
      ]);
    },
    [fetchPayables],
  );

  const loadReceivableData = useCallback(
    async (_force = false) => {
      await Promise.all([
        fetchReceivables(),
        getIncomingSummary()
          .then(setIncomingData)
          .catch(() => {
            setAuxiliaryError(true);
          }),
        getTransactionStats()
          .then(setBankStats)
          .catch(() => {
            setAuxiliaryError(true);
          }),
      ]);
    },
    [fetchReceivables],
  );

  // 0. 初始化基础数据；业务列表按当前 Tab 懒加载
  useEffect(() => {
    void fetchStats();
    void fetchUnallocated();
  }, [fetchStats, fetchUnallocated]);

  useEffect(() => {
    if (activeTab === "receivable") {
      void loadReceivableData();
      return;
    }
    void loadPayableData();
  }, [activeTab, loadPayableData, loadReceivableData]);

  useEffect(() => {
    if (activeTab !== "payable") {
      return;
    }

    const timer = window.setTimeout(() => {
      void fetchReconciliation();
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [activeTab, fetchReconciliation]);

  // 处理付款提交
  const handlePayableSubmit = async (data: PaymentSubmitData) => {
    if (!selectedPayable) return;
    try {
      await financeService.createPayment({
        type: PaymentType.PAYABLE,
        purchaseContractId: selectedPayable.id,
        amount: Number(data.amount),
        currency: "CNY",
        paymentMethod: data.paymentMethod,
        paymentDate: data.paymentDate.toISOString(),
        note: data.note,
      });
      toast.success("付款记录已保存");
      setSelectedPayable(null);
      invalidateCache("fin-payables");
      invalidateCache("fin-stats");
      fetchPayables();
      fetchStats();
    } catch {
      toast.error("记录付款失败");
    }
  };

  // 处理收款提交（保留：直接绑定合同的旧流程）
  const handleReceivableSubmit = async (data: PaymentSubmitData) => {
    if (!selectedReceivable) return;
    try {
      await financeService.createPayment({
        type: PaymentType.RECEIVABLE,
        salesContractId: selectedReceivable.id,
        amount: Number(data.amount),
        currency: "USD",
        paymentMethod: data.paymentMethod,
        paymentDate: data.paymentDate.toISOString(),
        note: data.note,
      });
      toast.success("收款记录已保存");
      setSelectedReceivable(null);
      invalidateCache("fin-receivables");
      invalidateCache("fin-stats");
      fetchReceivables();
      fetchStats();
    } catch {
      toast.error("记录收款失败");
    }
  };

  // 处理"先记录到账"提交（新流程：无合同，进入待分配池）
  const handleReceiptSubmit = async (data: ReceiptSubmitData) => {
    try {
      await financeService.createPayment({
        type: PaymentType.RECEIVABLE_RECEIPT,
        customerName: data.customerName,
        amount: data.amount,
        currency: data.currency,
        paymentMethod: data.paymentMethod,
        paymentDate: data.paymentDate.toISOString(),
        note:
          buildReceiptNote({
            contractRef: data.contractRef,
            note: data.note,
          }) || undefined,
      });
      toast.success("到账记录已保存，请前往分配");
      setReceiptDialogOpen(false);
      fetchUnallocated();
    } catch {
      toast.error("记录到账失败");
    }
  };

  // 处理分配提交
  const handleAllocateSubmit = async (
    paymentId: string,
    allocations: { salesContractId: string; amount: number }[],
  ) => {
    try {
      await financeService.allocatePayment(paymentId, allocations);
      toast.success(`已分配 ${allocations.length} 张合同`);
      setAllocateTarget(null);
      invalidateCache("fin-receivables");
      invalidateCache("fin-stats");
      fetchUnallocated();
      fetchReceivables();
      fetchStats();
    } catch {
      toast.error("分配失败，请重试");
    }
  };

  const handleAutoMatch = async () => {
    setAutoMatching(true);
    try {
      const res = await financeService.autoMatchUnallocatedPayments();
      const result = res.data;
      if ((result?.matchedCount || 0) > 0) {
        toast.success(
          `自动匹配 ${result?.matchedCount} 笔，剩余 ${result?.skippedCount || 0} 笔待人工处理`,
        );
      } else {
        toast.message(
          `没有命中高置信度规则，${result?.skippedCount || 0} 笔继续留在收款池`,
        );
      }
      invalidateCache("fin-receivables");
      invalidateCache("fin-stats");
      fetchUnallocated();
      fetchReceivables();
      fetchStats();
    } catch {
      toast.error("自动匹配失败，请稍后重试");
    } finally {
      setAutoMatching(false);
    }
  };

  // 获取门店名称（应收列表展示与关键词筛选）
  // 优先使用后端已聚合的 stores 字段，fallback 到 items[].store.name
  const getStoreNames = (contract: ReceivableContract) => {
    if (contract.stores && contract.stores.length > 0) {
      return contract.stores.join(", ");
    }
    const fromItems = contract.items
      ?.map((item) => item.store?.name)
      .filter(Boolean) as string[];
    return fromItems && fromItems.length > 0 ? fromItems.join(", ") : "-";
  };

  // 待付/待收基础列表（统计卡片用全量；表格再套关键词）
  const unpaidBase = useMemo(
    () => payables.filter((c) => c.unpaidAmount > 0),
    [payables],
  );
  const unreceiveBase = useMemo(
    () => receivables.filter((c) => c.unreceiveAmount > 0),
    [receivables],
  );

  const unpaidContracts = unpaidBase;
  const unreceiveContracts = unreceiveBase;

  // 银行流水 -> 供应商付款映射（仅展示供应商核对信息，不参与合同余额）
  type BankPayRow = {
    name: string;
    netPaid: number;
    totalInvoice: number;
    gap: number;
    category: string;
    txnCount: number;
    invCount: number;
  };
  const bankPayMap = useMemo<Record<string, BankPayRow>>(() => {
    if (!reconData) return {};
    const map: Record<string, BankPayRow> = {};
    const norm = (s: string) =>
      s
        .replace(/[\uff08\u3008]/g, "(")
        .replace(/[\uff09\u3009]/g, ")")
        .replace(/\s+/g, "")
        .toLowerCase();
    for (const m of reconData.matched) {
      const row = {
        name: m.payName,
        netPaid: m.netPaid,
        totalInvoice: m.totalInvoice,
        gap: m.gap,
        category: m.category,
        txnCount: m.txnCount,
        invCount: m.invCount,
      };
      map[norm(m.payName)] = row;
      if (m.invName) map[norm(m.invName)] = row;
    }
    for (const p of reconData.unmatchedPayments) {
      map[norm(p.counterpart)] = {
        name: p.counterpart,
        netPaid: p.netPaid,
        totalInvoice: 0,
        gap: p.netPaid,
        category: "no_invoice",
        txnCount: p.txnCount,
        invCount: 0,
      };
    }
    return map;
  }, [reconData]);

  const lookupBankPaid = (
    supplierName: string | undefined,
  ): BankPayRow | null => {
    if (!supplierName) return null;
    const norm = (s: string) =>
      s
        .replace(/[\uff08\u3008]/g, "(")
        .replace(/[\uff09\u3009]/g, ")")
        .replace(/\s+/g, "")
        .toLowerCase();
    const key = norm(supplierName);
    if (bankPayMap[key]) return bankPayMap[key];
    return null;
  };

  // 所有银行流水按供应商汇总行（无合同时 fallback + 有合同时用于显示未关联供应商）
  const allBankPayRows = useMemo<BankPayRow[]>(() => {
    if (!reconData) return [];
    const rows: BankPayRow[] = [];
    for (const m of reconData.matched) {
      rows.push({
        name: m.payName,
        netPaid: m.netPaid,
        totalInvoice: m.totalInvoice,
        gap: m.gap,
        category: m.category,
        txnCount: m.txnCount,
        invCount: m.invCount,
      });
    }
    for (const p of reconData.unmatchedPayments) {
      rows.push({
        name: p.counterpart,
        netPaid: p.netPaid,
        totalInvoice: 0,
        gap: p.netPaid,
        category: "no_invoice",
        txnCount: p.txnCount,
        invCount: 0,
      });
    }
    rows.sort((a, b) => b.netPaid - a.netPaid);
    return rows;
  }, [reconData]);

  const filteredBankPayable = useMemo(() => {
    if (!keyword.trim()) return allBankPayRows;
    const q = keyword.toLowerCase().trim();
    return allBankPayRows.filter((r) => r.name.toLowerCase().includes(q));
  }, [allBankPayRows, keyword]);

  const hasContracts = payableTotal > 0 || payableLoading || payableError;

  // 银行流水应收数据
  const bankReceivableRows = useMemo(() => {
    if (!incomingData) return [];
    return incomingData.items;
  }, [incomingData]);

  const filteredBankReceivable = useMemo(() => {
    if (!keyword.trim()) return bankReceivableRows;
    const q = keyword.toLowerCase().trim();
    return bankReceivableRows.filter((r) => r.name.toLowerCase().includes(q));
  }, [bankReceivableRows, keyword]);

  const hasReceivableContracts =
    receivableTotal > 0 || receivableLoading || receivableError;

  // 合同应付列表排序（含银行流水注入数据）
  const contractPaySort = useTableSort(unpaidContracts, (item, key) => {
    const bp = lookupBankPaid(item.supplier?.name);
    switch (key) {
      case "contractNo":
        return item.contractNo;
      case "supplier":
        return item.supplier?.name ?? "";
      case "totalAmount":
        return item.totalAmount;
      case "bankPaid":
        return item.paidAmount;
      case "invoice":
        return bp?.totalInvoice ?? 0;
      case "unpaid":
        return item.unpaidAmount;
      default:
        return null;
    }
  });

  // 银行流水应付列表排序
  const bankPaySort = useTableSort<BankPayRow, string>(
    filteredBankPayable,
    (item, key) => {
      switch (key) {
        case "name":
          return item.name;
        case "netPaid":
          return item.netPaid;
        case "totalInvoice":
          return item.totalInvoice;
        case "gap":
          return item.gap;
        case "txnCount":
          return item.txnCount;
        default:
          return null;
      }
    },
    { key: "netPaid", dir: "desc" },
  );

  // 银行流水应收列表排序
  const bankRecvSort = useTableSort<
    (typeof filteredBankReceivable)[number],
    string
  >(
    filteredBankReceivable,
    (item, key) => {
      switch (key) {
        case "name":
          return item.name;
        case "totalIn":
          return item.totalIn;
        case "txnCount":
          return item.txnCount;
        default:
          return null;
      }
    },
    { key: "totalIn", dir: "desc" },
  );

  const fmtCny = (n: number) =>
    n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const categoryBadge = (cat: string) => {
    switch (cat) {
      case "under_invoiced":
        return (
          <Badge variant="destructive" className="text-[10px]">
            缺票
          </Badge>
        );
      case "over_invoiced":
        return (
          <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500">
            多开票
          </Badge>
        );
      case "no_invoice":
        return (
          <Badge
            variant="outline"
            className="text-[10px] text-red-600 border-red-200"
          >
            无票
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            className="text-[10px] text-green-600 border-green-200"
          >
            已匹配
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={FINANCE_TABS} moduleName="财务" />
      <PageHeader
        title="收付管理"
        description="管理应付账款与应收账款"
        actions={
          <div className="flex gap-2">
            <BusinessWrite>
              <Button
                size="sm"
                className="h-10"
                onClick={() => setReceiptDialogOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" /> 记录到账
              </Button>
            </BusinessWrite>
            <Button
              variant="outline"
              size="sm"
              className="h-10"
              onClick={() => {
                setAuxiliaryError(false);
                clearApiGetCache();
                invalidateCache("fin-");
                void fetchStats();
                void fetchUnallocated();
                if (activeTab === "receivable") {
                  void loadReceivableData(true);
                } else {
                  void loadPayableData(true);
                  void fetchReconciliation(true);
                }
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> 刷新
            </Button>
          </div>
        }
      />

      {/* 待分配款项池 */}
      {unallocatedPayments.length > 0 && (
        <Card className="border-orange-200 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-950/20">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-orange-700 dark:text-orange-400">
              <Split className="h-4 w-4" />
              待分配款项（{unallocatedPayments.length} 笔）
            </CardTitle>
            <BusinessWrite>
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-orange-300 bg-background text-xs text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:text-orange-300 dark:hover:bg-orange-950"
                onClick={() => void handleAutoMatch()}
                disabled={autoMatching}
              >
                <RefreshCw
                  className={`mr-1 h-3.5 w-3.5 ${autoMatching ? "animate-spin" : ""}`}
                />
                {autoMatching ? "自动匹配中" : "自动匹配"}
              </Button>
            </BusinessWrite>
          </CardHeader>
          <CardContent className="space-y-2">
            {unallocatedPayments.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-orange-200 bg-background px-3 py-2 dark:border-orange-900"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm">
                      {p.customerName || "未标注客户"}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      剩余待分配 {p.currency}{" "}
                      {(p.remainingAmount ?? p.amount).toLocaleString()}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(p.paymentDate).toLocaleDateString("zh-CN")}
                    {p.note && ` · ${p.note}`}
                  </span>
                </div>
                <BusinessWrite>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setAllocateTarget(p)}
                  >
                    <Split className="mr-1 h-3 w-3" /> 分配
                  </Button>
                </BusinessWrite>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {auxiliaryError && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/30 p-3 text-sm text-destructive">
          银行汇总、收款池或对账数据读取失败{" "}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              clearApiGetCache();
              invalidateCache("fin-");
              setAuxiliaryError(false);
              void fetchUnallocated();
              void loadPayableData(true);
              void loadReceivableData(true);
              void fetchReconciliation(true);
            }}
          >
            重试
          </Button>
        </div>
      )}
      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">银行总支出</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {bankStats && !auxiliaryError
                ? `¥${fmtCny(bankStats.totalOut)}`
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {reconData
                ? `${reconData.summary.matchedCount + reconData.summary.unmatchedPaymentCount} 家供应商`
                : "加载中..."}
            </p>
          </CardContent>
        </Card>
        <Card className="kpi-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">银行总收入</CardTitle>
            <ArrowDownLeft className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {bankStats && !auxiliaryError
                ? `¥${fmtCny(bankStats.totalIn)}`
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {incomingData
                ? `${incomingData.items.length} 家付款方`
                : "切换应收账款查看"}
            </p>
          </CardContent>
        </Card>
        {reconData && (
          <>
            <Card className="kpi-card border-red-200 bg-red-50/20 dark:bg-red-950/10">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  缺票供应商
                </CardTitle>
                <FileWarning className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {reconData.summary.underInvoicedCount}
                </div>
                <p className="text-xs text-red-600">
                  缺票 ¥{fmtCny(reconData.summary.underInvoicedGap)}
                </p>
              </CardContent>
            </Card>
            <Card className="kpi-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  已匹配供应商
                </CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {reconData.summary.matchedCount}
                </div>
                <p className="text-xs text-muted-foreground">
                  其中正常 {reconData.summary.normalCount} 家
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* 统一搜索：对当前 Tab 下列表做客户端过滤 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-9"
            placeholder="搜索合同号、供应商/门店..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        {keyword && (
          <Button variant="ghost" size="sm" onClick={() => setKeyword("")}>
            <X className="mr-1 h-4 w-4" />
            重置
          </Button>
        )}
      </div>

      {pastDelivery && activeTab === "payable" && (
        <p className="text-sm text-muted-foreground">
          筛选：超过预计交期且仍待付
        </p>
      )}
      {overdue && activeTab === "receivable" && (
        <p className="text-sm text-muted-foreground">
          筛选：发运后30天仍未收齐（运营提示）
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          共 {activeTab === "payable" ? payableTotal : receivableTotal}{" "}
          笔合同；本页排序
        </span>
        <div className="flex items-center gap-2">
          <PageSizeSelect value={pageSize} onChange={setPageSize} />
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            上一页
          </Button>
          <span>第 {page} 页</span>
          <Button
            variant="outline"
            size="sm"
            disabled={
              page * pageSize >=
              (activeTab === "payable" ? payableTotal : receivableTotal)
            }
            onClick={() => setPage(page + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
      {/* Tab切换 */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="border bg-background">
          <TabsTrigger value="payable" className="gap-2">
            <ArrowUpRight className="h-4 w-4" />
            应付账款
          </TabsTrigger>
          <TabsTrigger value="receivable" className="gap-2">
            <ArrowDownLeft className="h-4 w-4" />
            应收账款
          </TabsTrigger>
        </TabsList>

        {/* 应付账款Tab */}
        <TabsContent value="payable" className="space-y-4">
          {/* 移动端卡片视图 */}
          <div className="space-y-3 md:hidden">
            {payableLoading ? (
              <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
                加载中...
              </div>
            ) : payableError ? (
              <div className="surface-panel py-10 text-center text-sm text-destructive">
                加载失败 —&nbsp;
                <button
                  className="underline"
                  onClick={() => void fetchPayables()}
                >
                  重试
                </button>
              </div>
            ) : hasContracts ? (
              unpaidContracts.length === 0 ? (
                <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
                  {keyword ? "没有匹配当前关键词的记录" : "暂无待付账款"}
                </div>
              ) : (
                unpaidContracts.map((contract) => {
                  const bp = lookupBankPaid(contract.supplier?.name);
                  const actualPaid = contract.paidAmount;
                  const actualUnpaid = Math.max(
                    0,
                    contract.totalAmount - actualPaid,
                  );
                  return (
                    <MobileListCard
                      key={contract.id}
                      title={contract.contractNo}
                      subtitle={contract.supplier?.name || "未知供应商"}
                      badge={
                        <Badge variant="outline" className="text-xs">
                          {purchaseStatusLabels[
                            contract.status as PurchaseStatus
                          ] ?? contract.status}
                        </Badge>
                      }
                      fields={[
                        {
                          label: "总金额",
                          value: `¥${contract.totalAmount.toLocaleString()}`,
                        },
                        {
                          label: "合同已付",
                          value: `¥${fmtCny(actualPaid)}`,
                          emphasis: "primary",
                        },
                      ]}
                      amount={{
                        label: "待付",
                        value: `¥${fmtCny(actualUnpaid)}`,
                        emphasis: actualUnpaid > 0 ? "danger" : undefined,
                      }}
                      action={
                        <BusinessWrite>
                          <Button
                            size="sm"
                            className="h-10 w-full rounded-xl"
                            onClick={() => setSelectedPayable(contract)}
                          >
                            <CreditCard className="mr-2 h-4 w-4" /> 记录付款
                          </Button>
                        </BusinessWrite>
                      }
                    />
                  );
                })
              )
            ) : filteredBankPayable.length === 0 ? (
              <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
                {keyword ? "没有匹配当前关键词的记录" : "暂无付款数据"}
              </div>
            ) : (
              filteredBankPayable.map((r) => (
                <MobileListCard
                  key={r.name}
                  title={r.name}
                  subtitle={`${r.txnCount} 笔流水 · ${r.invCount} 张发票`}
                  badge={categoryBadge(r.category)}
                  fields={[
                    {
                      label: "已付",
                      value: `¥${fmtCny(r.netPaid)}`,
                      emphasis: "primary",
                    },
                    {
                      label: "供应商发票汇总",
                      value: `¥${fmtCny(r.totalInvoice)}`,
                    },
                  ]}
                  amount={{
                    label: "差额",
                    value: `¥${fmtCny(r.gap)}`,
                    emphasis: r.gap > 0 ? "danger" : undefined,
                  }}
                />
              ))
            )}
          </div>

          {/* 桌面端表格 */}
          {hasContracts ? (
            <Card className="hidden overflow-hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      sortKey="contractNo"
                      currentSortKey={contractPaySort.sortKey}
                      currentSortDir={contractPaySort.sortDir}
                      onSort={contractPaySort.onSort}
                    >
                      合同编号
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="supplier"
                      currentSortKey={contractPaySort.sortKey}
                      currentSortDir={contractPaySort.sortDir}
                      onSort={contractPaySort.onSort}
                    >
                      供应商
                    </SortableTableHead>
                    <TableHead>状态</TableHead>
                    <SortableTableHead
                      sortKey="totalAmount"
                      currentSortKey={contractPaySort.sortKey}
                      currentSortDir={contractPaySort.sortDir}
                      onSort={contractPaySort.onSort}
                      className="text-right"
                    >
                      合同金额 (¥)
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="bankPaid"
                      currentSortKey={contractPaySort.sortKey}
                      currentSortDir={contractPaySort.sortDir}
                      onSort={contractPaySort.onSort}
                      className="text-right"
                    >
                      合同已付
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="invoice"
                      currentSortKey={contractPaySort.sortKey}
                      currentSortDir={contractPaySort.sortDir}
                      onSort={contractPaySort.onSort}
                      className="text-right"
                    >
                      供应商发票汇总
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="unpaid"
                      currentSortKey={contractPaySort.sortKey}
                      currentSortDir={contractPaySort.sortDir}
                      onSort={contractPaySort.onSort}
                      className="text-right"
                    >
                      待付 (¥)
                    </SortableTableHead>
                    <TableHead>票据</TableHead>
                    <TableHead className="w-[100px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payableLoading ? (
                    <TableStateRow
                      colSpan={9}
                      variant="loading"
                      title="加载中..."
                    />
                  ) : payableError ? (
                    <TableStateRow
                      colSpan={9}
                      variant="error"
                      title="数据加载失败"
                      description="应付账款列表暂时不可用，请稍后重试。"
                      action={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void fetchPayables()}
                        >
                          <RefreshCw className="mr-1 h-4 w-4" />
                          重试
                        </Button>
                      }
                    />
                  ) : contractPaySort.sortedData.length === 0 ? (
                    <TableStateRow
                      colSpan={9}
                      variant="empty"
                      icon={Search}
                      title="暂无待付账款"
                      description={
                        keyword
                          ? "没有匹配当前关键词的供应商付款记录。"
                          : "当前没有需要处理的供应商付款记录。"
                      }
                    />
                  ) : (
                    contractPaySort.sortedData.map((contract) => {
                      const bp = lookupBankPaid(contract.supplier?.name);
                      const actualPaid = contract.paidAmount;
                      const actualUnpaid = Math.max(
                        0,
                        contract.totalAmount - actualPaid,
                      );
                      return (
                        <TableRow
                          key={contract.id}
                          className={
                            bp && bp.category === "under_invoiced"
                              ? "bg-red-50/20 dark:bg-red-950/5"
                              : ""
                          }
                        >
                          <TableCell className="font-medium">
                            {contract.contractNo}
                          </TableCell>
                          <TableCell className="max-w-[160px] truncate">
                            {contract.supplier?.name || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {purchaseStatusLabels[
                                contract.status as PurchaseStatus
                              ] ?? contract.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {contract.totalAmount.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span>
                              {contract.paidAmount > 0
                                ? `¥${fmtCny(contract.paidAmount)}`
                                : "-"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs">
                            {bp && bp.totalInvoice > 0
                              ? `¥${fmtCny(bp.totalInvoice)}`
                              : "-"}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums font-bold ${actualUnpaid > 0 ? "text-red-600" : "text-green-600"}`}
                          >
                            {actualUnpaid > 0
                              ? `¥${fmtCny(actualUnpaid)}`
                              : "已付清"}
                          </TableCell>
                          <TableCell>
                            {bp ? (
                              categoryBadge(bp.category)
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                -
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {actualUnpaid > 0 && (
                                <BusinessWrite>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setSelectedPayable(contract)}
                                  >
                                    <CreditCard className="mr-1 h-3 w-3" /> 付款
                                  </Button>
                                </BusinessWrite>
                              )}
                              {contract.supplier?.name && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  asChild
                                >
                                  <Link
                                    href={`/dashboard/finance/bank-flow?search=${encodeURIComponent(contract.supplier.name)}`}
                                    title="查看流水"
                                  >
                                    <Landmark className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card className="hidden overflow-hidden md:block">
              {allBankPayRows.length > 0 && (
                <div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-blue-700 bg-blue-50/40 dark:bg-blue-950/20 dark:text-blue-300">
                  <Landmark className="h-4 w-4 shrink-0" />
                  <span>
                    以下为<strong>银行流水供应商汇总</strong>
                    ，用于对账，不代表各张合同已结清。
                  </span>
                  <Button
                    size="sm"
                    variant="link"
                    className="ml-auto h-auto p-0 text-xs text-blue-600"
                    asChild
                  >
                    <Link href="/dashboard/finance/reconciliation">
                      完整对账 &rarr;
                    </Link>
                  </Button>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      sortKey="name"
                      currentSortKey={bankPaySort.sortKey}
                      currentSortDir={bankPaySort.sortDir}
                      onSort={bankPaySort.onSort}
                    >
                      供应商
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="netPaid"
                      currentSortKey={bankPaySort.sortKey}
                      currentSortDir={bankPaySort.sortDir}
                      onSort={bankPaySort.onSort}
                      className="text-right"
                    >
                      已付金额 (¥)
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="totalInvoice"
                      currentSortKey={bankPaySort.sortKey}
                      currentSortDir={bankPaySort.sortDir}
                      onSort={bankPaySort.onSort}
                      className="text-right"
                    >
                      发票金额 (¥)
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="gap"
                      currentSortKey={bankPaySort.sortKey}
                      currentSortDir={bankPaySort.sortDir}
                      onSort={bankPaySort.onSort}
                      className="text-right"
                    >
                      差额 (¥)
                    </SortableTableHead>
                    <TableHead>票据状态</TableHead>
                    <SortableTableHead
                      sortKey="txnCount"
                      currentSortKey={bankPaySort.sortKey}
                      currentSortDir={bankPaySort.sortDir}
                      onSort={bankPaySort.onSort}
                      className="text-right w-[50px]"
                    >
                      笔数
                    </SortableTableHead>
                    <TableHead className="w-[80px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankPaySort.sortedData.length === 0 ? (
                    <TableStateRow
                      colSpan={7}
                      variant="empty"
                      icon={Search}
                      title="没有匹配的记录"
                      description={
                        keyword
                          ? "没有匹配当前关键词的供应商。"
                          : "暂无银行流水数据。"
                      }
                    />
                  ) : (
                    bankPaySort.sortedData.map((r) => (
                      <TableRow
                        key={r.name}
                        className={
                          r.category === "under_invoiced"
                            ? "bg-red-50/30 dark:bg-red-950/5"
                            : r.category === "no_invoice"
                              ? "bg-red-50/20 dark:bg-red-950/5"
                              : ""
                        }
                      >
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {r.name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-green-600">
                          ¥{fmtCny(r.netPaid)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.totalInvoice > 0
                            ? `¥${fmtCny(r.totalInvoice)}`
                            : "-"}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums font-medium ${r.gap > 0 ? "text-red-600" : r.gap < 0 ? "text-amber-600" : "text-green-600"}`}
                        >
                          {r.gap > 0 ? "+" : ""}
                          {fmtCny(r.gap)}
                        </TableCell>
                        <TableCell>{categoryBadge(r.category)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {r.txnCount}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              asChild
                            >
                              <Link
                                href={`/dashboard/finance/bank-flow?search=${encodeURIComponent(r.name)}`}
                                title="查看流水"
                              >
                                <Landmark className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              asChild
                            >
                              <Link
                                href={`/dashboard/finance/invoices?search=${encodeURIComponent(r.name)}`}
                                title="查看发票"
                              >
                                <FileText className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* 应收账款Tab */}
        <TabsContent value="receivable" className="space-y-4">
          {/* 移动端卡片视图 */}
          <div className="space-y-3 md:hidden">
            {receivableLoading ? (
              <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
                加载中...
              </div>
            ) : receivableError ? (
              <div className="surface-panel py-10 text-center text-sm text-destructive">
                加载失败 —&nbsp;
                <button
                  className="underline"
                  onClick={() => void fetchReceivables()}
                >
                  重试
                </button>
              </div>
            ) : hasReceivableContracts ? (
              unreceiveContracts.length === 0 ? (
                <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
                  {keyword ? "没有匹配当前关键词的记录" : "暂无待收账款"}
                </div>
              ) : (
                unreceiveContracts.map((contract) => (
                  <MobileListCard
                    key={contract.id}
                    title={contract.contractNo}
                    subtitle={getStoreNames(contract)}
                    badge={
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-xs">
                          {salesStatusLabels[contract.status as SalesStatus] ??
                            contract.status}
                        </Badge>
                        <Badge
                          variant={
                            contract.hasThirdPartyCargo
                              ? "secondary"
                              : "outline"
                          }
                          className="text-xs"
                        >
                          {contract.hasThirdPartyCargo
                            ? "含第三方拼柜"
                            : "仅捷淞货物"}
                        </Badge>
                      </div>
                    }
                    fields={[
                      {
                        label: "总金额",
                        value: `$${contract.totalAmount.toLocaleString()}`,
                      },
                      {
                        label: "已收",
                        value: `$${contract.receivedAmount.toLocaleString()}`,
                        emphasis: "primary",
                      },
                      ...(contract.hasThirdPartyCargo &&
                      contract.sourceParties?.length
                        ? [
                            {
                              label: "来源方",
                              value: contract.sourceParties.join(", "),
                            },
                          ]
                        : []),
                    ]}
                    amount={{
                      label: "待收",
                      value: `$${contract.unreceiveAmount.toLocaleString()}`,
                      emphasis: "danger",
                    }}
                    action={
                      <BusinessWrite>
                        <Button
                          size="sm"
                          className="h-10 w-full rounded-xl"
                          onClick={() => setSelectedReceivable(contract)}
                        >
                          <CreditCard className="mr-2 h-4 w-4" /> 记录收款
                        </Button>
                      </BusinessWrite>
                    }
                  />
                ))
              )
            ) : filteredBankReceivable.length === 0 ? (
              <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
                {keyword ? "没有匹配当前关键词的记录" : "暂无收款数据"}
              </div>
            ) : (
              filteredBankReceivable.map((r) => (
                <MobileListCard
                  key={r.name}
                  title={r.name}
                  subtitle={`${r.txnCount} 笔收入`}
                  badge={
                    <Badge
                      variant="outline"
                      className="text-xs text-green-600 border-green-200"
                    >
                      已收
                    </Badge>
                  }
                  fields={[
                    {
                      label: "已收",
                      value: `¥${fmtCny(r.totalIn)}`,
                      emphasis: "primary",
                    },
                  ]}
                  amount={{ label: "总额", value: `¥${fmtCny(r.totalIn)}` }}
                />
              ))
            )}
          </div>

          {/* 桌面端表格 */}
          {hasReceivableContracts ? (
            <Card className="hidden overflow-hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>合同编号</TableHead>
                    <TableHead>门店</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead className="text-right">总金额 ($)</TableHead>
                    <TableHead className="text-right">已收 ($)</TableHead>
                    <TableHead className="text-right">待收 ($)</TableHead>
                    <TableHead className="w-[100px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivableLoading ? (
                    <TableStateRow
                      colSpan={7}
                      variant="loading"
                      title="加载中..."
                    />
                  ) : receivableError ? (
                    <TableStateRow
                      colSpan={7}
                      variant="error"
                      title="数据加载失败"
                      description="应收账款列表暂时不可用，请稍后重试。"
                      action={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void fetchReceivables()}
                        >
                          <RefreshCw className="mr-1 h-4 w-4" />
                          重试
                        </Button>
                      }
                    />
                  ) : unreceiveContracts.length === 0 ? (
                    <TableStateRow
                      colSpan={7}
                      variant="empty"
                      icon={Search}
                      title="暂无待收账款"
                      description={
                        keyword
                          ? "没有匹配当前关键词的门店回款记录。"
                          : "当前没有需要跟进的门店回款记录。"
                      }
                    />
                  ) : (
                    unreceiveContracts.map((contract) => (
                      <TableRow key={contract.id}>
                        <TableCell className="font-medium">
                          {contract.contractNo}
                        </TableCell>
                        <TableCell>{getStoreNames(contract)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline">
                              {salesStatusLabels[
                                contract.status as SalesStatus
                              ] ?? contract.status}
                            </Badge>
                            <Badge
                              variant={
                                contract.hasThirdPartyCargo
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {contract.hasThirdPartyCargo
                                ? "含第三方拼柜"
                                : "仅捷淞货物"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {contract.totalAmount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-primary/80">
                          {contract.receivedAmount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-primary font-bold">
                          {contract.unreceiveAmount.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <BusinessWrite>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedReceivable(contract)}
                              title={
                                contract.sourceParties?.length
                                  ? `来源方: ${contract.sourceParties.join(", ")}`
                                  : undefined
                              }
                            >
                              <CreditCard className="mr-1 h-3 w-3" /> 收款
                            </Button>
                          </BusinessWrite>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card className="hidden overflow-hidden md:block">
              {bankReceivableRows.length > 0 && (
                <div className="flex items-center gap-2 border-b px-4 py-2 text-xs text-green-700 bg-green-50/40 dark:bg-green-950/20 dark:text-green-300">
                  <ArrowDownLeft className="h-4 w-4 shrink-0" />
                  <span>
                    以下数据来自<strong>银行流水</strong>收入按付款方汇总。
                  </span>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      sortKey="name"
                      currentSortKey={bankRecvSort.sortKey}
                      currentSortDir={bankRecvSort.sortDir}
                      onSort={bankRecvSort.onSort}
                    >
                      付款方
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="totalIn"
                      currentSortKey={bankRecvSort.sortKey}
                      currentSortDir={bankRecvSort.sortDir}
                      onSort={bankRecvSort.onSort}
                      className="text-right"
                    >
                      已收金额 (¥)
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="txnCount"
                      currentSortKey={bankRecvSort.sortKey}
                      currentSortDir={bankRecvSort.sortDir}
                      onSort={bankRecvSort.onSort}
                      className="text-right"
                    >
                      交易笔数
                    </SortableTableHead>
                    <TableHead className="w-[80px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankRecvSort.sortedData.length === 0 ? (
                    <TableStateRow
                      colSpan={4}
                      variant="empty"
                      icon={Search}
                      title="没有匹配的记录"
                      description={
                        keyword
                          ? "没有匹配当前关键词的付款方。"
                          : "暂无银行收入数据。"
                      }
                    />
                  ) : (
                    bankRecvSort.sortedData.map((r) => (
                      <TableRow key={r.name}>
                        <TableCell className="font-medium max-w-[250px] truncate">
                          {r.name}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-green-600">
                          ¥{fmtCny(r.totalIn)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {r.txnCount}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            asChild
                          >
                            <Link
                              href={`/dashboard/finance/bank-flow?search=${encodeURIComponent(r.name)}`}
                              title="查看流水"
                            >
                              <Landmark className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* 付款弹窗 */}
      {selectedPayable && (
        <PaymentDialog
          open={!!selectedPayable}
          onOpenChange={(open) => !open && setSelectedPayable(null)}
          type={PaymentType.PAYABLE}
          contractId={selectedPayable.id}
          contractNo={selectedPayable.contractNo}
          remainingAmount={selectedPayable.unpaidAmount}
          onSubmit={handlePayableSubmit}
        />
      )}

      {/* 直接绑合同收款弹窗（保留旧流程） */}
      {selectedReceivable && (
        <PaymentDialog
          open={!!selectedReceivable}
          onOpenChange={(open) => !open && setSelectedReceivable(null)}
          type={PaymentType.RECEIVABLE}
          contractId={selectedReceivable.id}
          contractNo={selectedReceivable.contractNo}
          remainingAmount={selectedReceivable.unreceiveAmount}
          onSubmit={handleReceivableSubmit}
        />
      )}

      {/* 记录到账弹窗（新流程：先记录，后分配） */}
      <ReceiptDialog
        open={receiptDialogOpen}
        onOpenChange={setReceiptDialogOpen}
        onSubmit={handleReceiptSubmit}
      />

      {/* 分配弹窗 */}
      <AllocateDialog
        open={!!allocateTarget}
        onOpenChange={(open) => !open && setAllocateTarget(null)}
        payment={allocateTarget}
        onSubmit={handleAllocateSubmit}
      />
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <Suspense
      fallback={
        <LoadingState
          title="加载中..."
          description="正在同步收付管理视图和筛选状态。"
          className="min-h-[10rem] border-0 bg-transparent"
        />
      }
    >
      <PaymentsPageContent />
    </Suspense>
  );
}
