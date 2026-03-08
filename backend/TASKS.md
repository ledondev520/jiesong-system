# Tax Refund Migration Tasks

## MaxParallel
- `1`

## Task Board
| ID | Priority | ETA | Slot | Status | Input | Output | Validation | DoD |
|---|---|---:|---:|---|---|---|---|---|
| DB-TRM-01 | P0 | 20m | 1 | DONE | `prisma/schema.prisma` + `../docs/数据库设计.md` | 新增 5 张表 + 迁移 + client | `npx prisma validate && npx prisma migrate dev --name add_tax_refund_module && npx prisma generate` | Schema 可解析、迁移生成成功、client 生成成功、文档台账更新 |
| HSCODE-S1-01 | P0 | 20m | 1 | DONE | `prisma/schema.prisma` + 现有 `prisma/migrations/*add_hs_codes_table*` | `HsCode` 模型对齐 + migration 执行 | `npx prisma validate && npx prisma migrate dev --name add_hs_codes_table && npx prisma generate` | Schema 与迁移一致、命令执行成功、client 可生成 |
| HSCODE-S1-02 | P0 | 20m | 1 | DONE | `backend/scripts` + HSCode 样例数据约束 | `seed-hscodes.js` + 100 条示例数据 | `node --test scripts/seed-hscodes.test.js && node scripts/seed-hscodes.js` | 脚本可执行、数据 100 条、`hsCode` 唯一、可重复导入 |
| HSCODE-API-01 | P0 | 30m | 1 | DONE | `src/services/hsCodeService.test.js` + `src/routes/hsCodes.test.js` | `src/services/hsCodeService.js` + `src/routes/hsCodes.js` + `/hs-codes` 挂载 | `node --test src/services/hsCodeService.test.js src/routes/hsCodes.test.js` | 服务搜索/查码/税率查询行为可用，路由已注册，定向测试通过 |
| HSCODE-LIVE-DB-01 | P0 | 30m | 1 | DONE | `backend/data/hscode-live/records/*.json` + `prisma/schema.prisma` | 扩展 `HsCode` 模型、迁移、`import-hscode-live.js` 与导入测试 | `node --test scripts/import-hscode-live.test.js && npx prisma migrate dev --name extend_hs_codes_for_live_import && node scripts/import-hscode-live.js` | 正式表可保留关键规范字段和完整原始 payload，导入可重复执行 |
| TAX-DRAFT-BE-01 | P0 | 35m | 1 | DONE | `TaxRefund/CustomsDeclaration/ForexVerification` 关系模型 + 新服务测试 | `taxRefundDraftService.js` + `/tax-refunds/auto-drafts` 路由与控制器接入 | `node --test src/services/taxRefundDraftService.test.js src/controllers/taxRefundController.test.js` | 可按报关单自动生成 draft、跳过已有记录并返回 created/skipped 统计 |
