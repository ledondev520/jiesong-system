#!/usr/bin/env node
/**
 * SQLite → PostgreSQL 数据迁移脚本
 * Input: backend/prisma/dev.db (SQLite)
 * Output: 目标 PostgreSQL 数据库
 * Pos: 一次性数据迁移工具，用于本地开发数据同步到线上
 *
 * 用法:
 *   1. 配置目标 PostgreSQL 数据库 URL:
 *      export TARGET_DATABASE_URL="postgresql://..."
 *   2. 运行迁移:
 *      node scripts/migrate-sqlite-to-postgres.js
 */

const { PrismaClient: PrismaClientSQLite } = require('../backend/node_modules/@prisma/client');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ========== 配置 ==========
const SQLITE_DB_PATH = path.resolve(__dirname, '../backend/prisma/dev.db');
const TARGET_DB_URL = process.env.TARGET_DATABASE_URL;

if (!TARGET_DB_URL) {
  console.error('❌ 错误: 请设置环境变量 TARGET_DATABASE_URL');
  console.error('   示例: export TARGET_DATABASE_URL="postgresql://user:pass@host:5432/db"');
  process.exit(1);
}

if (!fs.existsSync(SQLITE_DB_PATH)) {
  console.error(`❌ 错误: SQLite 数据库不存在: ${SQLITE_DB_PATH}`);
  process.exit(1);
}

