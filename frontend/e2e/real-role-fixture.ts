/**
 * Input: Test-only role scenarios, Express child process and private synthetic SQLite
 * Output: Real login/HTTP forwarding plus independent business, document, header and dashboard readback
 * Pos: Shared hosted role-browser fixture; never mocks business responses
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

export type Role = "PURCHASE" | "WAREHOUSE" | "SALES" | "BOSS" | "FINANCE";
type Scenario =
  | "purchase"
  | "warehouse"
  | "sales"
  | "boss"
  | "receipt-pool"
  | "notification-state"
  | "tax-record-forms"
  | "menu-export-documents"
  | "sales-header"
  | "dashboard-sources";
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
  exportDocuments?: { packingItemId: string };
  salesHeader?: { originalPortId: string; nextPortId: string };
  dashboardSources?: {
    riskId: string;
    riskNo: string;
    taskId: string;
    taskNo: string;
    purchaseNo: string;
    latestPeriodLabel: string;
  };
  receiptPool?: {
    usdReceiptId: string;
    cnyReceiptId: string;
    contracts: { id: string; contractNo: string; totalAmount: number }[];
  };
  taxRecords?: {
    customsId: string;
    customsNo: string;
    refundId: string;
    refundNo: string;
    contractId: string;
    contractNo: string;
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
export interface TaxRecordSnapshot {
  customs: {
    id: string;
    declarationNo: string;
    salesContractId: string;
    status: string;
    note: string;
    declaredAt: number | null;
    exportDate: number | null;
    totalAmount: number;
    totalQuantity: number;
  }[];
  items: {
    id: string;
    customsDeclarationId: string;
    productId: string;
    customsName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    declarationElements: string;
  }[];
  refunds: {
    id: string;
    refundNo: string;
    salesContractId: string;
    customsDeclarationId: string;
    status: string;
    appliedAt: number;
    refundedAt: number | null;
    declaredAmount: number;
    refundableAmount: number;
    refundedAmount: number;
    note: string;
  }[];
  audit: {
    id: string;
    entity: string;
    entityId: string;
    action: string;
    userId: string | null;
  }[];
}
export interface NotificationSnapshot {
  id: string;
  userId: string;
  type: string;
  title: string;
  content: string | null;
  link: string | null;
  metadata: string | null;
  isRead: number;
  createdAt: number;
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

export function readPurchaseNotifications(
  fixture: RoleFixture,
): NotificationSnapshot[] {
  // Read only the synthetic PURCHASE user's own rows through a separate connection.
  const script = `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
print(json.dumps([dict(row) for row in c.execute('SELECT * FROM notifications WHERE userId=? ORDER BY id',(sys.argv[2],))]))
c.close()`;
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        script,
        path.join(fixture.directory, "synthetic.db"),
        fixture.users.PURCHASE.id,
      ],
      { encoding: "utf8", timeout: 10000 },
    ),
  ) as NotificationSnapshot[];
}

export function readTaxRecords(fixture: RoleFixture): TaxRecordSnapshot {
  // Full ordinary record rows and audit evidence from independent read-only SQLite.
  const script = `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
queries={
'customs':'SELECT * FROM customs_declarations ORDER BY id',
'items':'SELECT * FROM customs_declaration_items ORDER BY id',
'refunds':'SELECT * FROM tax_refunds ORDER BY id',
'audit':"SELECT * FROM operation_logs WHERE entity IN ('CustomsDeclaration','TaxRefund') ORDER BY id"}
print(json.dumps({key:[dict(row) for row in c.execute(query)] for key,query in queries.items()}))
c.close()`;
  return JSON.parse(
    execFileSync(
      "python3",
      ["-c", script, path.join(fixture.directory, "synthetic.db")],
      { encoding: "utf8", timeout: 10000 },
    ),
  ) as TaxRecordSnapshot;
}

export type ExportDocumentSnapshot = Record<
  string,
  Record<string, string | number | null>[]
>;
/**
 * 职责：独立只读核对菜单生成单据、装箱资料和归档版本
 * @param fixture 当前验收独占的私有 SQLite 夹具
 * @returns 按表名组织的完整业务行快照
 * @throws SQLite 读取失败、子进程超时或 JSON 解析失败
 */
export function readExportDocuments(
  fixture: RoleFixture,
): ExportDocumentSnapshot {
  // Independent read-only rows, including archived versions, never an API echo.
  const script = `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=['sales_contracts','packing_items','customs_declarations','customs_declaration_items','forex_verifications','tax_refunds','contract_files','sales_contract_files']
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM '+table+' ORDER BY id')] for table in tables}))
c.close()`;
  return JSON.parse(
    execFileSync(
      "python3",
      ["-c", script, path.join(fixture.directory, "synthetic.db")],
      { encoding: "utf8", timeout: 10000 },
    ),
  ) as ExportDocumentSnapshot;
}

/**
 * 职责：独立只读核对合同头与不应变化的金额、装箱、采购、库存、付款及单据事实
 * @param fixture 当前验收独占的私有 SQLite 夹具
 * @returns 完整业务行及合同头审计快照
 * @throws SQLite 读取失败、子进程超时或 JSON 解析失败
 */
export function readSalesHeader(fixture: RoleFixture): ExportDocumentSnapshot {
  const script = `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=['sales_contracts','sales_items','packing_items','inventories','payments','purchase_contracts','purchase_items','customs_declarations','customs_declaration_items','forex_verifications','tax_refunds','contract_files','sales_contract_files']
result={table:[dict(row) for row in c.execute('SELECT * FROM '+table+' ORDER BY id')] for table in tables}
result['audit']=[dict(row) for row in c.execute("SELECT * FROM operation_logs WHERE entity='SalesContract' ORDER BY id")]
print(json.dumps(result))
c.close()`;
  return JSON.parse(
    execFileSync(
      "python3",
      ["-c", script, path.join(fixture.directory, "synthetic.db")],
      { encoding: "utf8", timeout: 10000 },
    ),
  ) as ExportDocumentSnapshot;
}

/**
 * 职责：独立只读核对工作台全部业务来源，排除登录账号及认证审计元数据。
 * @param fixture 当前验收独占的私有迁移 SQLite 夹具
 * @returns 业务表、目录、账期及业务审计的完整行快照
 * @throws SQLite 读取失败、子进程超时或 JSON 解析失败
 */
export function readDashboardSources(
  fixture: RoleFixture,
): ExportDocumentSnapshot {
  const script = `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=[row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('_prisma_migrations','users','browser_sessions','operation_logs') ORDER BY name")]
result={table:[dict(row) for row in c.execute('SELECT * FROM "'+table+'" ORDER BY rowid')] for table in tables}
result['business_audit']=[dict(row) for row in c.execute("SELECT * FROM operation_logs WHERE entity NOT IN ('Auth','User') ORDER BY id")]
print(json.dumps(result))
c.close()`;
  return JSON.parse(
    execFileSync(
      "python3",
      ["-c", script, path.join(fixture.directory, "synthetic.db")],
      { encoding: "utf8", timeout: 10000 },
    ),
  ) as ExportDocumentSnapshot;
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
