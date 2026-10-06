/**
 * Input: Test-only HS backend, real login/HTTP and private committed-migration SQLite
 * Output: Isolated HS catalogue browser fixture and independent persisted snapshots
 * Pos: Hosted HS checks; no business mocks, provider calls or production data
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export type HsRole =
  "ADMIN" | "PURCHASE" | "FINANCE" | "SALES" | "WAREHOUSE" | "BOSS";
export interface HsFixture {
  server: ChildProcess;
  directory: string;
  baseURL: string;
  hsCode: string;
  productName: string;
  users: Record<HsRole, { id: string; username: string }>;
}
export type HsSnapshot = Record<
  string,
  Record<string, string | number | null>[]
>;

/**
 * 职责：启动独占迁移SQLite和真实HS应用，并校验loopback及私有权限。
 * @returns 当前HS夹具及子进程元数据
 * @throws 启动超时、退出、非loopback或权限不符
 */
export async function startHsFixture(): Promise<HsFixture> {
  const directory = mkdtempSync(path.join(tmpdir(), "jiesong-hs-browser-e2e-"));
  chmodSync(directory, 0o700);
  const server = spawn(
    process.execPath,
    [path.resolve("../backend/src/testHelpers/hs-code-browser-server.js")],
    {
      env: {
        PATH: process.env.PATH,
        TMPDIR: tmpdir(),
        TZ: "UTC",
        NODE_ENV: "test",
        HS_BROWSER_TEST_DIR: directory,
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  try {
    const metadata = await new Promise<Omit<HsFixture, "server" | "directory">>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Synthetic HS backend startup timed out")),
          40000,
        );
        server.once("message", (message) => {
          clearTimeout(timeout);
          resolve(message as Omit<HsFixture, "server" | "directory">);
        });
        server.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        server.once("exit", () => {
          clearTimeout(timeout);
          reject(new Error("Synthetic HS backend exited before startup"));
        });
      },
    );
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(metadata.baseURL))
      throw new Error("HS fixture must bind IPv4 loopback");
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(statSync(path.join(directory, "synthetic.db")).mode & 0o777).toBe(
      0o600,
    );
    return { server, directory, ...metadata };
  } catch (error) {
    await stopHsFixture({ server, directory });
    throw error;
  }
}

/**
 * 职责：停止当前HS子进程并仅删除本次独占临时目录。
 * @param fixture 当前夹具的子进程和私有目录
 * @returns 清理完成的 Promise<void>
 */
export async function stopHsFixture(
  fixture: Pick<HsFixture, "server" | "directory">,
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
 * 职责：独立只读连接回查完整HS行、HS审计及无关业务/AI使用行。
 * @param fixture 当前独占合成数据库夹具
 * @returns 按表名组织的持久化快照；不读取登录凭据或登录审计
 * @throws SQLite、子进程超时或JSON解析失败
 */
export function readHsSnapshot(fixture: HsFixture): HsSnapshot {
  const script = `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=['hs_codes','operation_logs','products','purchase_contracts','sales_contracts','inventories','payments','customs_declarations','tax_refunds','token_usages']
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM '+table+(" WHERE entity='HsCode'" if table=='operation_logs' else '')+' ORDER BY id')] for table in tables}))
c.close()`;
  return JSON.parse(
    execFileSync(
      "python3",
      ["-c", script, path.join(fixture.directory, "synthetic.db")],
      { encoding: "utf8", timeout: 10000 },
    ),
  ) as HsSnapshot;
}

/**
 * 职责：透传真正普通API响应，只允许登录与本地字典写入。
 * @param page 当前浏览器页面
 * @param fixture 当前独占真实后端
 * @returns 路由透传注册完成的 Promise<void>
 * @throws 非夹具来源、AI/外部HS路径或其他业务写请求
 */
export async function forwardHsApi(page: Page, fixture: HsFixture) {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.origin !== "http://127.0.0.1:3004")
      throw new Error("HS acceptance refuses non-fixture API origin");
    if (
      url.pathname.startsWith("/api/v1/hs-codes") &&
      !/^\/api\/v1\/hs-codes(?:\/?$|\/search$|\/\d+$)/.test(url.pathname)
    )
      throw new Error("HS acceptance excludes AI and external HS routes");
    if (
      method !== "GET" &&
      !(method === "POST" && url.pathname === "/api/v1/auth/login") &&
      !(method === "PUT" && /^\/api\/v1\/hs-codes\/\d+$/.test(url.pathname))
    )
      throw new Error("HS acceptance excludes other business writes");
    const response = await route.fetch({
      url: `${fixture.baseURL}${url.pathname}${url.search}`,
      maxRedirects: 0,
    });
    await route.fulfill({ response });
  });
}

/**
 * 职责：通过真实登录确认现有数据库身份与角色。
 * @param page 当前验收页面
 * @param fixture 当前合成用户元数据
 * @param role 本次验收使用的现有角色
 * @returns 当前合成用户测试令牌
 * @throws 登录非200、角色或身份不符、导航失败
 */
export async function loginHsAs(page: Page, fixture: HsFixture, role: HsRole) {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("用户名或邮箱").fill(fixture.users[role].username);
  await page
    .getByLabel("密码", { exact: true })
    .fill("test-only-hs-browser-password-never-production");
  const login = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/auth/login" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const response = await login;
  expect(response.status()).toBe(200);
  const data = (await response.json()).data;
  expect(data.user).toMatchObject({ id: fixture.users[role].id, role });
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("button", { name: "用户菜单" }).first(),
  ).toBeVisible();
  return data.token as string;
}
