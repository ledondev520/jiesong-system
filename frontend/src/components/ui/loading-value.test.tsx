import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingValue } from "./loading-value";

describe("LoadingValue", () => {
  it("加载中不显示子内容（不闪 0），并向读屏暴露加载状态", () => {
    const { container } = render(
      <p>
        共 <LoadingValue loading>{0}</LoadingValue> 条
      </p>,
    );
    expect(screen.getByRole("status", { name: "加载中" })).toBeTruthy();
    expect(container.textContent).not.toContain("0");
  });

  it("加载完成后显示真实值，真实的 0 条可见", () => {
    const { container } = render(
      <p>
        共 <LoadingValue loading={false}>{0}</LoadingValue> 条
      </p>,
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.textContent).toBe("共 0 条");
  });
});
