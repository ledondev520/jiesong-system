/**
 * Input: URL view 参数（workbench / customs / refunds）
 * Output: 单证与退税页：退税工作台、报关单、退税记录三个页签
 * Pos: /dashboard/customs，旧 /dashboard/tax-refunds 与 /dashboard/customs-declarations 列表由重定向 stub 指向这里
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { Suspense } from 'react';
import { TaxRefundListPageContent } from '@/app/dashboard/tax-refunds/components/TaxRefundListPageContent';

export default function CustomsDashboardPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <TaxRefundListPageContent />
    </Suspense>
  );
}
