/**
 * Input: 合同状态与后端 subStatus 的各种组合
 * Output: 「已完成」但未付款/未登记到货/资料不全的合同，必须显示对应的子状态徽章
 * Pos: PurchaseSubStatus 展示测试
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PurchaseSubStatus as SubStatus } from "@/types";
import { PurchaseSubStatus, getSubStatusBadges } from "./PurchaseSubStatus";

const sub = (patch: Partial<SubStatus> = {}): SubStatus => ({
  payment: "PAID",
  arrival: { state: "FULL", ordered: 50, arrived: 50, registered: true },
  docsComplete: true,
  ...patch,
});

describe("PurchaseSubStatus", () => {
  it("COMPLETED with nothing paid, no arrival and incomplete docs cannot look settled", () => {
    const badges = getSubStatusBadges(
      "COMPLETED",
      sub({
        payment: "UNPAID",
        arrival: { state: "NONE", ordered: 50, arrived: 0, registered: false },
        docsComplete: false,
      }),
    ).map((badge) => badge.label);
    expect(badges).toEqual(["未付款", "到货未登记 0/50", "生产资料未齐"]);
  });

  it("a fully settled contract shows green paid and arrived badges only", () => {
    const badges = getSubStatusBadges("COMPLETED", sub());
    expect(badges.map((b) => b.label)).toEqual(["已付清", "已到货"]);
    expect(badges.every((b) => b.tone === "success")).toBe(true);
  });

  it("before receipt, no arrival reads 未到货 and partial reads 部分到货", () => {
    expect(
      getSubStatusBadges(
        "SHIPPED",
        sub({
          payment: "PARTIAL",
          arrival: {
            state: "NONE",
            ordered: 10,
            arrived: 0,
            registered: false,
          },
        }),
      ).map((b) => b.label),
    ).toEqual(["部分付款", "未到货 0/10"]);
    expect(
      getSubStatusBadges(
        "SHIPPED",
        sub({
          arrival: {
            state: "PARTIAL",
            ordered: 10,
            arrived: 4,
            registered: true,
          },
        }),
      ).map((b) => b.label),
    ).toContain("部分到货 4/10");
  });

  it("draft, cancelled and missing sub-status render nothing", () => {
    expect(getSubStatusBadges("DRAFT", sub())).toEqual([]);
    expect(getSubStatusBadges("CANCELLED", sub())).toEqual([]);
    expect(getSubStatusBadges("COMPLETED", undefined)).toEqual([]);
    const { container } = render(<PurchaseSubStatus status="DRAFT" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders Chinese labels in the DOM", () => {
    render(
      <PurchaseSubStatus
        status="COMPLETED"
        subStatus={sub({ payment: "UNPAID" })}
      />,
    );
    expect(screen.getByText("未付款")).toBeInTheDocument();
  });
});
