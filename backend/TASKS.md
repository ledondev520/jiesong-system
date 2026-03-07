# Tax Refund Migration Tasks

## MaxParallel
- `1`

## Task Board
| ID | Priority | ETA | Slot | Status | Input | Output | Validation | DoD |
|---|---|---:|---:|---|---|---|---|---|
| DB-TRM-01 | P0 | 20m | 1 | DONE | `prisma/schema.prisma` + `../docs/数据库设计.md` | 新增 5 张表 + 迁移 + client | `npx prisma validate && npx prisma migrate dev --name add_tax_refund_module && npx prisma generate` | Schema 可解析、迁移生成成功、client 生成成功、文档台账更新 |
