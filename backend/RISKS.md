# Tax Refund Migration Risks

| Risk ID | Trigger | Impact | Mitigation | Rollback |
|---|---|---|---|---|
| TRM-R1 | 仓库缺少“export tax refund analysis”独立设计稿 | 字段设计可能与预期存在偏差 | 以 `../docs/数据库设计.md` + 现有 `SalesContract/Product/PackingItem` 结构做最小兼容设计，并在结果中显式说明依据 | 回退本轮 migration 与 schema 变更 |
| TRM-R2 | SQLite 迁移对字段类型/关系约束敏感 | `prisma migrate dev` 失败，阻塞交付 | 统一沿用现有 `String/Float/Boolean/DateTime` 风格，避免 enum 与 Decimal | 回退新增模型，保留现有 schema |
| TRM-R3 | 现有开发库缺少 migration 历史 | `migrate dev` 要求 reset 本地库 | 建立 baseline migration 并用 `migrate resolve` 标记已应用，再创建本轮增量迁移 | 回退 baseline 目录与本轮增量 migration |

## 2026-03-08 Round 2: HSCode Migration + Seed

| Risk ID | Trigger | Impact | Mitigation | Rollback |
|---|---|---|---|---|
| HSCODE-R1 | 工作区已有未提交的 `HsCode` 相关 schema/migration/test 改动 | 误覆盖用户或前序任务内容 | 仅在现有定义基础上补齐缺口，逐文件核对后再修改 | 回退本轮新增脚本与台账，不触碰用户改动 |
| HSCODE-R2 | SQLite 无法提供真正全文索引 | `productName` “全文搜索”实现与 PostgreSQL 预期不同 | 本轮按 SQLite 能力保留普通索引，并在结果中注明服务层使用 `contains` 搜索 | 后续若切 PostgreSQL，再追加 FTS/index migration |
| HSCODE-R3 | 本地库已存在 `hs_codes` 表或迁移状态不一致 | `migrate dev` 失败或要求 reset | 先执行 `prisma validate` / `migrate status`，以现有 migration 为准应用；拒绝破坏性 reset | 保留现有 DB，仅记录未完成项与阻塞原因 |
| HSCODE-R4 | 本轮 `hsCodes` 路由未接入鉴权 | 若后续要求该数据仅内部可见，需要补统一访问控制 | 当前按任务要求交付公开查询能力；后续进入联调时再与前端/权限策略统一收口 | 回退 `src/routes/index.js` 中 `/hs-codes` 挂载或在路由前补 `authenticate` |
| HSCODE-R5 | live JSON 中部分编码条目可能缺少可解析退税率或申报段落 | 自动生成退税草稿时可退金额不完整、部分报关单被跳过 | 导入阶段保留完整 `rawPayloadJson`，生成草稿时对缺失税率明细做 skip/warning，不写入伪造金额 | 回退自动草稿生成逻辑，仅保留 live HSCode 入库 |
| CUSTOMS-R1 | 部分销售合同没有 `packing_items` 或装箱金额不完整 | 报关单自动生成只能部分成功，个别合同会被跳过 | 自动草稿服务在结果中返回 `no_packing_items`，前端按钮提示 created/skipped 统计 | 回退 `/customs-declarations/auto-drafts`，恢复手工建单 |


## 2026-03-11 Round 6

| Risk ID | Trigger | Impact | Mitigation | Rollback |
|---|---|---|---|---|
| SALES-EXP-R1 | 其他导出链路仍可能直接抛普通 `Error` | 某些下载接口仍可能返回 500 而不是业务状态码 | 本轮仅修复销售 Excel/PDF 导出；后续如扩展其他导出接口，复用 `createError(..., 404)` 模式统一收口 | 回退本轮导出 service 改动 |
| IMPORT-TX-R1 | 真实数据库导入时出现 Prisma/SQLite 与 mock 不一致行为 | 单元测试绿灯但真实导入链路仍可能暴露未覆盖问题 | 本轮已增加事务成功/失败两类单测；后续补一条针对 `importRecords` 的集成回归 | 回退 `dataImportService` 事务内上下文改动，恢复原先非事务上下文创建模式 |
| IMPORT-TX-R2 | 导入失败日志仍未稳定保留原始“序号”字段 | 人工排查失败项时需要依赖 `data` payload 而不是简洁序号 | 本轮不扩展失败日志模型，只保证事务与状态码修复；后续如继续优化导入体验，可单独修 `normalizeImportRows/getRecordSeq` | 保持当前失败日志结构不变 |

## 2026-03-12 Round 7: Backend Coverage 98 Phase 1

| Risk ID | Trigger | Impact | Mitigation | Rollback |
|---|---|---|---|---|
| BE-COV-R1 | 为追求 98% 直接从高耦合模块（如 `aiService` / `importService`）硬补测试 | 周期长、收益低，容易把 coverage 冲刺变成重构任务 | 先按 ROI 补 controller 薄层与中等复杂 service，再处理高耦合模块 | 回退新增测试与最小可测性重构，保留第一阶段基线文档 |
| BE-COV-R2 | 继续依赖 Node 内建 coverage 而不做额外统计转换 | 当前只有 line/branch/function，没有单独 statements 汇总 | 第一阶段先冻结 Node 原生命令为唯一基线；若后续确需 statements，再补统一脚本，不在冲刺中途切换口径 | 回退新增 coverage 脚本，继续使用 `node --test --experimental-test-coverage` |
| BE-COV-R3 | app 装配测试再次直接 require 整棵业务路由树 | Prisma/路由副作用重新把 test runner 拖慢或拖挂 | 保持 `app.test.js` 使用依赖替身，仅验证装配契约和 `/health` 路由 | 回退到当前稳定的替身加载方案，不恢复真实 socket / 全路由加载测试 |
