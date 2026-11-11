/**
 * Input: planSlices 的页高、总高与断点；collectBreaks 的 DOM（以 data-top 桩出位置）
 * Output: 长表格分页位置的测试结果（C5-05），含「表头不单独成页」
 * Pos: containerExport 的纯函数测试；PDF 光栅输出需浏览器，未覆盖
 */

import { describe, expect, it, vi } from "vitest";
import { collectBreaks, planSlices } from "./containerExport";

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

describe("collectBreaks", () => {
  // jsdom 无排版：用 data-top 桩出 getBoundingClientRect().top。
  const rowsHtml = (tops: number[]) =>
    tops.map((t) => `<tr data-top="${t}"><td>x</td></tr>`).join("");
  const build = () => {
    const root = document.createElement("section");
    root.dataset.top = "0";
    root.innerHTML = `
      <div data-pdf-block data-top="100"><h3>装货顺序</h3>
        <table><thead><tr data-top="124"><th>步骤</th></tr></thead>
        <tbody>${rowsHtml([150, 180, 210])}</tbody></table></div>`;
    return root;
  };

  it("表体第一行不是断点，避免标题+表头单独留在上一页", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        return { top: Number((this as HTMLElement).dataset.top) } as DOMRect;
      },
    );
    const breaks = collectBreaks(build());
    expect(breaks).toEqual([100, 180, 210]);
    vi.restoreAllMocks();
  });

  it("页底恰在表头与首行之间时，整张表移到下一页而不留空表头", () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        return { top: Number((this as HTMLElement).dataset.top) } as DOMRect;
      },
    );
    // 页高 160：表块顶 100 之后最近的断点是 100 本身，表头(124)与首行(150)都不能做断点。
    const slices = planSlices(300, 160, collectBreaks(build()));
    expect(slices[0]).toEqual([0, 100]);
    vi.restoreAllMocks();
  });
});
