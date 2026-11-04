/**
 * Input: 合成的阻塞文案
 * Output: chips 按类型带计数、原文在折叠里可达、blockerReasons 与 chips 一致
 * Pos: BlockerChips 回归
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlockerChips, blockerReasons } from "./BlockerChips";

const blockers = [
  "未关联报关单；报关单未放行",
  "进项发票缺失 2 张",
  "出货日期未登记",
];

describe("BlockerChips", () => {
  it("每个原因类型一个 chip，带计数", () => {
    render(<BlockerChips blockers={blockers} />);
    expect(screen.getByText("报关单 2")).toBeInTheDocument();
    expect(screen.getByText("发票核验 1")).toBeInTheDocument();
    expect(screen.getByText("出货与装箱 1")).toBeInTheDocument();
  });

  it("原文在折叠里仍可达", () => {
    render(<BlockerChips blockers={blockers} />);
    expect(screen.getByText("进项发票缺失 2 张")).toBeInTheDocument();
    expect(screen.getByText("查看原因")).toBeInTheDocument();
  });

  it("blockerReasons 与 chips 类型一致", () => {
    expect(blockerReasons(blockers)).toEqual([
      "报关单",
      "发票核验",
      "出货与装箱",
    ]);
    expect(blockerReasons([])).toEqual([]);
  });
});
