import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KpiStat } from "./kpi-stat";

describe("KpiStat", () => {
  it("加载显示骨架，不显示 0 或「—」", () => {
    render(<KpiStat label="应付" value="¥0" loading subLabel="已付 ¥0" />);
    expect(screen.getByRole("status", { name: "加载中" })).toBeInTheDocument();
    expect(screen.queryByText("¥0")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("值缺失显示「—」，真实 0 照常显示", () => {
    const { rerender } = render(<KpiStat label="应收" value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    rerender(<KpiStat label="应收" value="0" />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("静态卡：没有悬浮上浮或阴影，也不是按钮", () => {
    const { container } = render(<KpiStat label="应收" value="1" />);
    expect(screen.queryByRole("button")).toBeNull();
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).not.toMatch(/hover:|translate|shadow|kpi-card/);
  });

  it("传 onClick 后整张卡是筛选按钮，active 同步 aria-pressed", () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <KpiStat label="待收货" value="3" onClick={onClick} />,
    );
    const button = screen.getByRole("button", { name: /待收货/ });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<KpiStat label="待收货" value="3" onClick={onClick} active />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("趋势徽标只在加载完成后显示", () => {
    const { rerender } = render(
      <KpiStat label="收入" value="1" trend="up" trendValue="+5%" loading />,
    );
    expect(screen.queryByText("+5%")).toBeNull();
    rerender(<KpiStat label="收入" value="1" trend="up" trendValue="+5%" />);
    expect(screen.getByText("+5%")).toBeInTheDocument();
  });
});
