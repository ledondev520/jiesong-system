/**
 * Input: Real isolated SALES backend, browser preference storage and profile draft UI
 * Output: Safe authenticated user readback and one-shot local persistence failures
 * Pos: Hosted personal settings acceptance helpers; no credential or auth-storage reads
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { expect, type Page } from "@playwright/test";
import { loginAs, type RoleFixture } from "./real-role-fixture";

export const preferenceKey = "jiesong_header_user_preferences";
export const originalPreferences = {
  desktopNotifications: false,
  compactMode: false,
  rememberLastModule: true,
  signature: "合成已保存个人备注",
};
export const savedPreferences = {
  desktopNotifications: false,
  compactMode: true,
  rememberLastModule: false,
  signature: "合成新个人备注",
};
export const originalName = "合成SALES";
export const savedName = "合成新显示名称";
export const saveError = "个人设置保存未完成，当前草稿已保留，请重试";

interface SafeUser {
  id: string;
  username: string;
  name: string;
  role: string;
}

/**
 * 职责：透传真正后端响应，拒绝业务写入，并从既有认证 GET 读回非凭据用户字段。
 * 思路：利用通知计数请求原样透传的认证上下文调用 auth/me；不读取任何请求凭据。
 * @param page 当前隔离浏览器页面
 * @param fixture 已通过已提交迁移初始化的独占后端
 * @returns 只读用户字段快照与意外写入计数
 * @throws 跨源请求、业务写入、用户读回失败或真实接口失败
 */
export async function forwardProfileApi(page: Page, fixture: RoleFixture) {
  const observations = { users: [] as SafeUser[], writes: 0 };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const original = new URL(request.url());
    if (original.origin !== "http://127.0.0.1:3004")
      throw new Error("Profile acceptance refuses a non-fixture API origin");
    if (
      !["GET", "HEAD"].includes(request.method()) &&
      !(
        original.pathname === "/api/v1/auth/login" &&
        request.method() === "POST"
      )
    ) {
      observations.writes += 1;
      await route.abort();
      throw new Error("Personal settings acceptance refuses business writes");
    }
    // 0. Pass actual auth headers through route.fetch without inspecting them.
    if (original.pathname === "/api/v1/notifications/unread-count") {
      const response = await route.fetch({
        url: `${fixture.baseURL}/api/v1/auth/me`,
        maxRedirects: 0,
      });
      expect(response.status()).toBe(200);
      const { id, username, name, role } = (await response.json()).data;
      observations.users.push({ id, username, name, role });
    }
    // 1. Deliver the original API response unchanged, never a synthetic profile result.
    const response = await route.fetch({
      url: `${fixture.baseURL}${original.pathname}${original.search}`,
      maxRedirects: 0,
    });
    await route.fulfill({ response });
  });
  return observations;
}

/**
 * 职责：复用隔离账号标准登录夹具，仅将原生个人偏好作为初始保存值。
 * @param page 当前已透传隔离后端的页面
 * @param fixture 独占合成账号元数据
 * @returns 完成真实登录和偏好初值设置的 Promise<void>
 * @throws 登录失败、身份展示或导航不符合预期
 */
export async function enterProfile(page: Page, fixture: RoleFixture) {
  await loginAs(page, fixture, "SALES");
  // Seed only the preference key once. Reload must use the browser's saved values.
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: preferenceKey, value: originalPreferences },
  );
}

/**
 * 职责：从 Header 用户菜单打开真实个人设置弹窗。
 * @param page 当前已登录页面
 * @returns 当前可见个人设置弹窗定位器
 * @throws 菜单或弹窗不可达
 */
export async function openProfile(page: Page) {
  await page.getByRole("button", { name: "用户菜单" }).click();
  await page.getByRole("menuitem", { name: "个人设置", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "个人设置", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * 职责：填写姓名、备注和两项普通偏好；不上传头像或申请桌面通知权限。
 * @param page 当前个人设置弹窗页面
 * @returns 完成草稿输入的 Promise<void>
 */
export async function fillProfileDraft(page: Page) {
  const dialog = page.getByRole("dialog", { name: "个人设置", exact: true });
  await dialog.getByLabel("显示名称", { exact: true }).fill(`  ${savedName}  `);
  await dialog
    .getByLabel("个人偏好备注", { exact: true })
    .fill(`  ${savedPreferences.signature}  `);
  await dialog.getByRole("switch", { name: "紧凑信息密度" }).click();
  await dialog.getByRole("switch", { name: "默认回到最近模块" }).click();
}

/**
 * 职责：核对完整姓名/偏好表单和未变的桌面通知选择。
 * @param page 当前打开的个人设置页面
 * @param name 预期显示名称，可保留未提交空白
 * @param preferences 预期四项普通偏好
 * @returns 完成输入与开关断言的 Promise<void>
 * @throws 任一已保存或草稿字段不符合预期
 */
export async function expectProfile(
  page: Page,
  name: string,
  preferences: typeof originalPreferences,
) {
  const dialog = page.getByRole("dialog", { name: "个人设置", exact: true });
  await expect(dialog.getByLabel("显示名称", { exact: true })).toHaveValue(
    name,
  );
  await expect(dialog.getByLabel("个人偏好备注", { exact: true })).toHaveValue(
    preferences.signature,
  );
  await expect(
    dialog.getByRole("switch", { name: "紧凑信息密度" }),
  ).toHaveAttribute("aria-checked", String(preferences.compactMode));
  await expect(
    dialog.getByRole("switch", { name: "默认回到最近模块" }),
  ).toHaveAttribute("aria-checked", String(preferences.rememberLastModule));
  await expect(
    dialog.getByRole("switch", { name: "桌面通知" }),
  ).toHaveAttribute("aria-checked", "false");
}

/**
 * 职责：仅读回明确允许观察的个人偏好 JSON，不读认证存储或 cookies。
 * @param page 当前浏览器页面
 * @returns 个人偏好对象
 */
export async function readPreferences(page: Page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || "null"),
    preferenceKey,
  );
}

/**
 * 职责：仅使下一次指定本地存储写入失败，恢复后续原生写入供用户明确重试。
 * @param page 当前已完成登录的合成页面
 * @param target 首个偏好写入或后续资料持久化写入；不检查任何认证值
 * @returns 装配一次 QuotaExceededError 的 Promise<void>
 */
export async function failNextProfileWrite(
  page: Page,
  target: "preferences" | "profile",
) {
  await page.evaluate(
    ({ key, storage }) => {
      const nativeSetItem = Storage.prototype.setItem;
      const targetStorage =
        storage === "preferences" ? localStorage : sessionStorage;
      Storage.prototype.setItem = function (itemKey, value) {
        if (this === targetStorage && itemKey === key) {
          Storage.prototype.setItem = nativeSetItem;
          throw new DOMException(
            "Synthetic local profile persistence failure",
            "QuotaExceededError",
          );
        }
        return nativeSetItem.call(this, itemKey, value);
      };
    },
    {
      key: target === "preferences" ? preferenceKey : "auth-storage",
      storage: target,
    },
  );
}
