import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UrlTabs, type UrlTab } from "./url-tabs";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

const tabs: UrlTab[] = [
  { key: "overview", label: "概览", content: <p>概览内容</p> },
  { key: "items", label: "明细", badge: 4, content: <p>明细内容</p> },
  { key: "docs", label: "单证", badge: "dot", content: <p>单证内容</p> },
];

beforeEach(() => window.history.replaceState(null, "", "/dashboard/x"));

describe("UrlTabs", () => {
  it("默认显示第一个页签；URL 里是未知值时也回落到默认", () => {
    window.history.replaceState(null, "", "/dashboard/x?tab=bogus");
    render(<UrlTabs tabs={tabs} />);
    expect(screen.getByText("概览内容")).toBeInTheDocument();
  });

  it("按 ?tab= 打开对应页签", () => {
    window.history.replaceState(null, "", "/dashboard/x?tab=items&q=1");
    render(<UrlTabs tabs={tabs} />);
    expect(screen.getByText("明细内容")).toBeInTheDocument();
  });

  it("徽标：数字计数与红点（有可访问名称）", () => {
    render(<UrlTabs tabs={tabs} />);
    expect(screen.getByRole("tab", { name: /明细/ })).toHaveTextContent("4");
    expect(
      screen.getByRole("img", { name: "单证有待处理项" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "概览有待处理项" })).toBeNull();
  });

  it("切换页签写入 URL 并保留其他参数；回到默认页签则删除 tab", async () => {
    window.history.replaceState(null, "", "/dashboard/x?q=1");
    const user = userEvent.setup();
    render(<UrlTabs tabs={tabs} />);
    await user.click(screen.getByRole("tab", { name: /明细/ }));
    expect(window.location.search).toBe("?q=1&tab=items");
    expect(screen.getByText("明细内容")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /概览/ }));
    expect(window.location.search).toBe("?q=1");
  });

  it("浏览器后退（popstate）同步页签", () => {
    render(<UrlTabs tabs={tabs} />);
    act(() => {
      window.history.replaceState(null, "", "/dashboard/x?tab=docs");
      fireEvent(window, new PopStateEvent("popstate"));
    });
    expect(screen.getByText("单证内容")).toBeInTheDocument();
  });

  it("支持自定义参数名", async () => {
    const user = userEvent.setup();
    render(<UrlTabs tabs={tabs} param="view" />);
    await user.click(screen.getByRole("tab", { name: /明细/ }));
    expect(window.location.search).toBe("?view=items");
  });
});
