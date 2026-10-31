/**
 * Input: 无
 * Output: 财务 > 应收：待分配收款池（记录到账、自动匹配、分配）+ 出口订单的未收余额
 * Pos: 取代旧的到收付管理的重定向；旧 /dashboard/payments?tab=receivable 重定向到这里
 */
"use client";

import { Suspense, useState } from "react";
import { ContractBalanceList } from "../components/ContractBalanceList";
import { UnallocatedReceiptsPanel } from "../components/UnallocatedReceiptsPanel";

export default function ReceivablePage() {
  // 分配/自动匹配成功后递增，通知合同列表和合计重新读取
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-5">
      <UnallocatedReceiptsPanel onChanged={() => setRefreshKey((key) => key + 1)} />
      <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
        <ContractBalanceList kind="receivable" refreshKey={refreshKey} />
      </Suspense>
    </div>
  );
}
