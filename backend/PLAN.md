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
