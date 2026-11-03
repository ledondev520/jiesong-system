import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpiCard } from "./KpiCard";

describe("KpiCard 加载与缺失语义", () => {
  it("loading 显示骨架，不显示 0 或「—」，副标签与趋势也不显示", () => {
    render(
      <KpiCard
        label="应付"
        value="¥0"
        loading
        subLabel="已付 ¥0"
        trendValue="+1%"
      />,
    );
    expect(screen.getByRole("status", { name: "加载中" })).toBeInTheDocument();
    expect(screen.queryByText("¥0")).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
    expect(screen.queryByText("已付 ¥0")).toBeNull();
    expect(screen.queryByText("+1%")).toBeNull();
    expect(screen.getByText("应付")).toBeInTheDocument();
  });

  it("加载完成但值缺失（null/undefined）显示「—」，不是 0", () => {
    const { rerender } = render(<KpiCard label="应收" value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    rerender(<KpiCard label="应收" value={undefined} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("0")).toBeNull();
  });

  it("真实的 0 值照常显示", () => {
    render(<KpiCard label="应收" value="0" />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
