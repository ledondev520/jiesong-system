/**
 * Input: 无
 * Output: 财务 > 应付：已生效采购合同的未付余额（口径来自后端 payablesService）
 * Pos: 取代旧的到收付管理的重定向；旧 /dashboard/payments?tab=payable 重定向到这里
 */
import { Suspense } from "react";
import { ContractBalanceList } from "../components/ContractBalanceList";

export default function PayablePage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <ContractBalanceList kind="payable" />
    </Suspense>
  );
}
