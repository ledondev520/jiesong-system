/**
 * Input: 出口订单详情（含关联采购单）、附件、按需加载的商品/门店/库存、当前用户角色
 * Output: 订单详情：页头（状态、唯一下一步按钮、「单证 ▾」）+ 概览/明细/采购/货柜/单证/收款/退税 七个页签
 * Pos: /dashboard/orders/[id] 主组件（UX 规范 §4.2）；状态流转仍走 salesService.updateStatus，规则不变
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Role,
  SalesStatus,
  type Inventory,
  type Product,
  type SalesContract,
  type Store,
} from "@/types";
import { salesService } from "@/services/sales.service";
import { productService } from "@/services/product.service";
import { storeService } from "@/services/store.service";
import { inventoryService } from "@/services/inventory.service";
import { customsDeclarationService } from "@/services/customsDeclaration.service";
import {
  listContractFiles,
  type ContractFile,
} from "@/services/contractFile.service";
import { useAuthStore } from "@/store/auth.store";
import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import { formatDate } from "@/lib/date-format";
import type { LoadingPlan } from "@/lib/containerLoading";
import { RecordHeader } from "@/components/layout/RecordHeader";
import { Button } from "@/components/ui/button";
import {
  StatusBadge,
  getStatusBadgeConfig,
} from "@/components/ui/status-badge";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ORDER_TABS,
  evaluateOrderReadiness,
  getNextStep,
  hasOrderShipped,
  resolveOrderTab,
  type OrderTab,
} from "./orderDetailModel";
import { OrderOverviewTab } from "./OrderOverviewTab";
import { OrderLinesTab } from "./OrderLinesTab";
import { OrderPurchasesTab } from "./OrderPurchasesTab";
import { OrderContainerTab } from "./OrderContainerTab";
import { OrderDocsTab } from "./OrderDocsTab";
import { OrderDocsMenu, type OrderDocAction } from "./OrderDocsMenu";
import { OrderRefundTab } from "./OrderRefundTab";
import { DetailSkeleton } from "@/components/ui/detail-skeleton";

const GenerateThreeFormsDialog = lazy(() =>
  import("@/components/dialog/GenerateThreeFormsDialog").then((module) => ({
    default: module.GenerateThreeFormsDialog,
  })),
);
const ExportPacketWorkbenchDialog = lazy(() =>
  import("@/components/dialog/ExportPacketWorkbenchDialog").then((module) => ({
    default: module.ExportPacketWorkbenchDialog,
  })),
);
const PackingListCheckDialog = lazy(() =>
  import("@/components/dialog/PackingListCheckDialog").then((module) => ({
    default: module.PackingListCheckDialog,
  })),
);
const TaxRefundPreparationDialog = lazy(() =>
  import("@/components/dialog/TaxRefundPreparationDialog").then((module) => ({
    default: module.TaxRefundPreparationDialog,
  })),
);
const ImportPurchaseItemsDialog = lazy(() =>
  import("./ImportPurchaseItemsDialog").then((module) => ({
    default: module.ImportPurchaseItemsDialog,
  })),
);
const GeneratePurchaseDraftsDialog = lazy(() =>
  import("./GeneratePurchaseDraftsDialog").then((module) => ({
    default: module.GeneratePurchaseDraftsDialog,
  })),
);
const SalesFinancePanel = lazy(() =>
  import("./SalesFinancePanel").then((module) => ({
    default: module.SalesFinancePanel,
  })),
);
const ForexVerificationPanel = lazy(() =>
  import("@/components/finance/ForexVerificationPanel").then((module) => ({
    default: module.ForexVerificationPanel,
  })),
);

// 后端 POST /sales/:id/purchase-drafts 仅允许 ADMIN/PURCHASE
const PURCHASE_DRAFT_ROLES: string[] = [Role.ADMIN, Role.PURCHASE];
// 与后端 POST /sales/:id/items/:itemId/reprice 一致；WAREHOUSE 看不到金额（OD-3），BOSS 只读。
const LINE_EDIT_ROLES: string[] = [
  Role.ADMIN,
  Role.PURCHASE,
  Role.SALES,
  Role.FINANCE,
];
// 仓库角色无账务读权限（后端 403），不展示收款/退税页签。
const FINANCE_TABS: string[] = ["receipts", "refund"];

// Shared Axios rejects HTTP response DTOs; Error-only checks hide stock/RBAC guards.
const errorMessage = (error: unknown, fallback: string) =>
  typeof error === "object" &&
  error !== null &&
  "message" in error &&
  typeof error.message === "string" &&
  error.message.trim()
    ? error.message
    : fallback;

const orderStatusLabel = (status: unknown) =>
  getStatusBadgeConfig(status, {}, "salesOrder").label;

export function OrderDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const role = useAuthStore((state) => state.user?.role);
  const canViewFinance = role !== Role.WAREHOUSE;
  const [contract, setContract] = useState<SalesContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [contractFiles, setContractFiles] = useState<ContractFile[]>([]);
  // 装柜计划绑定到取得它时的合同对象：合同刷新后旧计划立即失效（fail closed）
  const [planState, setPlanState] = useState<{
    forContract: SalesContract;
    plan: LoadingPlan | null;
    failed: boolean;
  } | null>(null);
  const [planAttempt, setPlanAttempt] = useState(0);
  const [referenceDataLoading, setReferenceDataLoading] = useState(false);
  const referenceDataLoadedRef = useRef(false);
  const queryTab = resolveOrderTab(searchParams?.get("tab"));
  const [activeTab, setActiveTab] = useState<OrderTab>(queryTab);
  // 同一页面实例内 URL 的 ?tab= 变化（前进/后退、站内链接）时跟随，点击页签仍即时生效
  const [seenQueryTab, setSeenQueryTab] = useState<OrderTab>(queryTab);
  if (seenQueryTab !== queryTab) {
    setSeenQueryTab(queryTab);
    setActiveTab(queryTab);
  }
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [advanceTarget, setAdvanceTarget] = useState<
    SalesContract["status"] | null
  >(null);
  const [dialog, setDialog] = useState<
    | "threeForms"
    | "exportPacket"
    | "packingCheck"
    | "taxPreparation"
    | "importPurchase"
    | "purchaseDrafts"
    | null
  >(null);

  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null);
  };

  /** 职责：首屏仅加载订单详情与附件 */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contractRes, filesRes] = await Promise.all([
        salesService.getById(id),
        listContractFiles(id, "SALES"),
      ]);
      setContract(contractRes.data);
      setContractFiles(filesRes.data || []);
    } catch {
      toast.error("加载数据失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  /** 职责：按需加载商品、含港口关联的门店及库存；失败 toast，可重试 */
  const loadReferenceData = useCallback(async () => {
    if (referenceDataLoadedRef.current || referenceDataLoading) return;
    setReferenceDataLoading(true);
    try {
      const [productsRes, storesRes, inventoryRes] = await Promise.all([
        productService.getAll({ pageSize: 500, lite: true }),
        storeService.getAll({ pageSize: 100 }),
        inventoryService.getAll({ pageSize: 500, lite: true }),
      ]);
      setProducts(productsRes.data?.items || []);
      setStores(storesRes.data?.items || []);
      setInventories(inventoryRes.data?.items || []);
      referenceDataLoadedRef.current = true;
    } catch {
      toast.error("加载商品、门店和库存数据失败");
    } finally {
      setReferenceDataLoading(false);
    }
  }, [referenceDataLoading]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // 排柜与出货门槛全部来自后端 loading-plan（与确认发运同一实现）
  useEffect(() => {
    if (!contract) return;
    let cancelled = false;
    salesService
      .getLoadingPlan(id)
      .then((res) => {
        if (!cancelled)
          setPlanState({
            forContract: contract,
            plan: res.data ?? null,
            failed: !res.data,
          });
      })
      .catch(() => {
        if (!cancelled)
          setPlanState({ forContract: contract, plan: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [contract, id, planAttempt]);

  // 失败后重试：先回到「核对中」，再重新取计划
  const retryPlan = () => {
    setPlanState(null);
    setPlanAttempt((n) => n + 1);
  };

  useEffect(() => {
    if (itemDialogOpen || activeTab === "container" || activeTab === "lines") {
      void loadReferenceData();
    }
  }, [activeTab, itemDialogOpen, loadReferenceData]);

  const changeTab = (value: string) => {
    const tab = resolveOrderTab(value);
    setActiveTab(tab);
    const query = new URLSearchParams(searchParams?.toString());
    query.set("tab", tab);
    router.replace(`${pathname}?${query.toString()}`, { scroll: false });
  };

  const advanceStatus = async (nextStatus: SalesContract["status"]) => {
    if (!contract) return;
    setStatusUpdating(true);
    try {
      await salesService.updateStatus(contract.id, nextStatus);
      toast.success("出口订单阶段已更新");
      await loadData();
      if (nextStatus === "SHIPPED") setDialog("taxPreparation");
    } catch (error: unknown) {
      toast.error(errorMessage(error, "状态推进失败"));
    } finally {
      setStatusUpdating(false);
    }
  };

  const runDocAction = async (action: OrderDocAction) => {
    if (!contract) return;
    if (action === "exportWorkbook") {
      try {
        await salesService.exportExcel(contract.id, contract.contractNo);
        toast.success("出口工作簿已导出");
      } catch (error: unknown) {
        toast.error(errorMessage(error, "导出出口工作簿失败"));
      }
      return;
    }
    if (action === "customsDraft") {
      try {
        const response = await customsDeclarationService.generateDrafts({
          salesContractId: contract.id,
        });
        const created = response?.data?.created ?? 0;
        const skipped = response?.data?.skipped ?? 0;
        toast.success(`报关单草稿：新增 ${created} 条，跳过 ${skipped} 条`);
      } catch (error: unknown) {
        toast.error(errorMessage(error, "生成报关单草稿失败"));
      }
      return;
    }
    setDialog(action);
  };

  if (loading && !contract) {
    return <DetailSkeleton />;
  }

  if (!contract) {
    return <div className="py-10 text-center">合同不存在</div>;
  }

  const packingRows = contract.packingItems ?? [];
  const currentPlanState =
    planState?.forContract === contract ? planState : null;
  const readiness = evaluateOrderReadiness(
    contract.status,
    packingRows,
    currentPlanState?.plan ?? null,
    currentPlanState?.failed ?? false,
  );
  const nextStep = getNextStep(contract, {
    canGeneratePurchase: Boolean(role && PURCHASE_DRAFT_ROLES.includes(role)),
  });
  const shipmentBlocked =
    nextStep?.status === "SHIPPED" && !readiness.readiness.ready;

  const onNextStep = () => {
    if (!nextStep) return;
    if (nextStep.kind === "purchaseDrafts") setDialog("purchaseDrafts");
    else if (nextStep.kind === "importPurchase") setDialog("importPurchase");
    // 每次状态推进先确认（手机误触同样要拦住）；采购/导入只是打开弹窗，不改状态
    else if (nextStep.status) setAdvanceTarget(nextStep.status);
  };

  return (
    <div className="min-w-0 space-y-6 pb-10">
      <RecordHeader
        number={contract.contractNo}
        backHref="/dashboard/orders"
        status={<StatusBadge status={contract.status} domain="salesOrder" />}
        facts={[
          { label: "客户", value: contract.customer?.name },
          { label: "目的港", value: contract.port?.name },
          { label: "签订", value: formatDate(contract.signedAt) },
          { label: "预计到港", value: formatDate(contract.estimatedArrival) },
        ]}
        primaryAction={
          <div className="flex flex-wrap items-center gap-2">
            <BusinessWrite>
              <OrderDocsMenu onSelect={runDocAction} role={role} />
            </BusinessWrite>
            {nextStep && (
              <BusinessWrite>
                <Button
                  onClick={onNextStep}
                  disabled={statusUpdating || shipmentBlocked}
                  title={shipmentBlocked ? readiness.headline : undefined}
                >
                  {statusUpdating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-4 w-4" />
                  )}
                  {nextStep.label}
                </Button>
                <ConfirmActionDialog
                  open={advanceTarget !== null}
                  onOpenChange={(open) => {
                    if (!open) setAdvanceTarget(null);
                  }}
                  title="确认变更订单状态"
                  description={`出口订单 ${contract.contractNo} 的状态将从「${orderStatusLabel(contract.status)}」改为「${orderStatusLabel(advanceTarget ?? nextStep.status)}」，确认后立即生效。`}
                  onConfirm={() => {
                    const target = advanceTarget;
                    setAdvanceTarget(null);
                    if (target) void advanceStatus(target);
                  }}
                />
              </BusinessWrite>
            )}
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={changeTab} className="min-w-0">
        <div className="overflow-x-auto pb-1">
          <TabsList variant="line">
            {ORDER_TABS.filter(
              (tab) => canViewFinance || !FINANCE_TABS.includes(tab.value),
            ).map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} variant="line">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OrderOverviewTab contract={contract} readiness={readiness} />
        </TabsContent>

        <TabsContent value="lines">
          <OrderLinesTab
            contract={contract}
            stores={stores}
            canEditLines={
              role !== undefined &&
              LINE_EDIT_ROLES.includes(role) &&
              !hasOrderShipped(contract.status) &&
              contract.status !== SalesStatus.CANCELLED
            }
            onReprice={async (changes) => {
              try {
                let totalFromPacking = false;
                for (const change of changes) {
                  const response = await salesService.repriceItem(
                    id,
                    change.itemId,
                    change.data,
                  );
                  totalFromPacking ||= Boolean(response.data?.totalFromPacking);
                }
                toast.success("明细已更新");
                return { totalFromPacking };
              } catch (error: unknown) {
                toast.error(errorMessage(error, "明细更新失败"));
                throw error;
              } finally {
                void loadData();
              }
            }}
            onSave={async (data) => {
              try {
                await salesService.update(id, data);
                toast.success("合同信息更新成功");
                void loadData();
              } catch (error: unknown) {
                // A rejected save must reach the editor so it retains the draft.
                toast.error(errorMessage(error, "更新失败"));
                throw error;
              }
            }}
          />
        </TabsContent>

        <TabsContent value="purchases">
          <OrderPurchasesTab contract={contract} />
        </TabsContent>

        <TabsContent value="container">
          <OrderContainerTab
            contract={contract}
            products={products}
            inventories={inventories}
            referenceDataLoading={referenceDataLoading}
            readiness={readiness}
            onRetryPlan={retryPlan}
            itemDialogOpen={itemDialogOpen}
            onItemDialogOpenChange={setItemDialogOpen}
            onImportPurchase={() => setDialog("importPurchase")}
            onChanged={loadData}
          />
        </TabsContent>

        <TabsContent value="docs">
          <OrderDocsTab
            contract={contract}
            files={contractFiles}
            onFilesChange={setContractFiles}
            onResolveHs={() => setDialog("threeForms")}
          />
        </TabsContent>

        {/* 单柜财务结算：仅进入标签时加载，避免阻塞首屏。 */}
        <TabsContent value="receipts" className="space-y-4">
          {canViewFinance && activeTab === "receipts" && (
            <Suspense
              fallback={
                <div className="py-10 text-center text-sm text-muted-foreground">
                  正在汇总财务数据...
                </div>
              }
            >
              <SalesFinancePanel
                salesContractId={contract.id}
                contractNo={contract.contractNo}
                onChanged={loadData}
              />
              <ForexVerificationPanel salesContractId={contract.id} />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="refund">
          {canViewFinance && (
            <OrderRefundTab onOpen={() => setDialog("taxPreparation")} />
          )}
        </TabsContent>
      </Tabs>

      <Suspense fallback={null}>
        {dialog === "threeForms" && (
          <GenerateThreeFormsDialog
            open
            onOpenChange={closeDialog}
            salesContract={contract}
            onGenerated={(results) => {
              if (results.customsDeclarationId) toast.success("报关单已生成");
              if (results.forexId) toast.success("外汇核销单已生成");
              if (results.taxRefundId) toast.success("出口退税单已生成");
            }}
          />
        )}
        {dialog === "exportPacket" && (
          <ExportPacketWorkbenchDialog
            open
            onOpenChange={closeDialog}
            salesContract={contract}
            onGenerated={loadData}
          />
        )}
        {dialog === "packingCheck" && (
          <PackingListCheckDialog
            open
            onOpenChange={closeDialog}
            contractId={contract.id}
            contractNo={contract.contractNo}
            onChanged={loadData}
          />
        )}
        {dialog === "taxPreparation" && (
          <TaxRefundPreparationDialog
            open
            onOpenChange={closeDialog}
            salesContractId={contract.id}
            contractNo={contract.contractNo}
          />
        )}
        {dialog === "importPurchase" && (
          <ImportPurchaseItemsDialog
            open
            onOpenChange={closeDialog}
            salesContractId={contract.id}
            onImported={loadData}
          />
        )}
        {dialog === "purchaseDrafts" && (
          <GeneratePurchaseDraftsDialog
            open
            onOpenChange={closeDialog}
            contract={contract}
            onGenerated={loadData}
          />
        )}
      </Suspense>
    </div>
  );
}
