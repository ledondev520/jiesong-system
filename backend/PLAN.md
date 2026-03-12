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

## 2026-03-08 Round 4: Live HSCode Import + Tax Refund Draft Automation

### Goal
- 将 `backend/data/hscode-live/records/*.json` 清洗并导入 `hs_codes` 正式表，保留真实查询字段与完整原始 payload。
- 基于报关单明细、live HSCode 退税率和核销记录，自动生成退税草稿。

### Execution Outcome
- `prisma/schema.prisma` 已扩展 `HsCode` 模型，可保留：
  - `refundRate/exportTaxRate/vatRate`
  - `declarationElements/supervisionConditions/inspectionQuarantine`
  - 各章节/CIQ/协定税率/税率信息的 JSON 字段
  - `rawPayloadJson`
- 已生成并执行 migration：`20260308124928_extend_hs_codes_for_live_import`。
- 已新增 `scripts/import-hscode-live.js` 与 `scripts/import-hscode-live.test.js`，导入逻辑默认先清空旧 `hs_codes` 数据，再从 live JSON 全量重建。
- 已真实执行导入，当前 `hs_codes` 表记录数为 `905`，样例 seed 已被 live 数据接管。
- 已新增 `src/services/taxRefundDraftService.js`，实现按报关单自动生成退税草稿。
- 已在 `src/controllers/taxRefundController.js` 和 `src/routes/taxRefunds.js` 接入 `POST /tax-refunds/auto-drafts`。

### Verification
- `node --test scripts/import-hscode-live.test.js src/services/taxRefundDraftService.test.js src/controllers/taxRefundController.test.js src/routes/taxModules.test.js src/services/hsCodeService.test.js src/routes/hsCodes.test.js`
- `npx prisma migrate dev --name extend_hs_codes_for_live_import`
- `node scripts/import-hscode-live.js`

### Current Capability
- HSCode 主查询源现在已切换为真实 JSON 清洗后的正式库数据。
- 退税草稿现在可按报关单明细自动生成，但依赖明细上的 `hsCode + totalPrice` 完整度；缺失时会跳过而不是盲目生成错误金额。

## 2026-03-08 Round 5: Customs Declaration Draft Automation

### Goal
- 使用现有 `sales_contracts + packing_items + product` 数据自动补齐报关单草稿，为退税草稿生成提供上游单据。

### Execution Outcome
- 已新增 `src/services/customsDeclarationDraftService.js`，按销售合同生成报关单草稿。
- 数据来源优先级：
  - 明细金额/数量/重量：`packing_items`
  - HSCode：`product.hsCode`
  - 申报要素：`product.declaration`，缺失时回落到 live `hs_codes.declarationElements`
- 已在 `src/controllers/customsDeclarationController.js` 与 `src/routes/customsDeclarations.js` 接入 `POST /customs-declarations/auto-drafts`。
- 已用真实数据库运行一次自动补齐，实际生成 `35` 个报关单草稿，跳过 `1` 个无装箱明细合同。

### Verification
- `node --test src/services/customsDeclarationDraftService.test.js src/controllers/customsDeclarationController.test.js src/routes/taxModules.test.js`
- 真实执行：`node - <<'NODE' ... customsDeclarationDraftService.generateCustomsDeclarationDrafts({}) ... NODE`

### Current Capability
- 现有销售/装箱数据已可一键补成报关单草稿。
- 退税自动化链路现在具备“销售/装箱 -> 报关单草稿 -> 退税草稿”的最小闭环。

## 2026-03-11 Round 6: Sales Export 404 + Import Transaction Fix

### Goal
- 修复销售导出接口在合同不存在时返回 500 的问题，统一为 404。
- 修复 `dataImportService` 事务路径中 `salesItem` / `packingItem` 查重与创建跨 Prisma client 的问题，消除事务测试红灯。

### Scope
- `src/services/exportService.js`
- `src/services/pdfExportService.js`
- `src/routes/sales.test.js`
- `src/services/exportService.test.js`
- `src/services/pdfExportService.test.js`
- `src/services/dataImportService.js`
- `src/services/dataImportService.test.js`
- 本轮台账与结果文件

### Milestones
1. 先以测试复现导出 404 缺失和导入事务 client 混用问题。
2. 将导出服务缺失合同错误映射为 404，并补 HTTP 级回归。
3. 将导入事务内的查重查询绑定到传入 `tx`，与创建/更新共用事务 client。
4. 运行定向测试并更新 `TASKS.md` / `RISKS.md` / `METRICS.md` / `RESULTS` / `PATCHES`。

### Risks
- 销售导出路由受认证中间件保护，HTTP 测试需要稳定 mock 用户认证路径，避免把鉴权失败误判为导出异常。
- 导入服务缓存逻辑与事务 client 耦合，若改动过大可能影响非事务路径的重复判断；本轮仅做最小参数透传。

### Verification
- `cd backend && node --test src/routes/sales.test.js src/services/exportService.test.js src/services/pdfExportService.test.js src/services/dataImportService.test.js`

### Execution Outcome
- 销售导出服务与 PDF 导出服务在缺失合同时已统一抛出 404 业务错误，路由层透传到 `next(err)`。
- `dataImportService.importRecords` 现改为按记录在同一事务内完成上下文实体查找/创建、明细写入与库存写入。
- 为避免单条事务失败污染后续导入，本轮新增“事务级缓存克隆 + 成功后提交 + 失败后恢复 created 计数”的保护。
- 定向验证已完成：`node --test src/routes/sales.test.js src/services/exportService.test.js src/services/pdfExportService.test.js src/services/dataImportService.test.js`，结果 12/12 通过。

## 2026-03-12 Round 7: Backend Coverage 98 Phase 1

### Goal
- 为 backend coverage 98 冲刺建立可信基线，先清理测试门禁阻塞，再拿到全量覆盖率真实盘点。

### Delivered
- 重写 `src/app.test.js`，移除对真实 socket 与整棵业务路由树的依赖。
- 为 `src/middleware/rateLimit.js` 顶层清理定时器补 `unref()`，避免 `node --test` 退出阻塞。
- 新增回归测试 `src/middleware/rateLimit.init.test.js`。
- 产出专项报告：`../docs/coverage-98-backend-report.md`。
- 产出实施计划：`../docs/plans/2026-03-12-backend-coverage-98.md`。

### Verification
- `cd backend && node --test src/app.test.js src/middleware/rateLimit.init.test.js src/middleware/rateLimit.test.js`
- `cd backend && npm test`
- `cd backend && node --test --experimental-test-coverage`

### Current Status
- 后端全量测试：`227/227` 通过
- 后端 coverage 基线：`lines 63.88% / branches 61.74% / functions 55.40%`
- 下一阶段重点：controller 薄层行为测试与高 ROI service 分支补测
