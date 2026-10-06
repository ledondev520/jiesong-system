/**
 * Input: HeaderUserMenu, actual Zustand profile persistence and synthetic identity
 * Output: Partial local profile-save failure, preserved draft and explicit retry regression
 * Pos: Runnable personal settings integration at the existing local save seam; no HTTP
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "@/store/auth.store";
import { Role, type User } from "@/types";
import {
  HEADER_USER_MENU_PREFERENCES_KEY,
  HeaderUserMenu,
} from "./HeaderUserMenu";

const originalPreferences = {
  desktopNotifications: false,
  compactMode: false,
  rememberLastModule: true,
  signature: "已保存备注",
};
const syntheticUser: User = {
  id: "profile-local-fixture",
  username: "profile-local-fixture",
  name: "原显示名称",
  role: Role.SALES,
  isActive: true,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

/**
 * 职责：像实际 Header 一样用真实认证仓库的资料和 updateProfile 装配菜单。
 * @returns 合成用户的 HeaderUserMenu；没有回调替身或认证凭据读取
 */
function LocalProfileHarness() {
  const user = useAuthStore((state) => state.user);
  const updateProfile = useAuthStore((state) => state.updateProfile);
  return (
    <HeaderUserMenu
      displayName={user?.name}
      username={user?.username}
      initials="原显"
      onSaveProfile={updateProfile}
      onLogout={() => {}}
    />
  );
}

/**
 * 职责：通过可访问的菜单入口打开实际个人设置表单。
 * @param user 当前 Testing Library 用户交互实例
 * @returns 弹窗打开的 Promise<void>
 */
async function openProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "用户菜单" }));
  await user.click(screen.getByRole("menuitem", { name: "个人设置" }));
  await screen.findByRole("dialog", { name: "个人设置" });
}

describe("HeaderUserMenu with actual local profile persistence", () => {
  beforeEach(() => {
    useAuthStore.getState().login(syntheticUser, null);
    localStorage.setItem(
      HEADER_USER_MENU_PREFERENCES_KEY,
      JSON.stringify(originalPreferences),
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().logout();
    localStorage.removeItem(HEADER_USER_MENU_PREFERENCES_KEY);
  });

  it("真实资料持久化失败已写偏好与内存姓名，保留草稿并允许明确重试", async () => {
    const user = userEvent.setup();
    render(<LocalProfileHarness />);
    await openProfile(user);
    await user.clear(screen.getByLabelText("显示名称"));
    await user.type(screen.getByLabelText("显示名称"), "  新显示名称  ");
    await user.clear(screen.getByLabelText("个人偏好备注"));
    await user.type(screen.getByLabelText("个人偏好备注"), "  新个人备注  ");
    await user.click(screen.getByRole("switch", { name: "紧凑信息密度" }));
    await user.click(screen.getByRole("switch", { name: "默认回到最近模块" }));

    const nativeSetItem = Storage.prototype.setItem;
    let failNextProfileWrite = true;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      // Only inject a synthetic failure. Never inspect or retain auth-storage values.
      if (
        this === sessionStorage &&
        key === "auth-storage" &&
        failNextProfileWrite
      ) {
        failNextProfileWrite = false;
        throw new DOMException(
          "Synthetic local persistence failure",
          "QuotaExceededError",
        );
      }
      return nativeSetItem.call(this, key, value);
    });
    await user.click(screen.getByRole("button", { name: "保存个人设置" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "个人设置保存未完成，当前草稿已保留，请重试",
    );
    expect(screen.getByLabelText("显示名称")).toHaveValue("  新显示名称  ");
    expect(screen.getByLabelText("个人偏好备注")).toHaveValue("  新个人备注  ");
    expect(screen.getByRole("switch", { name: "紧凑信息密度" })).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "默认回到最近模块" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "用户菜单", hidden: true }),
    ).toHaveTextContent("新显示名称");
    expect(
      JSON.parse(localStorage.getItem(HEADER_USER_MENU_PREFERENCES_KEY)!),
    ).toEqual({
      desktopNotifications: false,
      compactMode: true,
      rememberLastModule: false,
      signature: "新个人备注",
    });

    // Existing hydration restores the prior persisted user after the failed write;
    // the dialog's unsaved draft stays intact. This is unit evidence, not browser reload proof.
    await act(async () => {
      await useAuthStore.persist.rehydrate();
    });
    expect(
      screen.getByRole("button", { name: "用户菜单", hidden: true }),
    ).toHaveTextContent("原显示名称");
    expect(screen.getByLabelText("显示名称")).toHaveValue("  新显示名称  ");
    await user.click(screen.getByRole("button", { name: "保存个人设置" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => {
      await useAuthStore.persist.rehydrate();
    });
    expect(screen.getByRole("button", { name: "用户菜单" })).toHaveTextContent(
      "新显示名称",
    );
    await openProfile(user);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("显示名称")).toHaveValue("新显示名称");
    expect(screen.getByLabelText("个人偏好备注")).toHaveValue("新个人备注");
    expect(screen.getByRole("switch", { name: "紧凑信息密度" })).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "默认回到最近模块" }),
    ).not.toBeChecked();
  });
});
