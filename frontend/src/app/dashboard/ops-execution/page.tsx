/**
 * Input: UnshippedListTab、PurchaseChecklistTab 子组件
 * Output: 经营执行中台页面（两个子Tab的统一入口）
 * Pos: 经营中台模块下的经营执行子页面，负责布局与Tab切换
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { ClipboardList, PackageSearch } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, OPERATIONS_TABS } from '@/components/layout/ModuleTabHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UnshippedListTab } from './components/UnshippedListTab';
import { PurchaseChecklistTab } from './components/PurchaseChecklistTab';

/**
 * 职责：渲染经营执行中台布局，将未发货清单与门店采购清单分Tab展示
 */
export default function OpsExecutionPage() {
  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={OPERATIONS_TABS} moduleName="经营中台" />
      <PageHeader
        title="经营执行中台"
        description="统一承接门店采购清单与未发货分发。"
      />

      <Tabs defaultValue="unshipped" className="space-y-6">
        <TabsList className="border bg-background">
          <TabsTrigger value="unshipped" className="gap-2">
            <PackageSearch className="h-4 w-4" />
            未发货清单
          </TabsTrigger>
          <TabsTrigger value="purchase-checklist" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            门店采购清单
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unshipped">
          <UnshippedListTab />
        </TabsContent>

        <TabsContent value="purchase-checklist">
          <PurchaseChecklistTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
