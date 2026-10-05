/**
 * Input: 报关单 ID、报关单服务、router、SortableTableHead、useTableSort
 * Output: 报关单详情页（手机商品卡片与桌面可排序明细表）
 * Pos: 报关单管理详情展示页
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CustomsDeclaration, CustomsDeclarationItem } from "@/types";
import { customsDeclarationService } from "@/services/customsDeclaration.service";
import { MobileListCard } from "@/components/mobile";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  ModuleTabHeader,
  EXPORT_TABS,
} from "@/components/layout/ModuleTabHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/lib/hooks/useTableSort";
import { FilePenLine } from "lucide-react";
import { toast } from "sonner";
import { CustomsDeclarationStatusBadge } from "./CustomsDeclarationStatusBadge";

interface CustomsDeclarationDetailPageContentProps {
  params: Promise<{ id: string }>;
}

const detailFields = (declaration: CustomsDeclaration) => [
  { label: "报关行", value: declaration.customsBroker || "-" },
  { label: "申报日期", value: declaration.declaredAt?.slice(0, 10) || "-" },
  { label: "出口日期", value: declaration.exportDate?.slice(0, 10) || "-" },
  { label: "成交币种", value: declaration.currency },
];

export function CustomsDeclarationDetailPageContent({
  params,
}: CustomsDeclarationDetailPageContentProps) {
  const { id } = use(params);
  const router = useRouter();

  const [declaration, setDeclaration] = useState<CustomsDeclaration | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDeclaration = async () => {
      setLoading(true);
      try {
        const response = await customsDeclarationService.getById(id);
        setDeclaration(response?.data || null);
      } catch {
        toast.error("加载报关单详情失败");
      } finally {
        setLoading(false);
      }
    };

    void loadDeclaration();
  }, [id]);

  const customsLineItems = useMemo(
    () => declaration?.items ?? [],
    [declaration?.items],
  );

  /**
   * 职责：报关明细行排序取值
   */
  const customsLineAccessor = useCallback(
    (item: CustomsDeclarationItem, key: string) => {
      switch (key) {
        case "productName":
          return item.customsName || item.productName || "-";
        case "hsCode":
          return item.hsCode;
        case "quantity":
          return item.quantity;
        case "unit":
          return item.unit || "";
        case "unitPrice":
          return item.unitPrice ?? null;
        case "totalPrice":
          return item.totalPrice ?? null;
        default:
          return null;
      }
    },
    [],
  );

  const customsLineSort = useTableSort(customsLineItems, customsLineAccessor);

  if (loading) {
    return (
      <div className="py-14 text-center text-muted-foreground">加载中...</div>
    );
  }

  if (!declaration) {
    return (
      <div className="py-14 text-center text-muted-foreground">
        报关单不存在
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />
      <PageHeader
        title={declaration.declarationNo}
        description={declaration.customsBroker || "未填写报关行"}
        backHref="/dashboard/tax-refunds?view=customs"
        actions={
          <>
            <CustomsDeclarationStatusBadge status={declaration.status} />
            <BusinessWrite>
              <Button
                className="rounded-xl"
                onClick={() =>
                  router.push(
                    `/dashboard/customs-declarations/${declaration.id}/edit`,
                  )
                }
              >
                <FilePenLine className="mr-2 h-4 w-4" />
                编辑报关单
              </Button>
            </BusinessWrite>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              货值总额
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {declaration.currency}{" "}
            {(declaration.totalAmount ?? 0).toLocaleString()}
          </CardContent>
        </Card>
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              申报总数量
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {(declaration.totalQuantity ?? 0).toLocaleString()}
          </CardContent>
        </Card>
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              毛重
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {(declaration.totalGrossWeight ?? 0).toLocaleString()} kg
          </CardContent>
        </Card>
        <Card className="surface-panel">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              净重
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {(declaration.totalNetWeight ?? 0).toLocaleString()} kg
          </CardContent>
        </Card>
      </div>

      <Card className="surface-panel">
        <CardHeader>
          <CardTitle>单证摘要</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {detailFields(declaration).map((field) => (
            <div key={field.label} className="space-y-1">
              <div className="text-sm text-muted-foreground">{field.label}</div>
              <div className="break-words font-medium">{field.value}</div>
            </div>
          ))}
          <div className="space-y-1 md:col-span-2 xl:col-span-3">
            <div className="text-sm text-muted-foreground">备注</div>
            <div className="whitespace-pre-wrap break-words font-medium">
              {declaration.note || "-"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="surface-panel overflow-hidden">
        <CardHeader>
          <CardTitle>商品明细</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="space-y-3 px-4 md:hidden">
            {customsLineSort.sortedData.length ? (
              customsLineSort.sortedData.map((item, index) => (
                <MobileListCard
                  key={
                    item.id ||
                    `${item.customsName || item.productName || "-"}-${index}`
                  }
                  title={item.customsName || item.productName || "-"}
                  subtitle={`HS ${item.hsCode}`}
                  fields={[
                    {
                      label: "数量",
                      value: `${item.quantity.toLocaleString()} ${item.unit || ""}`,
                    },
                    { label: "单价", value: item.unitPrice ?? "-" },
                  ]}
                  amount={{
                    label: "总价",
                    value: `${declaration.currency} ${item.totalPrice ?? "-"}`,
                  }}
                />
              ))
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                暂无商品明细。
              </p>
            )}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    sortKey="productName"
                    currentSortKey={customsLineSort.sortKey}
                    currentSortDir={customsLineSort.sortDir}
                    onSort={customsLineSort.onSort}
                  >
                    商品名称
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="hsCode"
                    currentSortKey={customsLineSort.sortKey}
                    currentSortDir={customsLineSort.sortDir}
                    onSort={customsLineSort.onSort}
                  >
                    HS 编码
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="quantity"
                    currentSortKey={customsLineSort.sortKey}
                    currentSortDir={customsLineSort.sortDir}
                    onSort={customsLineSort.onSort}
                    className="text-right"
                  >
                    数量
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="unit"
                    currentSortKey={customsLineSort.sortKey}
                    currentSortDir={customsLineSort.sortDir}
                    onSort={customsLineSort.onSort}
                  >
                    单位
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="unitPrice"
                    currentSortKey={customsLineSort.sortKey}
                    currentSortDir={customsLineSort.sortDir}
                    onSort={customsLineSort.onSort}
                    className="text-right"
                  >
                    单价
                  </SortableTableHead>
                  <SortableTableHead
                    sortKey="totalPrice"
                    currentSortKey={customsLineSort.sortKey}
                    currentSortDir={customsLineSort.sortDir}
                    onSort={customsLineSort.onSort}
                    className="text-right"
                  >
                    总价
                  </SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customsLineSort.sortedData.length ? (
                  customsLineSort.sortedData.map((item, index) => (
                    <TableRow
                      key={
                        item.id ||
                        `${item.customsName || item.productName || "-"}-${index}`
                      }
                    >
                      <TableCell className="font-medium">
                        {item.customsName || item.productName || "-"}
                      </TableCell>
                      <TableCell>{item.hsCode}</TableCell>
                      <TableCell className="text-right">
                        {item.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell>{item.unit || "-"}</TableCell>
                      <TableCell className="text-right">
                        {item.unitPrice ?? "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.totalPrice ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-muted-foreground"
                    >
                      暂无商品明细。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
