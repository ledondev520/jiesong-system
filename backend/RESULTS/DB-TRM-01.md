# DB-TRM-01 Result

## Delivery
- 在 `prisma/schema.prisma` 中新增 5 张退税模块表：
  - `CustomsDeclaration`
  - `CustomsDeclarationItem`
  - `ForexVerification`
  - `TaxRefund`
  - `TaxRate`
- 为既有模型补齐关系：
  - `SalesContract` -> `customsDeclarations` / `forexVerifications` / `taxRefunds`
  - `Product` -> `customsDeclarationItems` / `taxRates`
  - `PackingItem` -> `customsDeclarationItems`
- 生成 migration：
  - baseline: `prisma/migrations/20260307090000_baseline/migration.sql`
  - increment: `prisma/migrations/20260307090001_add_tax_refund_module/migration.sql`

## Why baseline was needed
- 本地 `prisma/dev.db` 已存在完整业务表，但仓库此前没有 Prisma migration 历史。
- 直接执行 `prisma migrate dev` 会要求 reset SQLite 开发库。
- 本轮改为先生成 baseline migration 并通过 `migrate resolve` 标记已应用，再生成新增 5 表的增量 migration，从而保留现有开发数据。

## Verification
- `npx prisma validate`
- `npx prisma migrate resolve --applied 20260307090000_baseline`
- `npx prisma migrate dev --name add_tax_refund_module`
- `npx prisma generate`
- `node --test src/services/customsDeclarationService.test.js src/services/forexVerificationService.test.js src/services/taxRateService.test.js src/services/taxRefundService.test.js`

## Design basis
- 使用依据：`../docs/数据库设计.md`
- 未找到用户提到的独立 “export tax refund analysis / 出口退税分析” 文档；因此本轮采用与现有销售合同、装箱明细、商品税率配置一致的最小兼容设计。
