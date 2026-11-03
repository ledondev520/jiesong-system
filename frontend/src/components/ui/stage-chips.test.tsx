import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StageChips } from "./stage-chips";

const stages = [
  { key: "all", label: "全部", count: 12 },
  { key: "pending", label: "待验货", count: 0 },
  { key: "done", label: "已入库", count: null },
];

describe("StageChips", () => {
  it("显示计数；真实 0 显示 0，缺失显示「—」", () => {
    render(<StageChips stages={stages} value="all" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "全部12" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "待验货0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已入库—" })).toBeInTheDocument();
  });

  it("加载中所有计数显示「—」，不显示 0", () => {
    render(
      <StageChips stages={stages} value="all" onChange={() => {}} loading />,
    );
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByText("12")).toBeNull();
  });

  it("当前阶段 aria-pressed，点击其他阶段回调 key", () => {
    const onChange = vi.fn();
    render(<StageChips stages={stages} value="all" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "全部12" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "待验货0" }));
    expect(onChange).toHaveBeenCalledWith("pending");
  });
});
