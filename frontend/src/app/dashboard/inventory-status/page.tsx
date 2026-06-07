/**
 * Input: 库存服务、InventoryTab 组件
 * Output: 采购模块库存状态页面
 * Pos: 采购模块子页面，集中展示采购入库、发运后剩余库存与状态流转
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { InventoryTab } from '@/app/dashboard/products/components/InventoryTab';
import { ModuleTabHeader, PROCUREMENT_TABS } from '@/components/layout/ModuleTabHeader';
import { PageHeader } from '@/components/layout/PageHeader';

export default function InventoryStatusPage() {
  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={PROCUREMENT_TABS} moduleName="采购" />
      <PageHeader
        title="库存状态"
        description="查看采购入库、出口发运后的库存余量与状态流转。"
      />
      <InventoryTab />
    </div>
  );
}
