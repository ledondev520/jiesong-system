/**
 * Input: 无
 * Output: 财务 > 应收：出口订单的未收余额
 * Pos: 取代旧的到收付管理的重定向；待分配收款、对账仍在收付管理页
 */
import { ContractBalanceList } from "../components/ContractBalanceList";

export default function ReceivablePage() {
  return <ContractBalanceList kind="receivable" />;
}
