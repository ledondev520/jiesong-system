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
| TRM-API-02 | P0 | 35m | 1 | DONE | `src/services/*tax*.js` + 既有 Express 路由模式 | 4 组税退模块 CRUD 控制器/路由与 `/api/v1` 挂载 | `node --test src/services/customsDeclarationService.test.js src/services/forexVerificationService.test.js src/services/taxRateService.test.js src/services/taxRefundService.test.js src/routes/taxModules.test.js src/controllers/taxRefundController.test.js` | 报关单/核销/退税/退税率 4 组资源均可通过 HTTP CRUD 访问，定向后端回归通过 |
| HSCODE-LIVE-DB-01 | P0 | 30m | 1 | DONE | `backend/data/hscode-live/records/*.json` + `prisma/schema.prisma` | 扩展 `HsCode` 模型、迁移、`import-hscode-live.js` 与导入测试 | `node --test scripts/import-hscode-live.test.js && npx prisma migrate dev --name extend_hs_codes_for_live_import && node scripts/import-hscode-live.js` | 正式表可保留关键规范字段和完整原始 payload，导入可重复执行 |
| TAX-DRAFT-BE-01 | P0 | 35m | 1 | DONE | `TaxRefund/CustomsDeclaration/ForexVerification` 关系模型 + 新服务测试 | `taxRefundDraftService.js` + `/tax-refunds/auto-drafts` 路由与控制器接入 | `node --test src/services/taxRefundDraftService.test.js src/controllers/taxRefundController.test.js` | 可按报关单自动生成 draft、跳过已有记录并返回 created/skipped 统计 |
| CUSTOMS-DRAFT-BE-01 | P0 | 35m | 1 | DONE | `SalesContract/PackingItem/Product` 现有数据 + 新服务测试 | `customsDeclarationDraftService.js` + `/customs-declarations/auto-drafts` 路由与控制器接入 | `node --test src/services/customsDeclarationDraftService.test.js src/controllers/customsDeclarationController.test.js src/routes/taxModules.test.js` | 可按销售合同自动生成报关单草稿、回填明细申报要素，并返回 created/skipped 统计 |
| SALES-EXP-404 | P0 | 20m | 1 | DONE | `src/routes/sales.js` + `src/services/exportService.js` + `src/services/pdfExportService.js` | 销售导出接口缺失合同时返回 404 + 回归测试 | `cd backend && node --test src/routes/sales.test.js src/services/exportService.test.js src/services/pdfExportService.test.js` | `/:id/export-excel` 与 `/:id/export-pdf` 缺失合同均返回 404，服务/路由测试通过 |
| IMPORT-TX-01 | P0 | 20m | 1 | DONE | `src/services/dataImportService.js` + `src/services/dataImportService.test.js` | 导入事务内 item 查重/创建统一使用 `tx` client | `cd backend && node --test src/services/dataImportService.test.js` | 导入测试不再因事务内外 client 混用触发外键失败，新增事务行为测试通过 |
