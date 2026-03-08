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
