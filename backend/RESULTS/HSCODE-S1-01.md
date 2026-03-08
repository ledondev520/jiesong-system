# HSCODE-S1-01 Result

## Delivery
- 确认 `prisma/schema.prisma` 中已存在 `HsCode` 模型，字段为：
  - `id`
  - `hsCode`
  - `productName`
  - `taxRate`
  - `unit`
  - `note`
  - `effectiveDate`
- 确认现有 migration `prisma/migrations/20260308035256_add_hs_codes_table/migration.sql` 与 schema 一致：
  - `hsCode` 唯一索引
  - `productName` 普通索引
- 新增 `scripts/seed-hscodes.js`
  - 提供 100 条示例 HSCode 数据
  - 使用 `upsert` 幂等导入
- 新增 `scripts/seed-hscodes.test.js`
  - 约束样例数、编码唯一性与字段完整性

## Verification
- `node --test scripts/seed-hscodes.test.js` => 1/1 pass
- `npx prisma validate` => pass
- `npx prisma migrate status` => `Database schema is up to date!`
- `npx prisma migrate dev --name add_hs_codes_table` => `Already in sync, no schema change or pending migration was found.`
- `npx prisma generate` => pass
- `node scripts/seed-hscodes.js` => pass，处理 100 条示例数据
- `node -e ... prisma.hsCode.count({ where: { hsCode: { in: sampleHsCodes.map(...) } } })` => 100

## Notes
- 当前本地库 `hs_codes` 总量为 200，不全是本轮样例；本轮已确认目标 100 个示例编码全部存在。
- SQLite 不支持真正全文索引，本轮 `productName` 采用普通索引，满足当前 `contains` 搜索实现。
