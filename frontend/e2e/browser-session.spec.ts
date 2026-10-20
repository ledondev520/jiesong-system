/** Real frontend + Express/SQLite. Requests pass through the real Next same-origin rewrite to the ephemeral local backend. */
import { test, expect, chromium, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
let server: ChildProcess;
let directory: string;
let backend: string;
const password = randomBytes(18).toString("hex");
test.beforeAll(async () => {
  directory = mkdtempSync(path.join(tmpdir(), "jiesong-browser-e2e-"));
  chmodSync(directory, 0o700);
  server = spawn(
    process.execPath,
    [path.resolve("../backend/src/testHelpers/browser-session-server.js")],
    {
      env: {
        ...process.env,
        NODE_ENV: "test",
        JWT_SECRET: randomBytes(32).toString("hex"),
        CORS_ORIGIN: "http://127.0.0.1:3004",
        BROWSER_SESSION_TEST_DIR: directory,
        BROWSER_SESSION_TEST_PASSWORD: password,
      },
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  backend = await new Promise<string>((resolve, reject) => {
    server.once("message", (message) =>
      resolve((message as { baseURL: string }).baseURL),
    );
    server.once("error", reject);
    server.once("exit", () =>
      reject(new Error("Synthetic session backend exited before startup")),
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
const logIn = async (page: Page, remember = true) => {
  await page.goto("http://127.0.0.1:3004/login");
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("checkbox", { name: "保持登录" }),
  ).not.toBeChecked();
  await page.getByLabel("用户名或邮箱").fill("synthetic-browser");
  await page.getByLabel("密码", { exact: true }).fill(password);
  if (remember) await page.getByRole("checkbox", { name: "保持登录" }).check();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("button", { name: "用户菜单" }).first(),
  ).toBeVisible();
};

test("optional login survives reload, new tab and browser restart; no password/token in JS storage; logout revokes cookie", async () => {
  test.setTimeout(120000);
  const profile = path.join(directory, "browser-profile");
  let context = await chromium.launchPersistentContext(profile, {
    headless: true,
  });
  try {
    const page = await context.newPage();
    await logIn(page);
    const cookie = (await context.cookies()).find(
      (item) => item.name === "jiesong_session",
    )!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Strict");
    expect(cookie.expires).toBeGreaterThan(Date.now() / 1000);
    expect(await page.evaluate(() => document.cookie)).not.toContain(
      cookie.value,
    );
    expect(
      await page.evaluate(() =>
        JSON.stringify({
          local: { ...localStorage },
          session: { ...sessionStorage },
        }),
      ),
    ).not.toContain(password);
    expect(
      await page.evaluate(() => sessionStorage.getItem("jiesong_access_token")),
    ).toBeNull();
    expect(
      await page.evaluate(() =>
        JSON.stringify({
          local: { ...localStorage },
          session: { ...sessionStorage },
        }),
      ),
    ).not.toContain(cookie.value);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "用户菜单" }).first(),
    ).toBeVisible();
    const tab = await context.newPage();
    await tab.goto("http://127.0.0.1:3004/login");
    await expect(tab).toHaveURL(/\/dashboard$/);
    const unchanged = (await context.cookies()).find(
      (item) => item.name === "jiesong_session",
    )!;
    expect(unchanged.expires).toBe(cookie.expires);
    expect(unchanged.value).toBe(cookie.value);
    await context.close();
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
    });
    const reopened = await context.newPage();
    await reopened.goto("http://127.0.0.1:3004/dashboard");
    await expect(
      reopened.getByRole("button", { name: "用户菜单" }).first(),
    ).toBeVisible();
    // Real cookie-authenticated mutation cannot be forged without its CSRF proof.
    const denied = await reopened.evaluate(
      async () =>
        (await fetch("/api/v1/auth/logout", { method: "POST" })).status,
    );
    expect(denied).toBe(403);
    await reopened.getByRole("button", { name: "用户菜单" }).first().click();
    await reopened.getByRole("menuitem", { name: /退出登录/ }).click();
    await expect(reopened).toHaveURL(/\/login$/);
    await expect(
      reopened.getByRole("button", { name: "登录", exact: true }),
    ).toBeEnabled();
    expect(
      (await context.cookies()).find((item) => item.name === "jiesong_session"),
    ).toBeDefined(); // Retained cookie is durably revoked; no stale response can erase a newer login.
    await reopened.reload();
    await expect(reopened).toHaveURL(/\/login$/);
    const replay = await reopened.request.get(
      `${backend}/api/v1/auth/session`,
      { headers: { cookie: `jiesong_session=${cookie.value}` } },
    );
    expect(replay.status()).toBe(401);
  } finally {
    await context.close();
  }
});

test("unchecked login stays tab-scoped, failed login recovers, expired persistence cannot restore", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3004",
  });
  try {
    const page = await context.newPage();
    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "登录", exact: true }),
    ).toBeEnabled();
    await page.getByLabel("用户名或邮箱").fill("synthetic-browser");
    await page
      .getByLabel("密码", { exact: true })
      .fill(randomBytes(18).toString("hex"));
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByText("用户名或密码错误")).toBeVisible();
    await logIn(page, false);
    expect(
      (await context.cookies()).find((item) => item.name === "jiesong_session"),
    ).toBeUndefined();
    const fresh = await context.newPage();
    await fresh.goto("/login");
    await expect(
      fresh.getByRole("button", { name: "登录", exact: true }),
    ).toBeEnabled();
    await logIn(fresh, true);
    const expired = new Promise<void>((resolve) =>
      server.once("message", () => resolve()),
    );
    server.send("expire");
    await expired;
    await fresh.reload();
    await expect(fresh).toHaveURL(/\/login/);
    await expect(
      fresh.getByRole("button", { name: "登录", exact: true }),
    ).toBeEnabled();
    await fresh.reload();
    await expect(fresh).toHaveURL(/\/login/);
  } finally {
    await context.close();
  }
});
