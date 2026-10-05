/** Hosted-runner fixture only; forwards to real isolated HTTP, never mocks API results. */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export type Role = "PURCHASE" | "WAREHOUSE" | "SALES" | "BOSS" | "FINANCE";
type Scenario = "purchase" | "warehouse" | "sales" | "boss" | "receipt-pool";
export const testPassword = "test-only-role-browser-password-never-production";
export interface RoleFixture {
  server: ChildProcess;
  directory: string;
  baseURL: string;
  purchaseId: string;
  purchaseItemId: string;
  productId: string;
  receiptId?: string;
  receiptItemId?: string;
  salesId?: string;
  salesNo?: string;
  receiptPool?: {
    usdReceiptId: string;
    cnyReceiptId: string;
    contracts: { id: string; contractNo: string; totalAmount: number }[];
  };
  users: Record<Role, { id: string; username: string }>;
}

export interface ReceiptPoolSnapshot {
  payments: {
    id: string;
    type: string;
    sourcePaymentId: string | null;
    salesContractId: string | null;
    amount: number;
    currency: string;
    customerName: string | null;
    paymentMethod: string | null;
    paymentDate: number;
    note: string | null;
  }[];
  contracts: {
    id: string;
    contractNo: string;
    totalAmount: number;
    receivedAmount: number;
  }[];
}
export interface DomainSnapshot {
  purchases: { id: string; status: string }[];
  sales: { id: string; status: string; shippedAt: string | null }[];
  receipts: { id: string; createdById: string; note: string | null }[];
  receiptItems: {
    id: string;
    arrivedQuantity: number;
    acceptedQuantity: number;
    reinspectionQuantity: number;
  }[];
  inspections: {
    id: string;
    receiptItemId: string;
    inspectedById: string;
    acceptedQuantity: number;
    acceptedIncrement: number;
    pendingQuantity: number;
    reinspectionQuantity: number;
    note: string;
  }[];
  inventory: {
    id: string;
    quantity: number;
    status: string;
    purchaseItemId: string;
    receiptInspectionId: string;
    salesContractId: string | null;
    outboundAt: string | null;
  }[];
}

export async function startRoleFixture(
  scenario: Scenario,
): Promise<RoleFixture> {
  const directory = mkdtempSync(
    path.join(tmpdir(), "jiesong-role-browser-e2e-"),
  );
  chmodSync(directory, 0o700);
  const server = spawn(
    process.execPath,
    [path.resolve("../backend/src/testHelpers/role-browser-server.js")],
    {
      // Do not inherit production/provider credentials or database configuration.
      env: {
        PATH: process.env.PATH,
        TMPDIR: tmpdir(), // The child validates its directory against the same temporary root.
        TZ: "UTC",
        NODE_ENV: "test",
        ROLE_BROWSER_TEST_DIR: directory,
        ROLE_BROWSER_TEST_SCENARIO: scenario,
      },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  try {
    const metadata = await new Promise<
      Omit<RoleFixture, "server" | "directory">
    >((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Synthetic role backend startup timed out"));
      }, 40000);
      const finish = () => clearTimeout(timeout);
      server.once("message", (message) => {
        finish();
        resolve(message as Omit<RoleFixture, "server" | "directory">);
      });
      server.once("error", (error) => {
        finish();
        reject(error);
      });
      server.once("exit", () => {
        finish();
        reject(new Error("Synthetic role backend exited before startup"));
      });
    });
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(metadata.baseURL)) {
      throw new Error("Synthetic role backend must bind IPv4 loopback");
    }
    return { server, directory, ...metadata };
  } catch (error) {
    await stopRoleFixture({ server, directory });
    throw error;
  }
}

export async function stopRoleFixture(
  fixture: Pick<RoleFixture, "server" | "directory">,
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

export function readDomain(fixture: RoleFixture): DomainSnapshot {
  // Separate read-only SQLite connection, not an API echo or mutable test endpoint.
  const script = `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
queries={
'purchases':'SELECT id,status FROM purchase_contracts ORDER BY id',
'sales':'SELECT id,status,shippedAt FROM sales_contracts ORDER BY id',
'receipts':'SELECT id,createdById,note FROM purchase_receipts ORDER BY id',
'receiptItems':'SELECT id,arrivedQuantity,acceptedQuantity,reinspectionQuantity FROM purchase_receipt_items ORDER BY id',
'inspections':'SELECT id,receiptItemId,inspectedById,acceptedQuantity,acceptedIncrement,pendingQuantity,reinspectionQuantity,note FROM purchase_receipt_inspections ORDER BY id',
'inventory':'SELECT id,quantity,status,purchaseItemId,receiptInspectionId,salesContractId,outboundAt FROM inventories ORDER BY id'}
print(json.dumps({key:[dict(row) for row in c.execute(query)] for key,query in queries.items()}))
c.close()`;
  return JSON.parse(
    execFileSync(
      "python3",
      ["-c", script, path.join(fixture.directory, "synthetic.db")],
      { encoding: "utf8", timeout: 10000 },
    ),
  ) as DomainSnapshot;
}

export function readReceiptPool(fixture: RoleFixture): ReceiptPoolSnapshot {
  // Real independent read-only SQLite evidence, never a mutable test endpoint.
  const script = `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
queries={
'payments':'SELECT id,type,sourcePaymentId,salesContractId,amount,currency,customerName,paymentMethod,paymentDate,note FROM payments ORDER BY id',
'contracts':'SELECT id,contractNo,totalAmount,receivedAmount FROM sales_contracts ORDER BY contractNo'}
print(json.dumps({key:[dict(row) for row in c.execute(query)] for key,query in queries.items()}))
c.close()`;
  return JSON.parse(
    execFileSync(
      "python3",
      ["-c", script, path.join(fixture.directory, "synthetic.db")],
      { encoding: "utf8", timeout: 10000 },
    ),
  ) as ReceiptPoolSnapshot;
}

export async function forwardRealApi(page: Page, fixture: RoleFixture) {
  await page.route("**/api/v1/**", async (route) => {
    const original = new URL(route.request().url());
    if (original.origin !== "http://127.0.0.1:3004") {
      throw new Error("Role acceptance refuses a non-fixture API origin");
    }
    const response = await route.fetch({
      url: `${fixture.baseURL}${original.pathname}${original.search}`,
      maxRedirects: 0,
    });
    await route.fulfill({ response });
  });
}

export async function loginAs(page: Page, fixture: RoleFixture, role: Role) {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("用户名或邮箱").fill(fixture.users[role].username);
  await page.getByLabel("密码", { exact: true }).fill(testPassword);
  const login = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/auth/login" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "登录", exact: true }).click();
  const response = await login;
  expect(response.status()).toBe(200);
  const data = (await response.json()).data;
  expect(data.user.role).toBe(role);
  expect(data.user.id).toBe(fixture.users[role].id);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("button", { name: "用户菜单" }).first(),
  ).toBeVisible();
  return data.token as string;
}
