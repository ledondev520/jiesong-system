#!/usr/bin/env node
/**
 * Input: SQLite 数据库 (prisma/dev.db)
 * Output: PostgreSQL 数据导入 SQL 文件
 * Pos: 本地开发数据迁移到线上 PostgreSQL
 *
 * 使用方法:
 *   1. 设置 PostgreSQL 环境变量
 *   2. node scripts/migrate-sqlite-to-postgres.js
 *   3. 生成的 SQL 文件通过 psql 执行
 */

const sqlite3 = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const SQLITE_DB = process.env.SQLITE_DB || path.join(__dirname, '../prisma/dev.db');
const OUTPUT_SQL = process.env.OUTPUT_SQL || path.join(__dirname, '../prisma/migration-to-postgres.sql');

// SQLite → PostgreSQL 类型映射
const typeMap = {
  INTEGER: (v) => v,
  REAL: (v) => v,
  TEXT: (v) => v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`,
  BLOB: (v) => v === null ? 'NULL' : `'${Buffer.from(v).toString('base64')}'`,
  NUMERIC: (v) => v,
  BOOLEAN: (v) => v === 1 ? 'true' : v === 0 ? 'false' : 'NULL',
  DATETIME: (v) => v === null ? 'NULL' : `'${v}'`,
};

function detectType(columnName, value) {
  if (value === null) return 'TEXT';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return 'INTEGER';
    return 'REAL';
  }
  if (typeof value === 'string') {
    // 检测是否是日期时间格式
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(value)) return 'DATETIME';
    // 检测是否是布尔值
    if (value === 'true' || value === 'false') return 'BOOLEAN';
    return 'TEXT';
  }
  if (Buffer.isBuffer(value)) return 'BLOB';
  return 'TEXT';
}

function formatValue(value, detectedType) {
  if (value === null) return 'NULL';
  const formatter = typeMap[detectedType] || typeMap.TEXT;
  return formatter(value);
}

function main() {
  console.log('🚀 开始 SQLite → PostgreSQL 数据迁移');
  console.log(`SQLite: ${SQLITE_DB}`);
  console.log(`Output: ${OUTPUT_SQL}`);

  if (!fs.existsSync(SQLITE_DB)) {
    console.error(`❌ SQLite 数据库不存在: ${SQLITE_DB}`);
    process.exit(1);
  }

  const db = new sqlite3(SQLITE_DB, { readonly: true });
  const lines = [];

  // 禁用外键检查（导入时）
  lines.push('-- 迁移脚本由 migrate-sqlite-to-postgres.js 生成');
  lines.push(`-- 生成时间: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('SET session_replication_role = replica; -- 禁用触发器和外键检查');
  lines.push('');

  // 获取所有表
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_migrations' ORDER BY name"
  ).all();

  for (const { name: tableName } of tables) {
    console.log(`📦 处理表: ${tableName}`);

    // 获取列信息
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    const columnNames = columns.map((c) => c.name);

    // 获取数据
    const rows = db.prepare(`SELECT * FROM "${tableName}"`).all();
    console.log(`   记录数: ${rows.length}`);

    if (rows.length === 0) {
      lines.push(`-- 表 ${tableName} 无数据，跳过`);
      lines.push('');
      continue;
    }

    // 清空表并导入
    lines.push(`-- 表: ${tableName}`);
    lines.push(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE;`);

    // 批量生成 INSERT
    const batchSize = 100;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const values = batch.map((row) => {
        const vals = columnNames.map((col) => {
          const val = row[col];
          const detectedType = detectType(col, val);
          return formatValue(val, detectedType);
        });
        return `(${vals.join(', ')})`;
      });

      lines.push(`INSERT INTO "${tableName}" (${columnNames.map((c) => `"${c}"`).join(', ')}) VALUES`);
      lines.push(values.join(',\n'));
      lines.push(';');
    }

    lines.push('');
  }

  // 恢复外键检查
  lines.push('SET session_replication_role = DEFAULT;');
  lines.push('');
  lines.push('-- 迁移完成');

  fs.writeFileSync(OUTPUT_SQL, lines.join('\n'));

  db.close();

  console.log('');
  console.log('✅ 迁移 SQL 文件生成完成！');
  console.log(`文件路径: ${OUTPUT_SQL}`);
  console.log('');
  console.log('使用方法:');
  console.log('  1. 确保 PostgreSQL 数据库已创建（prisma db push）');
  console.log('  2. 执行: psql -U jiesong -d jiesong -f prisma/migration-to-postgres.sql');
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
