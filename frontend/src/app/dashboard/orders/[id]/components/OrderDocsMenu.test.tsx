/**
 * Input: 各角色的 OrderDocsMenu
 * Output: 钉住 ROLE_ACTIONS：PURCHASE 无报关单草稿（OD-1）、WAREHOUSE 仅报关草稿/装箱核对、角色未知时不显示任何动作
 * Pos: 出口订单「单证」菜单测试
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OrderDocsMenu } from "./OrderDocsMenu";

const LABELS = {
  exportPacket: "生成出口单证（外销合同 / 商业发票 / 装箱单）",
  customsDraft: "报关单草稿",
  packingCheck: "船司装箱单核对",
  exportWorkbook: "导出出口工作簿",
  threeForms: "申报三表（报关 / 核销 / 退税）",
};

const visibleFor = async (role?: string) => {
  render(<OrderDocsMenu onSelect={vi.fn()} role={role} />);
  await userEvent.click(screen.getByRole("button", { name: /单证/ }));
  return Object.entries(LABELS)
    .filter(([, label]) => screen.queryByText(label))
    .map(([action]) => action);
};

describe("OrderDocsMenu ROLE_ACTIONS", () => {
  it("PURCHASE 没有报关单草稿（OD-1）", async () => {
    expect(await visibleFor("PURCHASE")).toEqual(["packingCheck", "exportWorkbook"]);
  });

  it("WAREHOUSE 只有报关单草稿与装箱核对", async () => {
    expect(await visibleFor("WAREHOUSE")).toEqual(["customsDraft", "packingCheck"]);
  });

  it.each(["ADMIN", "SALES", "FINANCE"])("%s 看到全部动作", async (role) => {
    expect(await visibleFor(role)).toEqual(Object.keys(LABELS));
  });

  it("角色未知时不显示任何动作", async () => {
    expect(await visibleFor(undefined)).toEqual([]);
  });
});
