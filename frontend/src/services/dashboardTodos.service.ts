/**
 * Input: 后端 GET /dashboard/todos（按登录角色裁剪的只读待办）
 * Output: 待办列表（总数 + 前 5 条）与 BOSS 三个数字
 * Pos: 首页共享的前端数据 Module；不在前端重算口径
 */

import api, { type ApiRequestConfig } from "@/lib/axios";
import type { ApiResponse } from "@/types";

export type TodoKey =
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
