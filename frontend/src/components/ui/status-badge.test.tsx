import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  StatusBadge,
  getStatusBadgeConfig,
  SemanticBadge,
  registerStatusBadgeMap,
} from "./status-badge";

describe("status-badge", () => {
  it("内置状态映射为统一文案和语义色", () => {
    expect(getStatusBadgeConfig(" shipped ")).toEqual({
      label: "已发运",
      tone: "progress",
    });
  });

  it("自定义映射优先于默认映射", () => {
    const custom = registerStatusBadgeMap({
      DRAFT: { label: "草稿(自定义)", tone: "success" },
    });
    expect(getStatusBadgeConfig("draft", custom)).toEqual({
      label: "草稿(自定义)",
      tone: "success",
    });
  });

  it("未知状态回退显示中文「未知状态」，不露出英文原值", () => {
    render(<StatusBadge status="UNKNOWN_STATUS" />);
    const badge = screen.getByText("未知状态");
    expect(badge.className).toContain("bg-muted");
    expect(screen.queryByText("UNKNOWN_STATUS")).toBeNull();
  });

  it("PACKING 显示装箱中文案", () => {
    render(<StatusBadge status="PACKING" />);
    expect(screen.getByText("装箱中")).toBeInTheDocument();
  });

  it("按业务对象取状态表：库存「包装中」为蓝色而非危险色", () => {
    expect(getStatusBadgeConfig("PACKING", {}, "inventory")).toEqual({
      label: "包装中",
      tone: "info",
    });
    expect(getStatusBadgeConfig("PACKING", {}, "salesOrder")).toEqual({
      label: "装柜中",
      tone: "info",
    });
    expect(getStatusBadgeConfig("READY", {}, "purchaseContract")).toEqual({
      label: "生产完成",
      tone: "warning",
    });
    expect(getStatusBadgeConfig("EXPIRED", {}, "quote")).toEqual({
      label: "已过期",
      tone: "warning",
    });
  });

  it("不传 domain 时保持原有默认映射，domain 表里没有的状态回退默认映射", () => {
    expect(getStatusBadgeConfig("PACKING")).toEqual({
      label: "装箱中",
      tone: "warning",
    });
    expect(getStatusBadgeConfig("INBOUND", {}, "quote")).toEqual({
      label: "已入库",
      tone: "secondary",
    });
  });

  it("StatusBadge 接受 domain 并渲染对应文案和配色", () => {
    render(<StatusBadge status="arrived" domain="salesOrder" />);
    const badge = screen.getByText("已到港");
    expect(badge.className).toContain("text-status-amber");
  });
});

describe("SemanticBadge danger", () => {
  it("danger 用红色状态 token 的文字色，不是近白的 destructive-foreground（对比度）", () => {
    render(<SemanticBadge tone="danger">失败</SemanticBadge>);
    const cls = screen.getByText("失败").className;
    expect(cls).toContain("text-status-red");
    expect(cls).toContain("bg-status-red-soft");
    expect(cls).not.toContain("text-destructive-foreground");
  });
});

describe("status glossary (B13)", () => {
  const hasChinese = (text: string) => /[一-鿿]/.test(text);

  it("every purchase status and legacy alias has one Chinese label in the purchase domain", () => {
    for (const status of [
      "DRAFT",
      "SIGNED",
      "PRODUCING",
      "READY",
      "SHIPPED",
      "RECEIVED",
      "COMPLETED",
      "CANCELLED",
      "PENDING_INSPECTION",
      "IN_STOCK",
    ]) {
      const { label } = getStatusBadgeConfig(status, {}, "purchaseContract");
      expect(hasChinese(label), status).toBe(true);
    }
  });

  it("purchases and payables agree: SIGNED is 已签订 with or without the domain", () => {
    expect(getStatusBadgeConfig("SIGNED", {}, "purchaseContract").label).toBe(
      "已签订",
    );
    expect(getStatusBadgeConfig("SIGNED").label).toBe("已签订");
    expect(getStatusBadgeConfig("READY").label).toBe("生产完成");
    expect(getStatusBadgeConfig("RECEIVED").label).toBe("已收货");
  });

  it("an unregistered status never leaks English text", () => {
    expect(getStatusBadgeConfig("SOMETHING_NEW").label).toBe("未知状态");
    expect(getStatusBadgeConfig(undefined).label).toBe("未知状态");
  });
});
