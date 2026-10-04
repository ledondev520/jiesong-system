import { expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UserDialog } from "./UserDialog";
import { Role, type User } from "@/types";
it("管理员可在共享编辑弹窗开通待审核邮箱账号", async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  render(
    <UserDialog
      open
      onOpenChange={() => {}}
      onSubmit={submit}
      user={
        {
          id: "pending",
          username: "long.email.registration@example.com",
          name: "待审核用户",
          role: Role.SALES,
          isActive: false,
        } as User
      }
    />,
  );
  const toggle = screen.getByRole("switch", { name: "账号开通" });
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true, role: Role.SALES }),
    ),
  );
});

it("打开核对入口不自动开通，保存失败后保留管理员修改", async () => {
  const submit = vi.fn().mockRejectedValue(new Error("offline"));
  render(
    <UserDialog
      open
      onOpenChange={() => {}}
      onSubmit={submit}
      user={
        {
          id: "inactive",
          username: "inactive@example.com",
          name: "待核对",
          role: Role.SALES,
          isActive: false,
        } as User
      }
    />,
  );
  expect(
    screen.getByRole("heading", { name: "核对并开通账号" }),
  ).toBeInTheDocument();
  const toggle = screen.getByRole("switch", { name: "账号开通" });
  expect(toggle).not.toBeChecked();
  expect(submit).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("修改内容已保留");
  expect(toggle).toBeChecked();
});

it("取消已切换的开通决定后重开，修改姓名再保存仍保持未开通", async () => {
  const submit = vi.fn().mockResolvedValue(undefined);
  const account = {
    id: "cancel-review",
    username: "cancel@example.com",
    name: "取消核对",
    role: Role.SALES,
    isActive: false,
  } as User;
  const props = { onOpenChange: vi.fn(), onSubmit: submit, user: account };
  const view = render(<UserDialog open {...props} />);
  fireEvent.click(screen.getByRole("switch", { name: "账号开通" }));
  expect(screen.getByRole("switch", { name: "账号开通" })).toBeChecked();
  view.rerender(<UserDialog open={false} {...props} />);
  expect(submit).not.toHaveBeenCalled();
  view.rerender(<UserDialog open {...props} />);
  expect(screen.getByRole("switch", { name: "账号开通" })).not.toBeChecked();
  fireEvent.change(screen.getByLabelText("显示姓名"), {
    target: { value: "更正姓名" },
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "更正姓名",
        isActive: false,
        role: Role.SALES,
      }),
    ),
  );
});

it("失败保存后关闭并打开另一个账号，清除错误与未保存的开通决定", async () => {
  const submit = vi.fn().mockRejectedValue(new Error("offline"));
  const account = {
    id: "failed-review",
    username: "first@example.com",
    name: "第一位",
    role: Role.SALES,
    isActive: false,
  } as User;
  const props = { onOpenChange: vi.fn(), onSubmit: submit, user: account };
  const view = render(<UserDialog open {...props} />);
  fireEvent.click(screen.getByRole("switch", { name: "账号开通" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
  view.rerender(<UserDialog open={false} {...props} />);
  view.rerender(
    <UserDialog
      open
      {...props}
      user={{
        ...account,
        id: "second-review",
        username: "second@example.com",
        name: "第二位",
      }}
    />,
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("switch", { name: "账号开通" })).not.toBeChecked();
  expect(screen.getByLabelText("显示姓名")).toHaveValue("第二位");
});
