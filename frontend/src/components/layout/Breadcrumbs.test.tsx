import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumbs } from "./Breadcrumbs";
let path = "/dashboard/reports";
vi.mock("next/navigation", () => ({ usePathname: () => path }));
describe("中文业务面包屑", () => {
  it.each([
    ["/dashboard/reports", "经营执行"],
    ["/dashboard/notifications", "通知中心"],
    ["/dashboard/settings/logs", "操作日志"],
    ["/dashboard/settings/ai-usage", "AI 用量"],
    ["/dashboard/settings/customs-brokers", "报关行"],
  ])("%s使用中文", (pathname, title) => {
    path = pathname;
    render(<Breadcrumbs />);
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
