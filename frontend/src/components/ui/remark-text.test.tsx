import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RemarkText } from "./remark-text";

describe("RemarkText", () => {
  it("只显示真实备注，内部标记收进折叠的导入来源", () => {
    const { container } = render(
      <RemarkText note={"先付定金\n[CUSTOMS_XML] d.xml sha256=" + "c".repeat(64)} />,
    );
    expect(screen.getByText(/先付定金/)).toBeTruthy();
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details?.hasAttribute("open")).toBe(false);
    expect(screen.getByText("导入来源")).toBeTruthy();
    // 标记文字只出现在折叠区内，不在可见正文里。
    const body = container.firstElementChild!;
    const visible = Array.from(body.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join("");
    expect(visible).toBe("先付定金");
    expect(details?.textContent).toContain("[CUSTOMS_XML]");
  });

  it("没有备注或只有来源痕迹时显示占位", () => {
    const { container, rerender } = render(<RemarkText note={null} />);
    expect(container.textContent).toBe("-");
    rerender(<RemarkText note="[WPS_EVIDENCE] a.xlsx" fallback="无备注" />);
    expect(container.firstElementChild!.firstChild?.textContent).toBe("无备注");
    expect(container.querySelectorAll("details")).toHaveLength(1);
  });

  it("普通备注没有折叠区", () => {
    const { container } = render(<RemarkText note="客户自提" />);
    expect(container.textContent).toBe("客户自提");
    expect(container.querySelector("details")).toBeNull();
  });
});
