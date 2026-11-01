/**
 * Input: TodoBoard 与带 historical 的待办数据
 * Output: 历史未计入提示及完整列表入口的测试结果
 * Pos: 首页待办展示层测试
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TodoBoard } from "./TodoBoard";
import type { DashboardTodos } from "@/services/dashboardTodos.service";

const todos = (historicalCount: number): DashboardTodos => ({
  role: "FINANCE",
  lists: {
    paymentsDue: {
      label: "待付款",
      count: 10,
      items: [],
      historical: { count: historicalCount, before: "2026-01-01" },
    },
  },
});

describe("TodoBoard historical note", () => {
  it("shows the uncounted historical total with a link to the full list", () => {
    render(<TodoBoard todos={todos(88)} />);
    expect(screen.getByText(/另有 88 条/)).toHaveTextContent("2026 年前的历史记录未计入");
    expect(screen.getByRole("link", { name: "查看完整列表" })).toHaveAttribute(
      "href",
      "/dashboard/payments?tab=payable",
    );
  });

  it("hides the note when nothing is excluded", () => {
    render(<TodoBoard todos={todos(0)} />);
    expect(screen.queryByText(/历史记录未计入/)).toBeNull();
  });
});
