import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError } }));
import { RecordHeader } from "./RecordHeader";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

describe("RecordHeader", () => {
  it("单号用等宽字体，事实 chips 缺失值显示「—」", () => {
    render(
      <RecordHeader
        number="SC-2026-001"
        facts={[
          { label: "客户", value: "Seapot" },
          { label: "金额", value: null },
          { label: "件数", value: 0 },
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "SC-2026-001" })).toHaveClass(
      "font-mono",
    );
    expect(screen.getByText("客户").nextSibling).toHaveTextContent("Seapot");
    expect(screen.getByText("金额").nextSibling).toHaveTextContent("—");
    expect(screen.getByText("件数").nextSibling).toHaveTextContent("0");
  });

  it("渲染状态与唯一主操作", () => {
    render(
      <RecordHeader
        number="N1"
        status={<span>已签订</span>}
        primaryAction={<button>登记发运</button>}
      />,
    );
    expect(screen.getByText("已签订")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "登记发运" }),
    ).toBeInTheDocument();
  });

  it("没有菜单项时不渲染「单证」「更多」", () => {
    render(<RecordHeader number="N1" />);
    expect(screen.queryByRole("button", { name: /单证|更多/ })).toBeNull();
  });

  it("阻塞条显示原因，「去处理」触发回调", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <RecordHeader
        number="N1"
        blocker={{ reason: "有 2 批货未验货", actionLabel: "去处理", onAction }}
      />,
    );
    // 阻塞提示是持续状态，不是事件：role=status，不能是 alert
    expect(screen.queryByRole("alert")).toBeNull();
    const alert = screen.getByRole("status");
    expect(alert).toHaveTextContent("有 2 批货未验货");
    await user.click(within(alert).getByRole("button", { name: "去处理" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("单证菜单项直接执行", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <RecordHeader
        number="N1"
        documentsMenu={[{ key: "pi", label: "导出 PI", onSelect }]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "单证" }));
    await user.click(await screen.findByRole("menuitem", { name: "导出 PI" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("破坏性操作在「更多」里，先确认；取消不执行，确认才执行", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <RecordHeader
        number="N1"
        moreMenu={[
          {
            key: "del",
            label: "作废",
            destructive: true,
            confirmTitle: "作废合同 N1？",
            onSelect,
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "更多" }));
    await user.click(await screen.findByRole("menuitem", { name: "作废" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(await screen.findByText("作废合同 N1？")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onSelect).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "更多" }));
    await user.click(await screen.findByRole("menuitem", { name: "作废" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "作废" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("破坏性操作传进「单证」会被丢弃", () => {
    render(
      <RecordHeader
        number="N1"
        documentsMenu={[
          { key: "del", label: "删除", destructive: true, onSelect: vi.fn() },
        ]}
      />,
    );
    expect(screen.queryByRole("button", { name: "单证" })).toBeNull();
  });

  it("菜单项 onSelect 被拒绝时弹出错误，不静默吞掉", async () => {
    toastError.mockClear();
    const user = userEvent.setup();
    render(
      <RecordHeader
        number="N1"
        documentsMenu={[
          {
            key: "pdf",
            label: "导出 PDF",
            onSelect: () => Promise.reject(new Error("导出失败：服务不可用")),
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "单证" }));
    await user.click(await screen.findByRole("menuitem", { name: "导出 PDF" }));
    expect(toastError).toHaveBeenCalledWith("导出失败：服务不可用");
  });

  it("菜单项同步抛错同样提示，无错误信息时用兜底文案", async () => {
    toastError.mockClear();
    const user = userEvent.setup();
    render(
      <RecordHeader
        number="N1"
        documentsMenu={[
          {
            key: "x",
            label: "查看",
            onSelect: () => {
              throw "boom";
            },
          },
        ]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "单证" }));
    await user.click(await screen.findByRole("menuitem", { name: "查看" }));
    expect(toastError).toHaveBeenCalledWith("操作失败，请重试");
  });
});
