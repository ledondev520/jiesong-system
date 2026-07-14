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
  const dbPath = path.join(tempDir, 'test.db');
  const databaseUrl = `file:${dbPath}`;
  fs.writeFileSync(dbPath, '');

  execFileSync(PRISMA_BIN, ['db', 'push', '--schema', SCHEMA_PATH, '--skip-generate'], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

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

test('数据库 schema 可推送并包含核心数据表', async (t) => {
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
