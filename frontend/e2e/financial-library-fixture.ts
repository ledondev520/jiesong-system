/**
 * Input: Private synthetic CLI-ingested backend and production frontend browser
 * Output: Real ADMIN/FINANCE login, loopback HTTP forwarding and independent SQLite reads
 * Pos: Hosted financial library fixture; no business response mocks or production access
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export interface LibraryFixture {
  server: ChildProcess;
  directory: string;
  baseURL: string;
  users: Record<"ADMIN" | "FINANCE", { id: string; username: string }>;
  documents: Record<"GENERAL_LEDGER" | "PAYROLL", string>;
}

/**
 * 职责：启动独占已提交迁移和真实CLI导入的测试后端。
 * @returns 验证loopback地址后的合成夹具
 * @throws 启动失败、超时或非本地地址
 */
export async function startLibraryFixture(): Promise<LibraryFixture> {
  const directory = mkdtempSync(
    path.join(tmpdir(), "jiesong-financial-library-"),
  );
  chmodSync(directory, 0o700);
  const server = spawn(
    process.execPath,
    [path.resolve("../backend/src/testHelpers/financial-library-server.js")],
    {
      env: {
        PATH: process.env.PATH,
        TMPDIR: tmpdir(),
        TZ: "UTC",
        NODE_ENV: "test",
        FINANCIAL_LIBRARY_TEST_DIR: directory,
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  try {
    const metadata = await new Promise<
      Omit<LibraryFixture, "directory" | "server">
    >((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Synthetic library backend startup timed out")),
        40000,
      );
      server.once("message", (message) => {
        clearTimeout(timeout);
        resolve(message as Omit<LibraryFixture, "directory" | "server">);
      });
      server.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      server.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error("Synthetic library backend exited before startup"));
      });
    });
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(metadata.baseURL))
      throw new Error("Library fixture must use IPv4 loopback");
    return { ...metadata, directory, server };
  } catch (error) {
    await stopLibraryFixture({ server, directory });
    throw error;
  }
}

/**
 * 职责：关闭本次测试子进程并清理自己的合成文件。
 * @param fixture 测试拥有的子进程和目录
 * @returns 清理完成的Promise
 */
export async function stopLibraryFixture(
  fixture: Pick<LibraryFixture, "server" | "directory">,
) {
  if (fixture.server.exitCode === null && fixture.server.signalCode === null) {
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => fixture.server.kill("SIGKILL"), 5000);
      fixture.server.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
      fixture.server.kill("SIGTERM");
    });
  }
  rmSync(fixture.directory, { recursive: true, force: true });
}

/**
 * 职责：以独立只读连接回查全部合成库字段。
 * @param fixture 独占合成数据库
 * @returns 全表行快照
 */
export function readLibraryDatabase(
  fixture: LibraryFixture,
): Record<string, Record<string, unknown>[]> {
  const script = `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=[row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM "'+table+'" ORDER BY rowid')] for table in tables}))
c.close()`;
  return JSON.parse(
    execFileSync(
      "python3",
      ["-c", script, path.join(fixture.directory, "synthetic.db")],
      { encoding: "utf8", timeout: 10000 },
    ),
  );
}

/**
 * 职责：所有业务API只透传至自己的真实后端，不mock响应或允许其他来源。
 * @param page 生产前端页面
 * @param fixture 本地真实API服务
 * @returns 安装请求透传的Promise
 */
export async function forwardLibraryApi(page: Page, fixture: LibraryFixture) {
  await page.route("**/api/v1/**", async (route) => {
    const original = new URL(route.request().url());
    if (original.origin !== "http://127.0.0.1:3004")
      throw new Error("Library acceptance refuses a non-fixture API origin");
    const response = await route.fetch({
      url: `${fixture.baseURL}${original.pathname}${original.search}`,
      maxRedirects: 0,
    });
    await route.fulfill({ response });
  });
}

/**
 * 职责：使用真实测试凭据登录，并核实服务端数据库角色和用户身份。
 * @param page 前端登录页面
 * @param fixture 当前测试用户
 * @param role 已有ADMIN或FINANCE角色
 * @returns 登录完成的Promise
 */
export async function loginLibrary(
  page: Page,
  fixture: LibraryFixture,
  role: "ADMIN" | "FINANCE",
) {
  await page.goto("/login");
  await page.getByLabel("用户名或邮箱").fill(fixture.users[role].username);
  await page
    .getByLabel("密码", { exact: true })
    .fill("test-only-financial-library-password-never-production");
  const login = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/auth/login" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const response = await login;
  expect(response.status()).toBe(200);
  const data = (await response.json()).data;
  expect(data.user.id).toBe(fixture.users[role].id);
  expect(data.user.role).toBe(role);
  await expect(page).toHaveURL(/\/dashboard$/);
}
