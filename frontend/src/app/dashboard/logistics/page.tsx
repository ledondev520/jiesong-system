/**
 * Input: 库存服务、InventoryTab 组件
 * Output: 仓储物流首页（库存总览）
 * Pos: 仓储物流模块入口，集中展示库存状态
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';


import { InventoryTab } from '@/app/dashboard/products/components/InventoryTab';
import { ModuleTabHeader, LOGISTICS_TABS } from '@/components/layout/ModuleTabHeader';
import { PageHeader } from '@/components/layout/PageHeader';

export default function LogisticsPage() {
  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={LOGISTICS_TABS} moduleName="仓储物流" />
      <PageHeader
        title="库存总览"
        description="查看和管理所有库存状态，支持批量状态流转。"
      />
      <InventoryTab />
    </div>
  );
}
