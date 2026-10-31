/**
 * Input: 财务报表服务数据
 * Output: 财务报表独立页面（页内页签：总览 / 资产负债表 / 利润表 / 现金流 / 明细账 / 资料库，?view=）
 * Pos: 财务模块顶层 Tab，承载月度会计报表导入、账期选择和报表分析
 */

import { Suspense } from 'react';
import { FinancialStatementsPageContent } from './components/FinancialStatementsPageContent';

export default function FinancialStatementsPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <FinancialStatementsPageContent />
    </Suspense>
  );
}
