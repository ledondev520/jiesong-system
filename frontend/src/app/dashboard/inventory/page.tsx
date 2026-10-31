/**
 * Input: 库存服务、InventoryTab 组件
 * Output: 库存页（唯一库存视图：店铺筛选、确认后的状态流转）
 * Pos: 库存模块主页面，集中展示采购入库、发运后剩余库存与状态流转
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { InventoryTab } from "@/app/dashboard/inventory/components/InventoryTab";
import { PageHeader } from "@/components/layout/PageHeader";

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="库存"
        description="按店铺查看采购入库、出口发运后的库存余量；状态变更需确认。"
      />
      <InventoryTab />
    </div>
  );
}
