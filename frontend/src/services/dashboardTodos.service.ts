/**
 * Input: 后端 GET /dashboard/todos（按登录角色裁剪的只读待办）
 * Output: 待办列表（总数 + 前 5 条）与 BOSS 三个数字
 * Pos: 首页共享的前端数据 Module；不在前端重算口径
 */

import api, { type ApiRequestConfig } from "@/lib/axios";
import type { ApiResponse } from "@/types";

export type TodoKey =
  | "quotesToSend"
  | "quotesAwaitingCustomer"
  | "ordersToPurchase"
  | "paymentsDue"
  | "receiptsToInspect"
  | "toLoad"
  | "toShip"
  | "missingInvoice"
  | "overdueReceivables"
  | "refundable";

export interface TodoItem {
  id: string;
  contractNo: string;
  party: string | null;
  amount: number | null;
  date: string | null;
}

export interface TodoList {
  label: string;
  count: number;
  items: TodoItem[];
  /** 仅「待付款/缺进项发票」：签约早于 before 的历史合同不计入 count。 */
  historical?: { count: number; before: string };
  /** 仅「可申报退税」：count 为材料核验通过数，pending 为退税工作台「待处理出口」总数（同一汇总）。 */
  pending?: { count: number; label: string };
}

export interface BossFigures {
  receivable: number;
  payable: number;
  monthGrossProfit: number | null;
  definitions: {
    receivable: string;
    payable: string;
    monthGrossProfit: string;
  };
}

export interface DashboardTodos {
  role: string;
  lists: Partial<Record<TodoKey, TodoList>>;
  figures?: BossFigures;
}

export const dashboardTodosService = {
  // 待办是实时视图：显式禁用客户端 GET 缓存。
  get: () =>
    api.get<ApiResponse<DashboardTodos>, ApiResponse<DashboardTodos>>(
      "/dashboard/todos",
      { cache: { enabled: false } } as ApiRequestConfig,
    ),
};
