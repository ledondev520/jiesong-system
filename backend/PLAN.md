# Tax Refund Migration Plan

## Goal
完成退税模块数据库演进：在 Prisma schema 中新增 `CustomsDeclaration`、`CustomsDeclarationItem`、`ForexVerification`、`TaxRefund`、`TaxRate` 五张表，并生成可执行迁移与 Prisma Client。

## Scope
- 修改 `prisma/schema.prisma`
- 生成 Prisma migration
- 执行 `prisma generate`
- 记录本轮风险、指标与交付物

## Milestones
1. 读取现有 schema 与领域文档，确认新增表与现有 `SalesContract` / `Product` / `PackingItem` 的关联。
2. 以最小兼容改动扩展 Prisma models，保留现有 `customsBroker` / `hasTaxRefund` 字段不回收。
3. 执行 `prisma validate`、`prisma migrate dev`、`prisma generate`，若失败则就地修复。
4. 更新任务台账、风险台账、指标台账，并输出结果与 patch。

## Design Basis
- 当前仓库中未找到名为 “export tax refund analysis / 出口退税分析” 的独立文档。
- 本轮以 `../docs/数据库设计.md` 中现有出口合同/报关记录结构为基础，向独立退税子模块做最小一致化拆分。

## Risks
- 若隐藏设计稿未纳入仓库，本轮字段命名需以现有领域模型推断，后续可能需要二次对齐。
- 当前数据源为 SQLite，本轮表结构避免引入 Prisma enum / Decimal 等高迁移成本类型。

## Verification
- `npx prisma validate`
- `npx prisma migrate dev --name add_tax_refund_module`
- `npx prisma generate`

## Execution Outcome
- 已新增 5 个 Prisma models，并在既有 `SalesContract` / `Product` / `PackingItem` 上补齐关系。
- 因本地 `prisma/dev.db` 早已有表但无 migration 历史，先建立 baseline migration，再生成本轮增量 migration，避免重置开发库。
- 验证已完成：`prisma validate`、`prisma migrate dev --name add_tax_refund_module`、`prisma generate`、以及退税模块定向服务测试。

## 2026-03-08 Round 2: HSCode Migration + Seed

### Goal
完成 HSCode 数据库演进：确认 `HsCode` Prisma 模型、生成并执行 `add_hs_codes_table` migration，新增 `backend/scripts/seed-hscodes.js` 并导入 100 条示例数据。

### Scope
- 校正 `prisma/schema.prisma` 中 `HsCode` 模型定义
- 执行/落地 `prisma migrate dev --name add_hs_codes_table`
- 新增 HSCode 种子脚本与 100 条示例数据
- 更新本轮风险、指标、结果与 patch 台账

### Milestones
1. 复核现有 `HsCode` schema、迁移目录与工作区差异，避免覆盖未确认改动。
2. 以最小约束补齐种子脚本测试，先验证数据条数/唯一性/字段完整性。
3. 完成种子脚本实现，并执行 Prisma 迁移与 client 生成。
4. 运行脚本写入 100 条示例数据，记录结果与验证证据。

### Risks
- 工作区已存在未提交的 `HsCode` 相关测试与 migration 目录，本轮只做对齐与补完，不回退未知来源改动。
- SQLite 不支持真正的全文索引；`productName` 本轮以普通索引落地，对应服务层仍使用 `contains` 搜索。
- 若本地数据库已提前存在 `hs_codes` 表，`prisma migrate dev` 可能转为仅标记/应用已有迁移，需要以命令输出为准记录状态。

### Verification
- `node --test scripts/seed-hscodes.test.js`
- `npx prisma validate`
- `npx prisma migrate dev --name add_hs_codes_table`
- `npx prisma generate`
- `node scripts/seed-hscodes.js`

### Execution Outcome
- 已确认 `prisma/schema.prisma` 中 `HsCode` 模型与 `prisma/migrations/20260308035256_add_hs_codes_table/migration.sql` 一致。
- 已新增 `scripts/seed-hscodes.js`，内含 100 条示例 HSCode 数据，并使用 `upsert` 保证重复执行幂等。
- 已新增 `scripts/seed-hscodes.test.js`，对数据条数、编码唯一性与字段完整性做最小约束。
- 验证已完成：`node --test scripts/seed-hscodes.test.js`、`prisma validate`、`prisma migrate dev --name add_hs_codes_table`、`prisma generate`、`node scripts/seed-hscodes.js`。

## 2026-03-08 Session 2 Goal

完成 HSCode 后端能力的第二阶段交付：
- 新增 `src/services/hsCodeService.js`
- 新增 `src/routes/hsCodes.js`
- 在 `src/routes/index.js` 挂载 `/hs-codes`
- 完成 `src/services/hsCodeService.test.js` 与 `src/routes/hsCodes.test.js` 定向验证

## Verification
- `node --test src/services/hsCodeService.test.js src/routes/hsCodes.test.js`

## Execution Outcome
- 已新增 `src/services/hsCodeService.js`，基于 `prisma.hsCode` 实现商品名模糊搜索、编码精确查询与税率提取。
- 已新增 `src/routes/hsCodes.js`，支持 `GET /search?q=keyword&limit=10` 与 `GET /:code`。
- 已在 `src/routes/index.js` 挂载 `/hs-codes`。
- 定向验证结果：`node --test src/services/hsCodeService.test.js src/routes/hsCodes.test.js` 通过。
