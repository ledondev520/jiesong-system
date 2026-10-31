import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  StatusBadge,
  getStatusBadgeConfig,
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

  it("未知状态回退显示原始文本", () => {
    render(<StatusBadge status="UNKNOWN_STATUS" />);
    const badge = screen.getByText("UNKNOWN_STATUS");
    expect(badge.className).toContain("bg-muted");
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
      label: "待装柜",
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
    expect(badge.className).toContain("text-amber-800");
  });
});
