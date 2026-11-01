/**
 * Input: BlockerGroups 与阻塞文案样本
 * Output: 分组/计数、拆分去重、长条目展开、超量分组展开测试
 * Pos: 退税材料准备阻塞清单测试
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BlockerGroups, groupBlockers } from "./BlockerGroups";

describe("groupBlockers", () => {
  it("按类型分组，拆开「；」拼接文案并去重，报关优先于发票", () => {
    const groups = groupBlockers([
      "缺少已放行报关单或出口日期",
      "INV-1：发票销方税号与关联采购合同不一致；INV-2：发票开票日期缺失或无效",
      "螺丝 的报关金额与本次商业发票金额有差异，需核对成交价或运保费依据",
      "本次出货尚未完整关联采购来源",
      "需补外销签署件",
      "缺少已放行报关单或出口日期",
    ]);
    expect(groups.map((g) => [g.label, g.entries.length])).toEqual([
      ["报关单", 2],
      ["发票核验", 2],
      ["出货与装箱", 1],
      ["其他", 1],
    ]);
  });

  it("空输入不产生分组", () => {
    expect(groupBlockers([])).toEqual([]);
    expect(groupBlockers(["", "；"])).toEqual([]);
  });
});

describe("BlockerGroups", () => {
  it("显示分组标题与计数", () => {
    render(
      <BlockerGroups
        blockers={["缺少已放行报关单或出口日期", "尚未登记本次发运"]}
      />,
    );
    const groups = screen.getAllByTestId("blocker-group");
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getByText("报关单")).toBeInTheDocument();
    expect(within(groups[0]).getByText("1")).toBeInTheDocument();
  });

  it("长条目默认截断，可展开看到全文并可收起", async () => {
    const longText = `INV-9：发票${"金额税额与价税合计不一致".repeat(8)}`;
    render(<BlockerGroups blockers={[longText]} />);
    expect(screen.queryByText(longText)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "展开" }));
    expect(screen.getByText(longText, { exact: false })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "收起" }));
    expect(screen.queryByText(longText)).not.toBeInTheDocument();
  });

  it("同组超过 5 项时只先显示 5 项，其余可展开且信息不丢", async () => {
    const entries = Array.from({ length: 8 }, (_, i) => `发票 ${i + 1} 需核对`);
    render(<BlockerGroups blockers={entries} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    await userEvent.click(
      screen.getByRole("button", { name: "显示其余 3 项" }),
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.getByText("发票 8 需核对")).toBeInTheDocument();
  });
});
