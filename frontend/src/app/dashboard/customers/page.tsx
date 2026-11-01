/**
 * Input: 客户 API、列表 URL 状态（关键词、是否含已归档、分页）
 * Output: 客户列表（服务端分页）；新增/编辑/归档（只归档，不删除）
 * Pos: 资料 > 客户与门店
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { listUrlFields, useListUrlState } from "@/lib/hooks/useListUrlState";
import { useLatestRequest } from "@/lib/hooks/useLatestRequest";
import { describeFailure } from "@/lib/error-reason";
import { customerService } from "@/services/customer.service";
import { useAuthStore } from "@/store/auth.store";
import { Role, type Customer } from "@/types";
import { CustomerDialog } from "./components/CustomerDialog";

const WRITE_ROLES: Role[] = [Role.ADMIN, Role.SALES];
const STATUS_MAP = {
  ACTIVE: { label: "正常", tone: "success" },
  ARCHIVED: { label: "已归档", tone: "neutral" },
} as const;

export default function CustomersPage() {
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role);
  const canWrite = !!role && WRITE_ROLES.includes(role);
  const [filters, setFilters] = useListUrlState(listUrlFields.customers);
  const [items, setItems] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [editing, setEditing] = useState<Customer | null | undefined>(
    undefined,
  );
  const includeArchived = filters.archived === "yes";

  const startRequest = useLatestRequest();

  const load = useCallback(async () => {
    const isCurrent = startRequest();
    setLoading(true);
    try {
      const response = await customerService.getAll({
        page: filters.page,
        pageSize: filters.pageSize,
        keyword: filters.keyword || undefined,
        includeArchived: includeArchived || undefined,
      });
      if (!isCurrent()) return;
      setItems(response.data.items);
      setTotal(response.data.pagination.total);
      setLoadError(null);
    } catch (error) {
      if (isCurrent()) setLoadError(error ?? new Error("加载失败"));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [
    startRequest,
    filters.page,
    filters.pageSize,
    filters.keyword,
    includeArchived,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const setArchived = async (customer: Customer, isActive: boolean) => {
    try {
      await customerService.update(customer.id, { isActive });
      toast.success(isActive ? "客户已恢复" : "客户已归档");
      await load();
    } catch (error) {
      toast.error(describeFailure(isActive ? "恢复失败" : "归档失败", error));
    }
  };

  const columns: DataTableColumn<Customer>[] = [
    {
      key: "name",
      header: "客户",
      cell: (customer) => (
        <Link
          href={`/dashboard/customers/${customer.id}`}
          className="font-medium hover:underline"
        >
          {customer.name}
        </Link>
      ),
      sortValue: (customer) => customer.name,
      hideable: false,
    },
    { key: "legalName", header: "公司全称", cell: (c) => c.legalName || "—" },
    {
      key: "terms",
      header: "默认条款",
      cell: (c) => `${c.defaultCurrency} · ${c.defaultIncoterm}`,
    },
    {
      key: "stores",
      header: "门店数",
      cell: (c) => c._count?.stores ?? 0,
      sortValue: (c) => c._count?.stores ?? 0,
    },
    {
      key: "status",
      header: "状态",
      cell: (c) => (
        <StatusBadge
          status={c.isActive ? "ACTIVE" : "ARCHIVED"}
          statusMap={STATUS_MAP}
        />
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="客户与门店"
        description="维护买方客户及其门店（收货点）；客户只归档，不删除"
        actions={
          canWrite ? (
            <Button
              onClick={() => setEditing(null)}
              className="h-10 rounded-xl"
            >
              <Plus className="mr-2 h-4 w-4" /> 新增客户
            </Button>
          ) : undefined
        }
      />

      <DataTable
        renderCard={(customer) => (
          <Link href={`/dashboard/customers/${customer.id}`}>
            <Card className="border-border/70">
              <CardContent className="space-y-1 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold">{customer.name}</p>
                  <StatusBadge
                    status={customer.isActive ? "ACTIVE" : "ARCHIVED"}
                    statusMap={STATUS_MAP}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {customer.defaultCurrency} · {customer.defaultIncoterm} ·{" "}
                  {customer._count?.stores ?? 0} 家门店
                </p>
              </CardContent>
            </Card>
          </Link>
        )}
        columns={columns}
        data={items}
        rowKey={(customer) => customer.id}
        loading={loading}
        error={loadError}
        errorWhat="加载客户失败"
        onRetry={() => void load()}
        emptyTitle={filters.keyword ? "没有符合条件的客户" : "暂无客户"}
        emptyDescription={
          filters.keyword ? undefined : "先新增客户，再在客户下添加门店"
        }
        onRowClick={(customer) =>
          router.push(`/dashboard/customers/${customer.id}`)
        }
        search={{
          value: filters.keyword,
          onChange: (keyword) => setFilters({ keyword }),
          placeholder: "搜索客户名称或公司全称...",
        }}
        filters={[
          {
            key: "archived",
            label: "含已归档",
            active: includeArchived,
            onToggle: () =>
              setFilters({ archived: includeArchived ? "no" : "yes" }),
          },
        ]}
        pagination={{
          page: filters.page,
          pageSize: filters.pageSize,
          total,
          onPageChange: (page) => setFilters({ page }),
          onPageSizeChange: (pageSize) => setFilters({ pageSize }),
        }}
        renderActions={
          canWrite
            ? (customer) => (
                <RowActionsMenu
                  onEdit={() => setEditing(customer)}
                  onDelete={() => setArchived(customer, !customer.isActive)}
                  deleteLabel={customer.isActive ? "归档" : "恢复"}
                  confirmTitle={`${customer.isActive ? "归档" : "恢复"}客户「${customer.name}」？`}
                  confirmDescription={
                    customer.isActive
                      ? "归档后不能再为其新增门店，已有订单和门店保留。"
                      : "恢复后可继续新增门店和订单。"
                  }
                />
              )
            : undefined
        }
      />

      {editing !== undefined ? (
        <CustomerDialog
          customer={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
