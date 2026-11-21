# 捷淞进销存管理系统

> 若本文件夹结构或内容变化，请更新本文件。

## 项目简介

面向外贸出口企业的一站式进销存管理系统，集成AI智能助手，实现采购、销售、库存、财务的数字化管理。

## 核心功能

- 📦 **商品管理** - 商品档案、多供应商支持
- 🏭 **供应商管理** - 供应商档案、昵称关联、质量标记、收款银行信息
- 🏪 **客户门店** - 门店档案、港口绑定
- 📝 **采购管理** - 采购合同、AI辅助录入、在线盖章跳转、汇款信息复制、付款与多发票号码登记、选填发票原件
- 💰 **出口管理** - 出口合同、合同头草稿取消复原/失败保留重试、智能定价、3D 排柜、双80%出柜判定、船司装箱单核对（真实隔离验收见 `frontend/e2e/real-sales-header.spec.ts` 与 `backend/src/testHelpers/role-browser-header.test.js`）
- 📄 **出口单证** - 一键生成三张表、五 Sheet 出口 Excel（含商业发票）、HS 编码匹配与无退税警示
- 🔎 **本地 HS 字典** - 商品名称与编码组合检索、详情、已有角色手工证据保存/回读
- 📊 **库存管理** - 验货入库、出口出库、管理员期初导入及只读预览
- 🚢 **货柜管理** - 自动编号、装箱管理、位置查询
- 🔔 **流程提醒** - 次月5号内部退税材料准备提醒、已出货缺发票提醒（法定期限以主管税务机关和当期申报期为准）
- 🤖 **AI助手** - 智能问答、辅助录入
- 📈 **财务报表** - 收付款跟踪、月度报表预览确认导入、数字公式缓存保留、成本结构分析；同页财务资料库通过独立CLI脱敏入库，来源/Sheet/分页读取不会恢复旧来源（隔离验收见 `backend/src/integration/financial-library-source-readbacks.integration.js` 和 `frontend/e2e/real-financial-library.spec.ts`）
- 🧭 **工作台** - 出口全流程导航（签约→付款→排柜→单证→发票→退税→财务）

## 技术栈

系统采用前后端分离架构：

- **Frontend**: Next.js 16 (App Router) + Tailwind CSS + shadcn/ui
- **Backend**: Express + Prisma 5 + SQLite（当前 schema 与已提交迁移，详见 `backend/`）
- **AI**: Kimi、DeepSeek 或 OpenAI，由 `AI_PROVIDER` 选择；需另外配置密钥，未配置不代表已验证真实调用

## 项目结构

```
jiesong_system/
├── .cursor/agents/           # 项目级 Cursor 子代理（AI委派配置）
├── .cursor/skills/           # 项目级 Cursor Skills（可复用工作流）
├── .github/workflows/       # CI工作流（单元测试+自动化验收+PR变更格式检查）
├── docs/                    # 项目文档
├── frontend/                # 前端项目 (Next.js 16)
│   ├── src/
│   │   ├── app/             # App Router Pages
│   │   ├── components/      # UI Components
│   │   ├── lib/             # Utils & Config
│   │   ├── services/        # API Services
│   │   ├── store/           # Zustand Stores
│   │   └── types/           # TypeScript Interfaces
│   └── README.md
├── backend/                 # 后端项目 (Express + Prisma)
└── README.md                # 本文件
```

## 当前代码状态

以下以当前代码和可重复测试为准，不以旧阶段编号或完成度百分比表示上线就绪。

| 能力 | 代码事实与验证入口 | 边界 |
| --- | --- | --- |
| 数据库 | `backend/prisma/schema.prisma` 的 provider 为 `sqlite`，`prisma/migrations/` 为 SQLite 增量迁移 | 当前代码不能直接连接 PostgreSQL |
| 采购、出口、装箱、财务 | `backend/src/routes/`、`services/` 和 `npm run test:db` | 合成链路通过不代表真实迁移对账完成 |
| 库存 | 验货入库与出口出库；新增管理员库存期初导入 | 期初不是采购验货，也不提供盘点调整或历史成本估值 |
| 导入导出 | 通用 CSV/xlsx；商品、供应商、门店、期初模板、逐行校验及只读预览 | [批量导入操作说明](docs/migration/catalog-import.md) |
| 认证 | 角色权限、会话撤销、邮箱注册/找回；显式管理员初始化与启动门禁 | 外部邮件需单独配置与验证 |
| 单证与退税准备 | HS 证据、装箱、单证生成及内部退税材料校验；已核验 `cases.json` 可离线生成税局格式进货/出口明细申报表（`npm --prefix backend run refund:tables`，见 `docs/operations/出口退税两表生成与录入指引.md`） | 空库需先维护税则证据；两表仅为核对/填写稿，不直接向税局申报，批量导入兼容性未验证 |
| 定价 | 当前代码存在 30%/10% 与 ×1.3 等入口差异 | 本轮未调整；须业务裁决后另行统一 |
| 运维 | 本地备份/恢复入口见 `backend/scripts/`；隔离测试见下文 | 不代表部署、异地备份或真实业务恢复已验收 |

