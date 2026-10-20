/**
 * Input: HeaderUserMenu 的显示名称与本地个人偏好草稿
 * Output: 取消、重开、保存失败重试及保存后重开回归（jsdom 隔离存储）
 * Pos: 前端布局子组件生命周期测试
 */

import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  HEADER_USER_MENU_PREFERENCES_KEY,
  HeaderUserMenu,
} from "./HeaderUserMenu";
import type {
  HeaderProfileDraft,
  HeaderUserMenuPreferences,
} from "./HeaderProfileDialog";

const savedPreferences: HeaderUserMenuPreferences = {
  desktopNotifications: false,
  compactMode: false,
  rememberLastModule: true,
  signature: "已保存备注",
};

function ProfileHarness({
  onSave,
}: {
  onSave: (profile: HeaderProfileDraft) => void;
}) {
  const [displayName, setDisplayName] = useState("原显示名称");

  return (
    <HeaderUserMenu
      displayName={displayName}
      username="profile-fixture"
      initials="原显"
      onSaveProfile={(profile) => {
        onSave(profile);
        setDisplayName(profile.name);
      }}
      onLogout={vi.fn()}
    />
  );
}

async function openProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "用户菜单" }));
  await user.click(screen.getByRole("menuitem", { name: "个人设置" }));
  await screen.findByRole("dialog", { name: "个人设置" });
}

async function editDraft(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(screen.getByLabelText("显示名称"));
  await user.type(screen.getByLabelText("显示名称"), "  新显示名称  ");
  await user.clear(screen.getByLabelText("个人偏好备注"));
  await user.type(screen.getByLabelText("个人偏好备注"), "  新个人备注  ");
  await user.click(screen.getByRole("switch", { name: "紧凑信息密度" }));
  await user.click(screen.getByRole("switch", { name: "默认回到最近模块" }));
}

function expectSavedDraft() {
  expect(screen.getByLabelText("显示名称")).toHaveValue("原显示名称");
  expect(screen.getByLabelText("个人偏好备注")).toHaveValue("已保存备注");
  expect(
    screen.getByRole("switch", { name: "紧凑信息密度" }),
  ).not.toBeChecked();
  expect(
    screen.getByRole("switch", { name: "默认回到最近模块" }),
  ).toBeChecked();
}

