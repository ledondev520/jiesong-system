/**
 * Input: Test-only loopback Express child and private migrated synthetic SQLite
 * Output: Real user API transport, bounded name-only requests and safe independent readback
 * Pos: Frontend account-name lifecycle fixture; no credential fields are queried
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers";
import type { User } from "@/types";

type Identity = Pick<User, "id" | "username" | "name" | "role" | "isActive">;
type NameEdit = Partial<User> & { password?: string };
export interface AccountNameFixture {
  server: ChildProcess;
  directory: string;
  baseURL: string;
  token: string;
  first: Identity;
  later: Identity;
  requests: { method: string; route: string; body?: NameEdit }[];
  responses: { method: string; route: string; status: number }[];
  pendingRequests: Set<Promise<unknown>>;
}

/**
 * 职责：启动不继承生产配置的私有迁移夹具
 * @returns 独占服务、合成身份及请求证据容器
 * @throws 迁移、服务启动、权限或 localhost 校验失败
 */
export async function startAccountNameFixture(): Promise<AccountNameFixture> {
  const directory = mkdtempSync(path.join(tmpdir(), "jiesong-account-name-"));
  chmodSync(directory, 0o700);
  const server = spawn(
    process.execPath,
    [path.resolve("../backend/src/testHelpers/account-name-server.js")],
    {
      env: {
        PATH: process.env.PATH,
        TMPDIR: tmpdir(),
        TZ: "UTC",
        NODE_ENV: "test",
        ACCOUNT_NAME_TEST_DIR: directory,
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  try {
    const metadata = await new Promise<
      Pick<AccountNameFixture, "baseURL" | "token" | "first" | "later">
    >((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Name fixture startup timed out")),
        40000,
      );
      server.once("message", (message) => {
        clearTimeout(timeout);
        resolve(
          message as Pick<
            AccountNameFixture,
            "baseURL" | "token" | "first" | "later"
          >,
        );
      });
      server.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      server.once("exit", () => {
        clearTimeout(timeout);
        reject(new Error("Name fixture exited before startup"));
      });
    });
    if (
      !/^http:\/\/127\.0\.0\.1:\d+$/.test(metadata.baseURL) ||
      (statSync(directory).mode & 0o777) !== 0o700 ||
      (statSync(path.join(directory, "synthetic.db")).mode & 0o777) !== 0o600
    ) {
      throw new Error("Name fixture must remain private and loopback-only");
    }
    return {
      server,
      directory,
      ...metadata,
      requests: [],
      responses: [],
      pendingRequests: new Set(),
    };
  } catch (error) {
    await stopAccountNameFixture({ server, directory });
    throw error;
  }
}

/**
 * 职责：停止当前夹具服务并只删除其临时目录
 * @param fixture 当前测试创建的服务与目录
 * @returns 停止完成的 Promise
 */
export async function stopAccountNameFixture(
  fixture: Pick<AccountNameFixture, "server" | "directory">,
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
 * 职责：原样转发真实用户 HTTP，拒绝普通名称编辑以外的写请求
 * @param fixture 当前独占夹具
 * @param method GET 或 PUT
 * @param route 当前用户 API 路径
 * @param body 原样表单提交字段，密码只能留空或省略
 * @returns 真实 API 的响应数据
 * @throws 操作越界、网络或真实业务保存失败
 */
export async function accountNameApi<T>(
  fixture: AccountNameFixture,
  method: string,
  route: string,
  body?: NameEdit,
): Promise<T> {
  if (
    !/^\/users(?:\/[a-z0-9]+)?(?:\?.*)?$/.test(route) ||
    !["GET", "PUT"].includes(method)
  ) {
    throw new Error("Name fixture refuses this route or operation");
  }
  if (method === "PUT") {
    const target = [fixture.first, fixture.later].find(
      (item) => route === `/users/${item.id}`,
    );
    if (
      !target ||
      !body ||
      Object.keys(body).some(
        (key) =>
          !["username", "name", "role", "isActive", "password"].includes(key),
      ) ||
      typeof body.name !== "string" ||
      body.username !== target.username ||
      body.role !== target.role ||
      body.isActive !== target.isActive ||
      (body.password !== undefined && body.password !== "")
    ) {
      throw new Error(
        "Name fixture refuses changes to account access or other fields",
      );
    }
  }
  fixture.requests.push({
    method,
    route,
    ...(body ? { body: { ...body } } : {}),
  });
  const pending = fetchAccountNameResponse<T>(fixture, method, route, body);
  fixture.pendingRequests.add(pending);
  try {
    return await pending;
  } finally {
    fixture.pendingRequests.delete(pending);
  }
}

/**
 * 职责：等待当前真实HTTP链结算，包括前一页完成后启动的下一页
 * @param fixture 当前独占夹具
 * @returns 所有已触发请求结算后的 Promise；原请求拒绝仍交还原调用者
 * @throws 结算期间观察到的原始请求拒绝，不把网络或业务失败当成完成
 */
export async function settleAccountNameRequests(fixture: AccountNameFixture) {
  const failures: unknown[] = [];
  do {
    const results = await Promise.allSettled([...fixture.pendingRequests]);
    for (const result of results) {
      if (result.status === "rejected") failures.push(result.reason);
    }
    // Give the resolved CRUD/page promises one I/O turn to start the next real page.
    // This is request completion synchronization, not a timed delay or HTTP retry.
    await new Promise<void>((resolve) => setImmediate(resolve));
  } while (fixture.pendingRequests.size > 0);
  if (failures.length) throw failures[0];
}

/**
 * 职责：消费真实localhost响应，不依赖测试场景之外的空闲连接复用
 * @param fixture 当前独占夹具
 * @param method 已检查的 GET 或名称 PUT
 * @param route 已检查的用户路径
 * @param body 已检查的原样表单字段
 * @returns 真实HTTP响应数据
 * @throws 真实网络、业务或安全字段边界错误，既不替换响应也不重试
 */
async function fetchAccountNameResponse<T>(
  fixture: AccountNameFixture,
  method: string,
  route: string,
  body?: NameEdit,
): Promise<T> {
  const response = await fetch(`${fixture.baseURL}/api/v1${route}`, {
    method,
    headers: {
      authorization: `Bearer ${fixture.token}`,
      "content-type": "application/json",
      connection: "close",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  fixture.responses.push({ method, route, status: response.status });
  if (!response.ok) throw new Error("真实合成用户 API 保存失败");
  const rows = Array.isArray(result.data?.items)
    ? result.data.items
    : [result.data];
  const safeFields = [
    "id",
    "username",
    "name",
    "role",
    "avatar",
    "isActive",
    "lastLoginAt",
    "createdAt",
    "updatedAt",
  ];
  if (
    rows.some(
      (row: Record<string, unknown>) =>
        !row || Object.keys(row).some((key) => !safeFields.includes(key)),
    )
  ) {
    throw new Error(
      "User API returned fields outside the safe name-only boundary",
    );
  }
  return result as T;
}

/**
 * 职责：独立只读连接只查询当前普通用户的显式安全字段
 * @param fixture 当前独占夹具
 * @param id 当前合成普通用户 ID
 * @returns SQLite 安全字段快照，启用状态为 0/1
 * @throws 目标越界、查询超时或解析失败
 */
export function readAccountName(
  fixture: AccountNameFixture,
  id: string,
): Omit<Identity, "isActive"> & { isActive: 0 | 1; updatedAt: number } {
  if (![fixture.first.id, fixture.later.id].includes(id))
    throw new Error("Readback target must be a synthetic ordinary user");
  const script = `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
row=c.execute('SELECT id,username,name,role,isActive,updatedAt FROM users WHERE id=?',(sys.argv[2],)).fetchone()
print(json.dumps(dict(row)))
c.close()`;
  return JSON.parse(
    execFileSync(
      "python3",
      ["-c", script, path.join(fixture.directory, "synthetic.db"), id],
      { encoding: "utf8", timeout: 10000 },
    ),
  );
}

/**
 * 职责：安装或解除当前私有数据库的名称更新故障，保留真实 API 失败路径
 * @param fixture 当前独占夹具
 * @param id 合成普通目标 ID；省略时解除故障
 * @returns 无返回值
 * @throws 目标越界或故障安装失败
 */
export function setAccountNameFault(fixture: AccountNameFixture, id?: string) {
  const script = `import sqlite3,sys
c=sqlite3.connect(sys.argv[1])
c.execute('DROP TRIGGER IF EXISTS synthetic_name_failure')
if len(sys.argv)>2:
 c.execute("CREATE TRIGGER synthetic_name_failure BEFORE UPDATE OF name ON users WHEN NEW.id='"+sys.argv[2]+"' BEGIN SELECT RAISE(ABORT,'synthetic name update failure'); END")
c.commit()
c.close()`;
  if (
    id &&
    (!/^[a-z0-9]+$/.test(id) ||
      ![fixture.first.id, fixture.later.id].includes(id))
  )
    throw new Error("Fault target must be a synthetic ordinary user");
  execFileSync(
    "python3",
    [
      "-c",
      script,
      path.join(fixture.directory, "synthetic.db"),
      ...(id ? [id] : []),
    ],
    { timeout: 10000 },
  );
}
