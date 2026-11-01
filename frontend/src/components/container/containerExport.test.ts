/**
 * Input: planSlices 的页高、总高与断点
 * Output: 长表格分页位置的测试结果（C5-05）
 * Pos: containerExport 的纯函数测试；PDF 光栅输出需浏览器，未覆盖
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it } from "vitest";
import { planSlices } from "./containerExport";

describe("planSlices", () => {
  it("一页放得下则只有一个区间", () => {
    expect(planSlices(800, 1000, [100, 400])).toEqual([[0, 800]]);
  });

  it("在页内最后一个行顶边处断开，不切开行", () => {
    expect(planSlices(2000, 1000, [300, 950, 1100, 1900])).toEqual([
      [0, 950],
      [950, 1900],
      [1900, 2000],
    ]);
  });

  it("没有页内断点时硬切，且区间首尾相接、总和等于总高", () => {
    const slices = planSlices(2500, 1000, []);
    expect(slices).toEqual([
      [0, 1000],
      [1000, 2000],
      [2000, 2500],
    ]);
  });
});
