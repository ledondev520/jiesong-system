/**
 * Input: Prisma schema、seed 脚本、临时 SQLite 数据库
 * Output: 数据库集成测试结果（schema 可创建、事务可回滚、seed 幂等）
 * Pos: 后端数据库集成测试入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');

const BACKEND_ROOT = path.resolve(__dirname, '../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma', 'schema.prisma');
const PRISMA_BIN = path.join(
  BACKEND_ROOT,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'prisma.cmd' : 'prisma',
);

function createTempDatabase(t, prefix) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `jiesong-${prefix}-`));
  fs.chmodSync(tempDir, 0o700);
  const dbPath = path.join(tempDir, 'test.db');
  const databaseUrl = `file:${dbPath}`;
  // 仅从 schema 生成空结构，绝不运行 db push 或连接已有业务库。
  const ddl = execFileSync(PRISMA_BIN, ['migrate', 'diff', '--from-empty', '--to-schema-datamodel', SCHEMA_PATH, '--script'], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: 'utf8',
  });
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', dbPath], { input: ddl });
  fs.chmodSync(dbPath, 0o600);

  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  return { databaseUrl };
}

function createPrisma(databaseUrl) {
  return new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
    },
  });
}

function runSeed(databaseUrl, adminPassword) {
  execFileSync(process.execPath, ['prisma/seed.js'], {
    cwd: BACKEND_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DEFAULT_ADMIN_PASSWORD: adminPassword,
    },
    stdio: 'pipe',
  });
}

async function readSeedSnapshot(databaseUrl) {
  const prisma = createPrisma(databaseUrl);
  try {
    const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
    const ports = await prisma.port.findMany({ select: { code: true }, orderBy: { code: 'asc' } });
    const configs = await prisma.systemConfig.findMany({ select: { key: true }, orderBy: { key: 'asc' } });

    return {
      admin,
      adminCount: await prisma.user.count({ where: { username: 'admin' } }),
      portCount: await prisma.port.count(),
      configCount: await prisma.systemConfig.count(),
      portCodes: ports.map((item) => item.code),
      configKeys: configs.map((item) => item.key),
    };
  } finally {
    await prisma.$disconnect();
  }
}

test('空数据库可创建并包含核心数据表', async (t) => {
  const { databaseUrl } = createTempDatabase(t, 'schema');
  const prisma = createPrisma(databaseUrl);
  t.after(async () => prisma.$disconnect());

  const rows = await prisma.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table'");
  const tableNames = rows.map((row) => row.name);

  [
    'users',
    'ports',
    'products',
    'purchase_contracts',
    'sales_contracts',
    'system_configs',
    'financial_evidence_documents',
    'financial_evidence_sheets',
    'financial_evidence_rows',
  ].forEach((name) => {
    assert.equal(tableNames.includes(name), true, `缺少核心表: ${name}`);
  });
});

test('数据库事务异常时可正确回滚', async (t) => {
  const { databaseUrl } = createTempDatabase(t, 'tx');
  const prisma = createPrisma(databaseUrl);
  t.after(async () => prisma.$disconnect());

  await assert.rejects(
    prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          username: 'tx-rollback-user',
          password: 'hashed-password',
          name: '事务回滚用户',
          role: 'SALES',
        },
      });
      throw new Error('force rollback');
    }),
    /force rollback/,
  );

  const count = await prisma.user.count({ where: { username: 'tx-rollback-user' } });
  assert.equal(count, 0);
});

test('seed 脚本重复执行保持幂等且可更新管理员密码', async (t) => {
  const { databaseUrl } = createTempDatabase(t, 'seed');

  runSeed(databaseUrl, 'SeedAdminPass#1');
  const first = await readSeedSnapshot(databaseUrl);

  assert.ok(first.admin);
  assert.equal(await bcrypt.compare('SeedAdminPass#1', first.admin.password), true);
  assert.equal(first.adminCount, 1);
  assert.equal(first.portCount, 3);
  assert.equal(first.configCount, 4);
  assert.deepEqual(first.portCodes, ['LA', 'MI', 'OAK']);
  assert.deepEqual(first.configKeys, ['containerPrefix', 'contractPrefix', 'exchangeRate', 'profitRate']);

  runSeed(databaseUrl, 'SeedAdminPass#2');
  const second = await readSeedSnapshot(databaseUrl);

  assert.ok(second.admin);
  assert.equal(await bcrypt.compare('SeedAdminPass#2', second.admin.password), true);
  assert.equal(second.adminCount, first.adminCount);
  assert.equal(second.portCount, first.portCount);
  assert.equal(second.configCount, first.configCount);
  assert.deepEqual(second.portCodes, first.portCodes);
  assert.deepEqual(second.configKeys, first.configKeys);
});
