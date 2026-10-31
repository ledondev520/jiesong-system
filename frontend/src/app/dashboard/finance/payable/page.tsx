/**
 * Input: 无
 * Output: 财务 > 应付：已生效采购合同的未付余额（口径来自后端 payablesService）
 * Pos: 取代旧的到收付管理的重定向；收付管理页仍保留对账与待分配收款等功能
 */
import { ContractBalanceList } from "../components/ContractBalanceList";

export default function PayablePage() {
  return <ContractBalanceList kind="payable" />;
}
