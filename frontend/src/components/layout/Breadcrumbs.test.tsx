import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumbs } from "./Breadcrumbs";
let path = "/dashboard/reports";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
describe("中文业务面包屑", () => {
  it.each([
    ["/dashboard/reports", "经营分析"],
    ["/dashboard/finance/analysis", "经营分析"],
    ["/dashboard/notifications", "通知中心"],
    ["/dashboard/settings/logs", "系统日志"],
    ["/dashboard/settings/ai-usage", "AI 用量"],
    ["/dashboard/settings/ai-access", "AI 接入"],
    ["/dashboard/settings/customs-brokers", "报关行"],
    ["/dashboard/orders/x", "出口订单"],
    ["/dashboard/quotes", "报价"],
    ["/dashboard/customers", "客户与门店"],
  ])("%s使用中文", (pathname, title) => {
    path = pathname;
    render(<Breadcrumbs />);
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
