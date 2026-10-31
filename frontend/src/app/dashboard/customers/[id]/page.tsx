/**
 * Input: 路由参数 id；客户详情（含门店）与该客户订单列表
 * Output: 客户信息卡、门店表（新增/编辑/停用）、订单表（链接到订单详情）
 * Pos: 资料 > 客户与门店 > 客户详情；门店写入沿用 /stores 现有角色
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/data-state";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { describeFailure } from "@/lib/error-reason";
import api from "@/lib/axios";
import { customerService } from "@/services/customer.service";
import { storeService } from "@/services/store.service";
import { useAuthStore } from "@/store/auth.store";
import { Role, type ApiResponse, type Customer, type PaginatedResponse, type Store } from "@/types";
import { CustomerDialog } from "../components/CustomerDialog";
import { StoreDialog } from "../components/StoreDialog";

const CUSTOMER_WRITE_ROLES: Role[] = [Role.ADMIN, Role.SALES];
const STORE_WRITE_ROLES: Role[] = [Role.ADMIN, Role.PURCHASE, Role.SALES, Role.FINANCE, Role.WAREHOUSE];
const STATUS_MAP = {
  ACTIVE: { label: "正常", tone: "success" },
  ARCHIVED: { label: "已停用", tone: "neutral" },
} as const;

interface OrderRow {
  id: string;
  contractNo: string;
  status: string;
  totalAmount?: number;
  createdAt?: string;
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const role = useAuthStore((state) => state.user?.role);
  const canEditCustomer = !!role && CUSTOMER_WRITE_ROLES.includes(role);
  const canEditStores = !!role && STORE_WRITE_ROLES.includes(role);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [detail, sales] = await Promise.all([
        customerService.getById(id),
        api.get<ApiResponse<PaginatedResponse<OrderRow>>, ApiResponse<PaginatedResponse<OrderRow>>>(
          "/sales",
          { params: { customerId: id, pageSize: 20, lite: true } },
        ),
      ]);
      setCustomer(detail.data);
      setOrders(sales.data.items);
      setLoadError(null);
    } catch (error) {
      setLoadError(error ?? new Error("加载失败"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const deactivateStore = async (store: Store) => {
    try {
      await storeService.update(store.id, { isActive: !store.isActive });
      toast.success(store.isActive ? "门店已停用" : "门店已恢复");
      await load();
    } catch (error) {
      toast.error(describeFailure("操作失败", error));
    }
  };

  if (loadError) {
    return <ErrorState what="加载客户失败" error={loadError} onRetry={() => void load()} />;
  }

  const stores = customer?.stores ?? [];
  const storeColumns: DataTableColumn<Store>[] = [
    { key: "name", header: "门店", cell: (s) => <span className="font-medium">{s.name}</span>, sortValue: (s) => s.name, hideable: false },
    { key: "code", header: "简称", cell: (s) => s.code || "—" },
    { key: "legalName", header: "经营主体", cell: (s) => s.legalName || "—" },
    { key: "port", header: "目的港", cell: (s) => s.port?.name || "—" },
    { key: "status", header: "状态", cell: (s) => <StatusBadge status={s.isActive ? "ACTIVE" : "ARCHIVED"} statusMap={STATUS_MAP} /> },
  ];
  const orderColumns: DataTableColumn<OrderRow>[] = [
    {
      key: "contractNo",
      header: "订单号",
      cell: (o) => <Link href={`/dashboard/sales/${o.id}`} className="font-medium hover:underline">{o.contractNo}</Link>,
      hideable: false,
    },
    { key: "status", header: "状态", cell: (o) => o.status },
    { key: "totalAmount", header: "金额 (USD)", cell: (o) => (o.totalAmount ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 }) },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title={customer?.name ?? "客户详情"}
        description={customer?.legalName || undefined}
        backHref="/dashboard/customers"
        actions={
          canEditCustomer && customer ? (
            <Button variant="outline" className="h-10 rounded-xl" onClick={() => setEditingCustomer(true)}>
              <Pencil className="mr-2 h-4 w-4" /> 编辑客户
            </Button>
          ) : undefined
        }
      />

      {customer ? (
        <Card>
          <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <Info label="币种 / 贸易术语" value={`${customer.defaultCurrency} · ${customer.defaultIncoterm}`} />
            <Info label="默认付款条件" value={customer.defaultPaymentTerms} />
            <Info label="默认装货港" value={customer.defaultPortOfLoading} />
            <Info label="联系人" value={customer.contactName} />
            <Info label="电话 / 邮箱" value={[customer.contactPhone, customer.contactEmail].filter(Boolean).join(" · ")} />
            <Info label="国家 / 地址" value={[customer.country, customer.address].filter(Boolean).join(" · ")} />
            {!customer.isActive ? <Info label="状态" value="已归档（不能新增门店）" /> : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">门店</CardTitle>
          {canEditStores && customer?.isActive ? (
            <Button size="sm" onClick={() => setEditingStore(null)}>
              <Plus className="mr-1 h-4 w-4" /> 新增门店
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <DataTable
            columns={storeColumns}
            data={stores}
            rowKey={(store) => store.id}
            loading={loading}
            emptyTitle="该客户暂无门店"
            renderActions={
              canEditStores
                ? (store) => (
                    <RowActionsMenu
                      onEdit={() => setEditingStore(store)}
                      onDelete={() => deactivateStore(store)}
                      deleteLabel={store.isActive ? "停用" : "恢复"}
                      confirmTitle={`${store.isActive ? "停用" : "恢复"}门店「${store.name}」？`}
                      confirmDescription="已有订单不受影响。"
                    />
                  )
                : undefined
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近订单</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={orderColumns} data={orders} rowKey={(order) => order.id} loading={loading} emptyTitle="该客户暂无订单" />
        </CardContent>
      </Card>

      {editingCustomer && customer ? (
        <CustomerDialog
          customer={customer}
          onClose={() => setEditingCustomer(false)}
          onSaved={() => {
            setEditingCustomer(false);
            void load();
          }}
        />
      ) : null}
      {editingStore !== undefined && customer ? (
        <StoreDialog
          customerId={customer.id}
          store={editingStore}
          onClose={() => setEditingStore(undefined)}
          onSaved={() => {
            setEditingStore(undefined);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || "—"}</p>
    </div>
  );
}
