import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DateStringPicker } from "./date-picker";

describe("DateStringPicker", () => {
  it("空值显示中文占位而不是浏览器的 mm/dd/yyyy，且不是原生日期输入", () => {
    const { container } = render(
      <DateStringPicker value="" onChange={vi.fn()} placeholder="开始日期" />,
    );
    expect(screen.getByRole("button", { name: /开始日期/ })).toBeTruthy();
    expect(container.querySelector('input[type="date"]')).toBeNull();
    expect(container.textContent).not.toMatch(/mm\/dd\/yyyy/i);
  });

  it("已有 yyyy-MM-dd 值按本地日期显示，不因时区前移一天", () => {
    render(<DateStringPicker value="2026-03-01" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /2026-03-01/ })).toBeTruthy();
  });

  it("选择日期回传 yyyy-MM-dd 字符串", async () => {
    const onChange = vi.fn();
    render(<DateStringPicker value="2026-03-01" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /2026-03-01/ }));
    const cell = await screen.findByRole("gridcell", { name: "10" });
    // 日期点击事件挂在单元格内的按钮上。
    await userEvent.click(cell.querySelector("button") ?? cell);
    expect(onChange).toHaveBeenCalledWith("2026-03-10");
  });

  it("无法解析的值当作未选择", () => {
    render(
      <DateStringPicker
        value="not-a-date"
        onChange={vi.fn()}
        placeholder="结束日期"
      />,
    );
    expect(screen.getByRole("button", { name: /结束日期/ })).toBeTruthy();
  });
});