## 快速开始

需要 Node.js 22.23.4 或更新的兼容版本、npm 和 Python 3。测试通过 Python 标准库创建隔离 SQLite，不需要系统 sqlite3 CLI。

1. 在后端运行 `npm ci` 和 `npm run db:generate`。
2. 在运行环境设置 `DATABASE_URL`，例如 `file:./dev.db`。Prisma 的相对文件路径基于 `backend/prisma/`。设置至少 32 字符的私有 `JWT_SECRET`。不要将真实密钥或数据库提交到 Git。
3. 首次初始化时，显式设置 `DEFAULT_ADMIN_PASSWORD`，然后执行迁移及 seed。密码沿用统一策略，至少 8 个 Unicode 字符且 UTF-8 不超过 72 字节。不要使用文档中的字面示例作为密码。

```bash
cd backend
# 上述配置必须已在运行环境或私有 backend/.env 中设置。
# 已提交迁移用于空库初始化；已有库升级前先完成一致性备份。
./node_modules/.bin/prisma migrate deploy
npm run db:seed
PORT=3001 npm run dev
```

管理员用户名为 `admin`。没有默认密码。空库没有管理员时服务拒绝启动。已有旧默认管理员必须通过显式初始化密码修复，修复会撤销旧会话。重复 seed 不覆盖已有安全管理员的密码。正常改密使用现有用户接口，初始化后从运行环境移除 bootstrap 密码。

另一个终端启动前端：

```bash
cd frontend
npm ci
npm run dev -- -p 3000
```

前端地址为 `http://localhost:3000`，默认 API 代理指向 `http://localhost:3001/api/v1`。后端配置本身的端口默认值为 3000，所以这里显式传 `PORT=3001`。健康检查是后端根路径 `/health`，不是 `/api/v1/health`。

开发修改 schema 前，必须先在当前终端显式导出已核对的 SQLite `DATABASE_URL`，再执行 `npm run db:migrate`；该命令先备份再运行 `prisma migrate dev`。仅将连接串放进 `.env` 不足以运行备份步骤，脚本不会读取 `.env`。不要使用 `db push`。仅变更源码或文档无需重新初始化数据库。

## 验证

```bash
cd backend
npm test
npm run test:db
npm run test:carrier-pdf
cd ../frontend
npm test -- --maxWorkers=2
./node_modules/.bin/tsc --noEmit
cd ..
python3 -m unittest discover -s tests -p test_prepare_export_packet.py
```

测试数量随代码变化，以本次完整输出为准。浏览器 E2E、生产构建和 ESLint 是单独检查，不能由单测数量推导通过。历史 QA 报告保留其日期与当时范围，不代表当前状态。

备份与恢复步骤及实际合成演练见 [SQLite 备份恢复](docs/operations/sqlite-backup-restore.md)。

## 数据库与部署边界

当前运行模型是 SQLite。旧 `docker-compose`、Render、Vercel 配置及 Supabase 指南已删除（A101）。切换 PostgreSQL 必须另做 schema、迁移 SQL、查询语义和备份恢复的验证，不能仅替换连接字符串。

本轮仅验证本地分支和合成临时库，没有部署。现有部署资料见 `DEPLOY.md`，执行前须核实实际数据库路径、上传目录及备份方案。

## 文档导航

- [技术方案](docs/技术方案.md) - 系统架构设计
- [数据库设计](docs/数据库设计.md) - Schema 定义
- [可执行里程碑计划（V1）](docs/可执行里程碑计划.md) - 未来2周 6 个里程碑、角色、验证与回滚
- [项目子代理说明](.cursor/agents/README.md) - 项目级 Cursor 子代理与用途
- [项目技能说明](.cursor/skills/README.md) - 项目级 Cursor Skills 索引与用途
- [前端文档](frontend/README.md) - 前端开发指南
- [后端测试](backend/README.md#5-运行测试) - test:db 包含真实只读概览来源验收、上海期间与收付趋势，以及合成邮箱注册 HTTP 成功/重放与未激活 SALES 安全字段回读
- [前端浏览器验收](frontend/e2e/README.md) - 真实角色与合成资料验收约定，含出口3D绘制/控制/响应式返回和 Header 个人设置本地保存/重载/部分失败重试的 hosted CI 定义；定义检查不代表浏览器通过

## License

Private - All Rights Reserved
