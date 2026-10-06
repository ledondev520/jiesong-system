/**
 * Input: Production frontend, real synthetic SALES login and existing local preference/profile state
 * Output: Cancel, save/reopen/reload and both local save failure/retry browser definitions
 * Pos: Hosted Header personal settings acceptance; no profile HTTP writes or production access
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { expect, test, type Page } from "@playwright/test";
import {
  startRoleFixture,
  stopRoleFixture,
  type RoleFixture,
} from "./real-role-fixture";
import {
  enterProfile,
  expectProfile,
  failNextProfileWrite,
  fillProfileDraft,
  forwardProfileApi,
  openProfile,
  originalName,
  originalPreferences,
  readPreferences,
  savedName,
  savedPreferences,
  saveError,
} from "./profile-preference-fixture";

test.use({ viewport: { width: 1440, height: 1000 } });
test.describe.configure({ mode: "serial" });
let fixture: RoleFixture;
let observations: Awaited<ReturnType<typeof forwardProfileApi>>;
let pageErrors: string[];
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  // Reuse an existing committed-migration fixture without introducing profile endpoints.
  fixture = await startRoleFixture("sales-header");
  observations = await forwardProfileApi(page, fixture);
  await enterProfile(page, fixture);
  await expect.poll(() => observations.users.length).toBeGreaterThan(0);
});
test.afterEach(async () => {
  if (fixture) await stopRoleFixture(fixture);
  expect(pageErrors).toEqual([]);
  expect(observations.writes).toBe(0);
  expect(observations.users.length).toBeGreaterThan(0);
  for (const user of observations.users) {
    expect(user).toEqual({
      id: fixture.users.SALES.id,
      username: fixture.users.SALES.username,
      name: originalName,
      role: "SALES",
    });
  }
});

/**
 * 职责：整页重载真实前端，等待读回服务器身份并重新打开本地设置。
 * @param page 当前同标签合成页面
 * @returns 当前重载后的个人设置弹窗定位器
 * @throws 重载丢失会话、真实用户读回或菜单不可达
 */
async function reloadProfile(page: Page) {
  const readbacks = observations.users.length;
  await page.reload();
  await expect.poll(() => observations.users.length).toBeGreaterThan(readbacks);
  return openProfile(page);
}

/**
 * 职责：用户明确保存后核对弹窗关闭、同标签重开/重载仍为规范化保存值。
 * @param page 当前保留完整资料草稿的页面
 * @returns 完成成功保存、原生存储和重载断言的 Promise<void>
 * @throws 保存未完成、规范化或重载保存值不符合预期
 */
async function saveAndReload(page: Page) {
  await page.getByRole("button", { name: "保存个人设置", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "个人设置", exact: true }),
  ).not.toBeVisible();
  await expect(page.getByRole("button", { name: "用户菜单" })).toContainText(
    savedName,
  );
  expect(await readPreferences(page)).toEqual(savedPreferences);
  const reopened = await openProfile(page);
  await expectProfile(page, savedName, savedPreferences);
  await expect(reopened.getByRole("alert")).toHaveCount(0);
  await reopened.getByRole("button", { name: "取消", exact: true }).click();
  const reloaded = await reloadProfile(page);
  await expectProfile(page, savedName, savedPreferences);
  await expect(reloaded.getByRole("alert")).toHaveCount(0);
  expect(await readPreferences(page)).toEqual(savedPreferences);
}

test("personal settings cancel discards complete draft through reopen and full reload", async ({
  page,
}) => {
  const dialog = await openProfile(page);
  await expectProfile(page, originalName, originalPreferences);
  await fillProfileDraft(page);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await readPreferences(page)).toEqual(originalPreferences);
  const reopened = await openProfile(page);
  await expectProfile(page, originalName, originalPreferences);
  await reopened.getByRole("button", { name: "取消", exact: true }).click();
  await reloadProfile(page);
  await expectProfile(page, originalName, originalPreferences);
  expect(await readPreferences(page)).toEqual(originalPreferences);
});

test("personal settings save persists ordinary local fields through reopen and full reload", async ({
  page,
}) => {
  await openProfile(page);
  await fillProfileDraft(page);
  await saveAndReload(page);
});

for (const target of ["preferences", "profile"] as const) {
  test(`personal settings ${target} storage failure preserves draft and explicit retry survives reload`, async ({
    page,
  }) => {
    const dialog = await openProfile(page);
    await fillProfileDraft(page);
    await failNextProfileWrite(page, target);
    await dialog
      .getByRole("button", { name: "保存个人设置", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toHaveText(saveError);
    await expect(dialog).toBeVisible();
    await expectProfile(page, `  ${savedName}  `, {
      ...savedPreferences,
      signature: `  ${savedPreferences.signature}  `,
    });
    expect(await readPreferences(page)).toEqual(
      target === "preferences" ? originalPreferences : savedPreferences,
    );
    // Zustand updates visible local state before persistence throws. This is a partial save,
    // so assert the real callback order instead of promising atomic rollback.
    await expect(
      page.getByRole("button", { name: "用户菜单", includeHidden: true }),
    ).toContainText(target === "preferences" ? originalName : savedName);
    await saveAndReload(page);
  });
}