// ========== 步骤 1: 备份 SQLite 数据库 ==========
const backupPath = `${SQLITE_DB_PATH}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
console.log(`📦 备份 SQLite 数据库到: ${backupPath}`);
fs.copyFileSync(SQLITE_DB_PATH, backupPath);

// ========== 步骤 2: 生成 PostgreSQL schema ==========
console.log('\n🔧 生成 PostgreSQL Prisma schema...');

const prismaSchemaPath = path.resolve(__dirname, '../backend/prisma/schema.prisma');
const schemaContent = fs.readFileSync(prismaSchemaPath, 'utf8');

// 创建临时 PostgreSQL schema
const pgSchema = schemaContent.replace(
  /datasource db\s*\{[\s\S]*?\}/,
  `datasource db {
  provider = "postgresql"
  url      = env("TARGET_DATABASE_URL")
}`
);

const tempSchemaPath = path.resolve(__dirname, '../backend/prisma/schema.postgres.prisma');
fs.writeFileSync(tempSchemaPath, pgSchema);

// ========== 步骤 3: 在 PostgreSQL 中创建表 ==========
console.log('\n🏗️  在 PostgreSQL 中创建表结构...');
try {
  execSync(
    `cd ${path.resolve(__dirname, '../backend')} && npx prisma db push --schema=${tempSchemaPath} --accept-data-loss`,
    {
      env: { ...process.env, DATABASE_URL: TARGET_DB_URL },
      stdio: 'inherit',
    }
  );
} catch (e) {
  console.error('❌ 创建表结构失败');
  process.exit(1);
}

// ========== 步骤 4: 连接 SQLite 并读取数据 ==========
console.log('\n📊 连接 SQLite 数据库...');

// 临时修改 SQLite 的 schema 路径
const sqliteSchemaPath = path.resolve(__dirname, '../backend/prisma/schema.sqlite.prisma');
const sqliteSchema = schemaContent.replace(
  /datasource db\s*\{[\s\S]*?\}/,
  `datasource db {
  provider = "sqlite"
  url      = "file:${SQLITE_DB_PATH}"
}`
);
fs.writeFileSync(sqliteSchemaPath, sqliteSchema);

// 生成临时的 SQLite Prisma Client
const sqliteClient = new PrismaClientSQLite({
  datasources: { db: { url: `file:${SQLITE_DB_PATH}` } },
});

// ========== 步骤 5: 连接 PostgreSQL ==========
console.log('\n🐘 连接 PostgreSQL 数据库...');
const { PrismaClient: PrismaClientPG } = require('../backend/node_modules/@prisma/client');
const pgClient = new PrismaClientPG({
  datasources: { db: { url: TARGET_DB_URL } },
});

// ========== 步骤 6: 定义迁移顺序（处理外键依赖） ==========
const migrationOrder = [
  'User',
  'Supplier',
  'Customer',
  'Product',
  'ProductSupplier',
  'Port',
  'Category',
  'CustomsCompany',
  'PurchaseContract',
  'PurchaseContractItem',
  'PurchasePayment',
  'SalesContract',
  'SalesContractItem',
  'PackingList',
  'PackingListItem',
  'Container',
  'ContainerItem',
  'Inventory',
  'InventoryMovement',
  'BankAccount',
  'BankTransaction',
  'Invoice',
  'InvoiceItem',
  'Payment',
  'PaymentAllocation',
  'TaxRate',
  'TaxRefund',
  'CustomsDeclaration',
  'ForexVerification',
  'ProcurementTemplate',
  'ProcurementTemplateItem',
  'Notification',
  'SystemConfig',
  'AiUsageLog',
  'SalesContractFile',
  'AgentAccount',
  'AgentCredential',
  'ReconciliationRecord',
  'MatchRecord',
];

// ========== 步骤 7: 执行数据迁移 ==========
async function migrate() {
  console.log('\n🚀 开始数据迁移...\n');

  const stats = { success: 0, failed: 0, skipped: 0, errors: [] };

  for (const modelName of migrationOrder) {
    try {
      // 检查 SQLite 中是否有这个表
      const count = await sqliteClient[modelName.toLowerCase()]?.count().catch(() => 0);
      if (count === undefined || count === 0) {
        console.log(`  ⏭️  ${modelName}: 无数据，跳过`);
        stats.skipped++;
        continue;
      }

      console.log(`  📥 ${modelName}: ${count} 条记录...`);

      // 分批读取和写入（避免内存溢出）
      const batchSize = 500;
      let processed = 0;

      while (processed < count) {
        const records = await sqliteClient[modelName.toLowerCase()].findMany({
          skip: processed,
          take: batchSize,
        });

        if (records.length === 0) break;

        // 处理 PostgreSQL 不兼容的数据类型
        const cleanedRecords = records.map((record) => {
          const cleaned = { ...record };
          // 移除 SQLite 自增 ID（PostgreSQL 会自动生成）
          if (cleaned.id && typeof cleaned.id === 'number') {
            // 保留原始 ID 字符串格式
            cleaned.id = String(cleaned.id);
          }
          // 处理 DateTime 字段
          for (const [key, value] of Object.entries(cleaned)) {
            if (value instanceof Date) {
              cleaned[key] = value.toISOString();
            }
          }
          return cleaned;
        });

        await pgClient[modelName.toLowerCase()].createMany({
          data: cleanedRecords,
          skipDuplicates: true,
        });

        processed += records.length;
      }

      console.log(`  ✅ ${modelName}: ${processed}/${count} 条迁移成功`);
      stats.success++;
    } catch (error) {
      console.error(`  ❌ ${modelName}: 迁移失败 - ${error.message}`);
      stats.failed++;
      stats.errors.push({ model: modelName, error: error.message });
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('📋 迁移结果汇总:');
  console.log(`   ✅ 成功: ${stats.success} 个表`);
  console.log(`   ❌ 失败: ${stats.failed} 个表`);
  console.log(`   ⏭️  跳过: ${stats.skipped} 个表`);

  if (stats.errors.length > 0) {
    console.log('\n⚠️  失败的表:');
    stats.errors.forEach((e) => console.log(`   - ${e.model}: ${e.error}`));
  }

  // 清理临时文件
  console.log('\n🧹 清理临时文件...');
  fs.unlinkSync(tempSchemaPath);
  fs.unlinkSync(sqliteSchemaPath);

  console.log('\n✨ 迁移完成！');
  console.log(`   SQLite 备份: ${backupPath}`);
}

migrate()
  .catch((e) => {
    console.error('\n💥 迁移过程出错:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await sqliteClient.$disconnect();
    await pgClient.$disconnect();
  });
