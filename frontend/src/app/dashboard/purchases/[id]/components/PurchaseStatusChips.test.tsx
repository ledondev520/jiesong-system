import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PurchaseSubStatus } from "@/types";
import { PurchaseStatusChips } from "./PurchaseStatusChips";

const sub = (over: Partial<PurchaseSubStatus> = {}): PurchaseSubStatus => ({
  payment: "PARTIAL",
  arrival: { state: "NONE", ordered: 2, arrived: 0, registered: false },
  docsComplete: false,
  ...over,
});

describe("PurchaseStatusChips", () => {
  it("合同、付款、到货、资料四个维度各有标签，不混成一行文字", () => {
    render(<PurchaseStatusChips status="SIGNED" subStatus={sub()} />);
    const list = screen.getByRole("list", { name: "合同状态维度" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "合同已签订",
      "付款部分付款",
      "到货未到货 0/2",
      "资料生产资料未齐",
    ]);
  });

  it("资料齐全时明确显示「已齐」，而不是省略这一维", () => {
    render(
      <PurchaseStatusChips
        status="SIGNED"
        subStatus={sub({ docsComplete: true })}
      />,
    );
    expect(screen.getByText("生产资料已齐")).toBeInTheDocument();
  });

  it("草稿没有付款到货义务，只显示合同维度", () => {
    render(<PurchaseStatusChips status="DRAFT" subStatus={sub()} />);
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("合同草稿");
  });

  it("没有 subStatus 时只显示合同，不编造其余维度", () => {
    render(<PurchaseStatusChips status="SIGNED" />);
    expect(
      within(screen.getByRole("list")).getAllByRole("listitem"),
    ).toHaveLength(1);
    expect(screen.queryByText("生产资料已齐")).toBeNull();
  });
});
