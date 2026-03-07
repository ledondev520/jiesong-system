# Tax Refund Migration Risks

| Risk ID | Trigger | Impact | Mitigation | Rollback |
|---|---|---|---|---|
| TRM-R1 | 仓库缺少“export tax refund analysis”独立设计稿 | 字段设计可能与预期存在偏差 | 以 `../docs/数据库设计.md` + 现有 `SalesContract/Product/PackingItem` 结构做最小兼容设计，并在结果中显式说明依据 | 回退本轮 migration 与 schema 变更 |
| TRM-R2 | SQLite 迁移对字段类型/关系约束敏感 | `prisma migrate dev` 失败，阻塞交付 | 统一沿用现有 `String/Float/Boolean/DateTime` 风格，避免 enum 与 Decimal | 回退新增模型，保留现有 schema |
| TRM-R3 | 现有开发库缺少 migration 历史 | `migrate dev` 要求 reset 本地库 | 建立 baseline migration 并用 `migrate resolve` 标记已应用，再创建本轮增量迁移 | 回退 baseline 目录与本轮增量 migration |