describe("HeaderUserMenu ordinary profile lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      HEADER_USER_MENU_PREFERENCES_KEY,
      JSON.stringify(savedPreferences),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("取消丢弃显示名称、备注和偏好草稿，重开仍展示保存值", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<ProfileHarness onSave={onSave} />);

    await openProfile(user);
    await editDraft(user);
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(
      JSON.parse(localStorage.getItem(HEADER_USER_MENU_PREFERENCES_KEY)!),
    ).toEqual(savedPreferences);

    await openProfile(user);
    expectSavedDraft();
  });

  it("每次重开重新加载最新的显示名称和已保存个人偏好", async () => {
    const onSaveProfile = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <HeaderUserMenu
        displayName="原显示名称"
        username="profile-fixture"
        initials="原显"
        onSaveProfile={onSaveProfile}
        onLogout={vi.fn()}
      />,
    );

    await openProfile(user);
    expectSavedDraft();
    await user.click(screen.getByRole("button", { name: "取消" }));
    localStorage.setItem(
      HEADER_USER_MENU_PREFERENCES_KEY,
      JSON.stringify({
        ...savedPreferences,
        compactMode: true,
        rememberLastModule: false,
        signature: "最新保存备注",
      }),
    );
    rerender(
      <HeaderUserMenu
        displayName="最新显示名称"
        username="profile-fixture"
        initials="最新"
        onSaveProfile={onSaveProfile}
        onLogout={vi.fn()}
      />,
    );

    await openProfile(user);
    expect(screen.getByLabelText("显示名称")).toHaveValue("最新显示名称");
    expect(screen.getByLabelText("个人偏好备注")).toHaveValue("最新保存备注");
    expect(screen.getByRole("switch", { name: "紧凑信息密度" })).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "默认回到最近模块" }),
    ).not.toBeChecked();
    expect(onSaveProfile).not.toHaveBeenCalled();
  });

  it("本地保存失败明确提示并保留草稿，用户重试后只保存一次", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    const originalSetItem = Storage.prototype.setItem;
    let failNextPreferenceSave = true;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key,
      value,
    ) {
      if (key === HEADER_USER_MENU_PREFERENCES_KEY && failNextPreferenceSave) {
        failNextPreferenceSave = false;
        throw new DOMException(
          "Synthetic test storage quota failure",
          "QuotaExceededError",
        );
      }
      return originalSetItem.call(this, key, value);
    });
    render(<ProfileHarness onSave={onSave} />);
    await openProfile(user);
    await editDraft(user);
    await user.click(screen.getByRole("button", { name: "保存个人设置" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "个人设置保存未完成，当前草稿已保留，请重试",
    );
    expect(
      screen.getByRole("dialog", { name: "个人设置" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("显示名称")).toHaveValue("  新显示名称  ");
    expect(screen.getByLabelText("个人偏好备注")).toHaveValue("  新个人备注  ");
    expect(screen.getByRole("switch", { name: "紧凑信息密度" })).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "默认回到最近模块" }),
    ).not.toBeChecked();
    expect(onSave).not.toHaveBeenCalled();
    expect(
      JSON.parse(localStorage.getItem(HEADER_USER_MENU_PREFERENCES_KEY)!),
    ).toEqual(savedPreferences);

    await user.click(screen.getByRole("button", { name: "保存个人设置" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      name: "新显示名称",
      avatar: undefined,
    });
    await openProfile(user);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("显示名称")).toHaveValue("新显示名称");
    expect(screen.getByLabelText("个人偏好备注")).toHaveValue("新个人备注");
  });

  it("资料回调失败时如实保留已写入的偏好与未完成草稿，重试后再关闭", async () => {
    const onSave = vi.fn().mockImplementationOnce(() => {
      throw new Error("Synthetic test profile callback failure");
    });
    const user = userEvent.setup();
    render(<ProfileHarness onSave={onSave} />);

    await openProfile(user);
    await editDraft(user);
    await user.click(screen.getByRole("button", { name: "保存个人设置" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "个人设置保存未完成，当前草稿已保留，请重试",
    );
    expect(
      screen.getByRole("dialog", { name: "个人设置" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("显示名称")).toHaveValue("  新显示名称  ");
    expect(screen.getByLabelText("个人偏好备注")).toHaveValue("  新个人备注  ");
    expect(
      screen.getByRole("button", { name: "用户菜单", hidden: true }),
    ).toHaveTextContent("原显示名称");
    expect(onSave).toHaveBeenCalledTimes(1);
    // Existing synchronous order writes preferences before invoking the profile callback.
    expect(
      JSON.parse(localStorage.getItem(HEADER_USER_MENU_PREFERENCES_KEY)!),
    ).toEqual({
      ...savedPreferences,
      compactMode: true,
      rememberLastModule: false,
      signature: "新个人备注",
    });

    await user.click(screen.getByRole("button", { name: "保存个人设置" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(2);
    await openProfile(user);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("显示名称")).toHaveValue("新显示名称");
    expect(screen.getByLabelText("个人偏好备注")).toHaveValue("新个人备注");
    expect(screen.getByRole("switch", { name: "紧凑信息密度" })).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "默认回到最近模块" }),
    ).not.toBeChecked();
  });

  it("保存成功后重开保留规范化的显示名称、备注与所选偏好", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(<ProfileHarness onSave={onSave} />);

    await openProfile(user);
    await editDraft(user);
    await user.click(screen.getByRole("button", { name: "保存个人设置" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      name: "新显示名称",
      avatar: undefined,
    });
    expect(
      JSON.parse(localStorage.getItem(HEADER_USER_MENU_PREFERENCES_KEY)!),
    ).toEqual({
      ...savedPreferences,
      compactMode: true,
      rememberLastModule: false,
      signature: "新个人备注",
    });

    await openProfile(user);
    expect(screen.getByLabelText("显示名称")).toHaveValue("新显示名称");
    expect(screen.getByLabelText("个人偏好备注")).toHaveValue("新个人备注");
    expect(screen.getByRole("switch", { name: "紧凑信息密度" })).toBeChecked();
    expect(
      screen.getByRole("switch", { name: "默认回到最近模块" }),
    ).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "桌面通知" })).not.toBeChecked();
  });
});
