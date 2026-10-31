import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RowActionsMenu } from "./row-actions-menu";

describe("RowActionsMenu", () => {
  it("「更多」里有编辑，点击触发 onEdit", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<RowActionsMenu onEdit={onEdit} onDelete={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "编辑" }));
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("删除先弹确认，未确认前不调用 onDelete；取消后也不调用", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <RowActionsMenu
        onDelete={onDelete}
        deleteLabel="停用"
        confirmTitle="停用港口「深圳港」？"
      />,
    );

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "停用" }));
    expect(await screen.findByText("停用港口「深圳港」？")).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onDelete).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("停用港口「深圳港」？")).toBeNull(),
    );
  });

  it("确认后调用 onDelete 且等它结束再关闭对话框", async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    const onDelete = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<RowActionsMenu onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "删除" }));
    await user.click(await screen.findByRole("button", { name: "确认删除" }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(screen.getByText("确定要删除吗？")).toBeInTheDocument();
    finish();
    await waitFor(() =>
      expect(screen.queryByText("确定要删除吗？")).toBeNull(),
    );
  });

  it("没有 onDelete 时不出现删除项", async () => {
    const user = userEvent.setup();
    render(<RowActionsMenu onEdit={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "更多操作" }));
    await screen.findByRole("menuitem", { name: "编辑" });
    expect(screen.queryByRole("menuitem", { name: "删除" })).toBeNull();
  });
});
