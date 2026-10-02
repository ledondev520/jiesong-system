/** Browser form + real Express/SQLite recovery; only mail transport is synthetic. */
import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, chmodSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

let server: ChildProcess;
let directory: string;
let baseURL: string;
const oldPassword = randomBytes(18).toString("hex");
const newPassword = randomBytes(18).toString("hex");
test.beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "jiesong-recovery-e2e-"));
  chmodSync(directory, 0o700);
  server = spawn(
    process.execPath,
    [path.resolve("../backend/src/testHelpers/password-recovery-server.js")],
    {
      env: {
        ...process.env,
        NODE_ENV: "test",
        JWT_SECRET: randomBytes(32).toString("hex"),
        RECOVERY_TEST_DIR: directory,
        RECOVERY_TEST_PASSWORD: oldPassword,
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    },
  );
  baseURL = await new Promise<string>((resolve, reject) => {
    server.once("message", (message) =>
      resolve((message as { baseURL: string }).baseURL),
    );
    server.once("error", reject);
    server.once("exit", () =>
      reject(new Error("Synthetic recovery fixture exited before startup")),
    );
  });
});
test.afterAll(async () => {
  if (server?.exitCode === null) {
    const stopped = new Promise((r) => server.once("exit", r));
    server.kill("SIGTERM");
    await stopped;
  }
  if (directory) rmSync(directory, { recursive: true, force: true });
});

test("email ownership resets a real account once and revokes existing JWTs", async ({
  page,
  request,
}) => {
  const login = await request.post(`${baseURL}/api/v1/auth/login`, {
    data: { username: "synthetic-recovery", password: oldPassword },
  });
  expect(login.status()).toBe(200);
  const token = (await login.json()).data.token;
  expect(
    (
      await request.get(`${baseURL}/api/v1/auth/me`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(200);
  // Forward auth calls to the real isolated backend; no auth API response mocks.
  await page.route("**/api/v1/auth/**", async (route) => {
    const original = new URL(route.request().url());
    const response = await route.fetch({
      url: `${baseURL}${original.pathname}`,
    });
    await route.fulfill({ response });
  });
  await page.goto("/forgot-password");
  await expect(page.getByText(/旧账号未绑定邮箱/)).toBeVisible();
  await page.getByLabel("绑定邮箱").fill("RECOVERY@EXAMPLE.COM");
  await page.getByRole("button", { name: "获取验证码" }).click();
  await expect(page.getByRole("status")).toContainText(
    "如果该邮箱绑定了可用账号",
  );
  await expect(page.getByRole("button", { name: /秒后重发/ })).toBeDisabled();
  await expect
    .poll(() => {
      try {
        return JSON.parse(
          readFileSync(path.join(directory, "mailbox.json"), "utf8"),
        ).code.length;
      } catch {
        return 0;
      }
    })
    .toBe(6);
  const code = JSON.parse(
    readFileSync(path.join(directory, "mailbox.json"), "utf8"),
  ).code as string;
  await page
    .getByLabel("邮箱验证码")
    .fill(code === "000000" ? "999999" : "000000");
  await page.getByLabel("新密码", { exact: true }).fill(newPassword);
  await page.getByLabel("确认新密码").fill(newPassword);
  await page.getByRole("button", { name: "重置密码", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "验证码无效或已过期",
  );
  await page.getByLabel("邮箱验证码").fill(code);
  await page.getByRole("button", { name: "重置密码", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "密码重置成功！" }),
  ).toBeVisible();
  await expect(page.getByText(/已有登录会话已失效/)).toBeVisible();
  expect(
    (
      await request.get(`${baseURL}/api/v1/auth/me`, {
        headers: { authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post(`${baseURL}/api/v1/auth/reset-password`, {
        data: { email: "recovery@example.com", code, newPassword },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post(`${baseURL}/api/v1/auth/login`, {
        data: { username: "synthetic-recovery", password: newPassword },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "返回登录" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
