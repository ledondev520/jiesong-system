/**
 * Input: 库存服务、InventoryTab、ReceivingWorkbench、UrlTabs（?tab=receiving|stock）
 * Output: 库存页两个页签：收货验货（待收货合同队列，侧栏登记到货/验货）与库存（唯一库存视图：店铺筛选、确认后的状态流转）
 * Pos: 库存模块主页面；默认仍打开库存，旧链接不变
 */

"use client";

import { InventoryTab } from "@/app/dashboard/inventory/components/InventoryTab";
import { ReceivingWorkbench } from "@/app/dashboard/inventory/components/ReceivingWorkbench";
import { PageHeader } from "@/components/layout/PageHeader";
import { UrlTabs } from "@/components/ui/url-tabs";

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="库存"
        description="收货验货与库存：登记到货、验货，并按店铺查看入库和出口发运后的库存余量；状态变更需确认。"
      />
      <UrlTabs
        defaultTab="stock"
        tabs={[
          {
            key: "receiving",
            label: "收货验货",
            content: <ReceivingWorkbench />,
          },
          { key: "stock", label: "库存", content: <InventoryTab /> },
        ]}
      />
    </div>
  );
}
