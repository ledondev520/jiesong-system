# 项目文档目录

> 若本文件夹结构或内容变化，请更新本文件。

## 目的/边界/职责
- 目的：集中维护仍有效的方案、运维手册与契约文档。
- 边界：仅存放项目文档与索引，不承载业务实现代码。历史计划、QA/验收证据、API 联调台账已于 A115 删除，需要时从 git 历史取回；卡片证据放 PR 描述和队列报告。
- 职责：文件增删时同步更新本清单。

## 文件清单

| 文件 | 地位 | 功能 |
|------|------|------|
| `operations/production-rollback.md` | 运维手册 | 生产代码、配置与可选数据库回滚 |
| `operations/sqlite-backup-restore.md` | 运维手册 | SQLite 备份、恢复与演练 |
| `operations/archive-test-data.md` | 运维手册 | 测试数据归档 |
| `operations/export-pricing.md` | 运维手册 | 出口报价规则运维 |
| `operations/financial-evidence-transfer.md` | 运维手册 | 财务资料跨机迁移 |
| `operations/出口退税两表生成与录入指引.md` | 运维手册 | 进货/出口明细申报表离线生成与录入 |
| `security/browser-sessions.md`、`security/password-recovery.md` | 安全说明 | 浏览器会话、密码找回 |
| `quality/lifecycle-contract.md`（及 `quality/README.md`） | 契约 | 生命周期契约 |
| `redesign/UX-REDESIGN-2026.md` | 规格 | UX 重设计（AGENTS.md §14 引用） |
| `redesign/DATA-MODEL-2026.md`、`数据库设计.md` | 数据模型 | 两份数据模型文档，以 `schema.prisma` 为准 |
| `migration/catalog-import.md` | 迁移 | 商品目录导入 |
| `container-loading/AUDIT-2026-10.md` | 审计 | 排柜审计 |
| `brand/BRAND-ASSETS.md` | 品牌 | 品牌资源说明 |
| `出口清单快速制单SOP.md`、`出口退税自动化方案.md`、`购销合同模板说明.md` | 业务说明 | 制单 SOP、退税方案、合同模板 |
| `技术方案.md`、`API文档.md` | 方案 | 第一阶段后更新或删除 |
| `系统简化方案.md` | 已被取代 | 见文件首行 |
| `greenfield/`、`money-minor-units-plan.md`、`可执行里程碑计划.md` | 待负责人确认 | 是否仍在使用；否则删除 |
| `供应商名录.md`、`采购合同明细.md`、`wps-import-decision-memo.md` | 受限（OD-12） | 按 OD-12 保持原样，勿修改 |
| `system-overview.html` | 概览 | 系统概览页 |
