# Tax Refund Migration Metrics

## 2026-03-07 Round 1

### Baseline
- 预检：`prisma/schema.prisma` 中不存在 `CustomsDeclaration` / `CustomsDeclarationItem` / `ForexVerification` / `TaxRefund` / `TaxRate`
- 设计来源：仅定位到 `../docs/数据库设计.md` 中的嵌入式报关/退税字段，未定位到独立退税分析稿

### Pending Verification
- `npx prisma validate`
- `npx prisma migrate dev --name add_tax_refund_module`
- `npx prisma generate`

### Verification Result
- `npx prisma validate`: 通过
- `npx prisma migrate resolve --applied 20260307090000_baseline`: 通过
- `npx prisma migrate dev --name add_tax_refund_module`: 通过，生成 `prisma/migrations/20260307090001_add_tax_refund_module/migration.sql`
- `npx prisma generate`: 通过
- `node --test src/services/customsDeclarationService.test.js src/services/forexVerificationService.test.js src/services/taxRateService.test.js src/services/taxRefundService.test.js`: 20/20 通过

### Notes
- 由于当前开发库先于 migration 历史存在，未直接接受 Prisma 的 reset 提示；改为 baseline + 增量迁移的方式保留现有开发数据。

## 2026-03-08 Round 2

### Baseline
- `prisma/schema.prisma` 中已存在 `model HsCode`，待确认与迁移 SQL 一致。
- 工作区已有未提交 `prisma/migrations/20260308035256_add_hs_codes_table/`、`src/services/hsCodeService.test.js`、`src/routes/hsCodes.test.js`。
- `backend/scripts` 下尚无 `seed-hscodes.js`。

### Pending Verification
- `node --test scripts/seed-hscodes.test.js`
- `npx prisma validate`
- `npx prisma migrate dev --name add_hs_codes_table`
- `npx prisma generate`
- `node scripts/seed-hscodes.js`

### Verification Result
- `node --test scripts/seed-hscodes.test.js`: 通过（1/1）
- `npx prisma validate`: 通过
- `npx prisma migrate status`: 通过，状态为 `Database schema is up to date!`
- `npx prisma migrate dev --name add_hs_codes_table`: 通过，输出 `Already in sync, no schema change or pending migration was found.`
- `npx prisma generate`: 通过
- `node scripts/seed-hscodes.js`: 通过，脚本处理 100 条示例数据
- `node -e ... prisma.hsCode.count({ where: { hsCode: { in: sampleHsCodes.map(...) } } })`: 100，确认示例编码全部已存在

### Notes
- 当前数据库总 `hs_codes` 记录数为 200，说明本地库在本轮前已存在其他 HSCode 数据；本轮脚本以 `upsert` 导入并确认 100 条目标示例编码均已落库。

## 2026-03-08 Round 3

### Baseline
- `src/services/hsCodeService.js` 与 `src/routes/hsCodes.js` 初始不存在。
- `src/services/hsCodeService.test.js` 与 `src/routes/hsCodes.test.js` 已存在，可直接作为红灯用例。

### Verification Result
- 红灯：`node --test src/services/hsCodeService.test.js src/routes/hsCodes.test.js`
  - 结果：失败，报错 `Cannot find module './hsCodeService'` 与 `Cannot find module './hsCodes'`。
- 绿灯：`node --test src/services/hsCodeService.test.js`
  - 结果：`3/3` 通过。
- 绿灯：`node --test src/routes/hsCodes.test.js`
  - 结果：`2/2` 通过。
- 最终合并验证：`node --test src/services/hsCodeService.test.js src/routes/hsCodes.test.js`
  - 结果：`5/5` 通过。

### Notes
- API 采用“薄路由 + service”结构，未额外引入 controller，控制改动面。

## 2026-03-08 Round 4

### Verification Result
- `node --test scripts/import-hscode-live.test.js src/services/taxRefundDraftService.test.js src/controllers/taxRefundController.test.js src/routes/taxModules.test.js src/services/hsCodeService.test.js src/routes/hsCodes.test.js`: `19/19` 通过
- `npx prisma migrate dev --name extend_hs_codes_for_live_import`: 通过
- `node scripts/import-hscode-live.js`: 通过，`processed=908`、`upserted=905`
- `node -e ... prisma.hsCode.count()`: `905`

### Notes
- `hs_codes` 现已由 live JSON 全量重建，不再混用示例 seed 作为系统主查询源。
- 自动退税草稿当前按报关单粒度生成，金额来源为“明细 totalPrice × live refundRate”。

## 2026-03-08 Round 5

### Verification Result
- `node --test src/services/customsDeclarationDraftService.test.js src/controllers/customsDeclarationController.test.js src/routes/taxModules.test.js`: `8/8` 通过
- 真实自动生成报关单草稿：`created=35`、`skipped=1`
- 随后真实自动生成退税草稿：`created=9`、`skipped=9`

### Notes
- 当前跳过退税草稿的主因是 `no_rate_data`，对应 HSCode 章节尚未全部抓齐或部分商品未命中 live 税率。
- 现有数据库已经从“只有 live HSCode”推进到“已有自动生成的报关单草稿与部分退税草稿”。

## 2026-03-11 Round 6

### Baseline
- 销售导出缺失合同时在 service 层抛普通 `Error`，经统一错误处理中间件后会表现为 500。
- `dataImportService.test` 在事务路径使用真实 `tx.salesItem.create()`，导致测试命中 SQLite 外键错误。
- 沙箱环境禁止本地监听端口，因此未采用真实 socket HTTP 集成测试。

### Verification Result
- 红灯：`cd backend && node --test src/routes/sales.test.js src/services/exportService.test.js src/services/pdfExportService.test.js src/services/dataImportService.test.js`
  - 结果：导出 404 用例失败，证明现状不满足要求。
- 绿灯：`cd backend && node --test src/routes/sales.test.js src/services/exportService.test.js src/services/pdfExportService.test.js src/services/dataImportService.test.js`
  - 结果：`12/12` 通过。

### Notes
- 销售导出路由验证改为直接调用 route handler，并断言其向 `next` 传递 404 错误；这在当前沙箱下是可执行且稳定的证据。
- 导入事务新增了失败隔离逻辑，但仍未做真实 Prisma/SQLite 集成级导入演练，本轮证据以 node:test 单元/模块测试为准。
