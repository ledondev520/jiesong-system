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
- 🔎 **本地 HS 字典** - 商品名称与编码组合检索、详情、已有角色手工证据保存/回读的隔离验收见 `docs/quality/HS本地字典回归_20261006.md`；浏览器定义与实际执行结果分别记录
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
- **AI**: Kimi 或 DeepSeek，由 `AI_PROVIDER` 选择；需另外配置密钥，未配置不代表已验证真实调用

## 项目结构

```
jiesong_system/
├── .cursor/agents/           # 项目级 Cursor 子代理（AI委派配置）
├── .cursor/skills/           # 项目级 Cursor Skills（可复用工作流）
├── .github/workflows/       # CI工作流（单元测试+自动化验收+PR变更格式检查）
├── docs/                    # 项目文档
├── PLAN.md                  # 前端美化路线图与里程碑
├── TASKS.md                 # 前端美化任务清单与状态
├── RISKS.md                 # 前端美化风险台账
├── METRICS.md               # 前端美化质量与过程指标
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
├── demo/                    # 旧版UI Demo (废弃)
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
| 单证与退税准备 | HS 证据、装箱、单证生成及内部退税材料校验 | 空库需先维护税则证据；不直接向税局申报 |
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

当前运行模型是 SQLite。`docker-compose`、Render 配置及旧 Supabase 指南中的 PostgreSQL 配置与当前 schema 不兼容，不是本分支可直接使用的部署步骤。切换 PostgreSQL 必须另做 schema、迁移 SQL、查询语义和备份恢复的验证，不能仅替换连接字符串。

本轮仅验证本地分支和合成临时库，没有部署。现有部署资料见 `DEPLOY.md`，执行前须核实实际数据库路径、上传目录及备份方案。

## 文档导航

- [需求总结](docs/需求总结_v2.0.md) - 完整需求规格
- [PRD文档](docs/PRD.md) - 产品需求、功能清单
- [技术方案](docs/技术方案.md) - 系统架构设计
- [数据库设计](docs/数据库设计.md) - Schema 定义
- [测试样例](docs/测试样例.md) - 测试先行样例与用例清单
- [模拟数据汇总](docs/模拟数据汇总.md) - 模拟数据标记清单
- [前端统一重构验收清单](docs/前端统一重构验收清单.md) - 前端样式统一改造验收台账
- [系统架构落地执行方案](docs/系统架构落地执行方案.md) - 多 Agent 协同执行路线与 WU 落地清单
- [可执行里程碑计划（V1）](docs/可执行里程碑计划.md) - 未来2周 6 个里程碑、角色、验证与回滚
- [采购链路 API 契约](docs/api-contracts/采购链路契约.md) - 采购域接口契约与联调状态基线
- [销售链路 API 契约](docs/api-contracts/销售链路契约.md) - 销售与装箱接口契约基线
- [销售链路联调面板](docs/api-contracts/销售链路联调面板.md) - 销售链路 READY/BLOCKED/DONE 联调追踪
- [库存链路 API 契约](docs/api-contracts/库存链路契约.md) - 库存查询、状态机流转与批量状态更新契约
- [库存链路联调面板](docs/api-contracts/库存链路联调面板.md) - 库存链路 READY/BLOCKED/DONE 联调追踪
- [发布结论（M5）](docs/quality/发布结论_M5_20260212.md) - 采购链路门禁执行证据与发布建议
- [系统日志回归](docs/quality/application-audit-readback-2026-10-06.md) - 合成应用审计查询、完整记录、CSV及现有角色的真实HTTP/SQLite证据
- [系统配置普通文本回归](docs/quality/ordinary-setting-text-20261006.md) - 第 30 行既有文本单键保存/失败/重试/回读与组件放弃编辑；整表混合保存及浏览器仍未验收
- [周节奏指标看板](docs/周节奏指标看板.md) - 周度质量/效率/回归风险跟踪
- [项目子代理说明](.cursor/agents/README.md) - 项目级 Cursor 子代理与用途
- [项目技能说明](.cursor/skills/README.md) - 项目级 Cursor Skills 索引与用途
- [前端美化路线图](PLAN.md) - 分阶段里程碑与风险对策
- [前端美化任务清单](TASKS.md) - 执行状态与优先级
- [前端美化风险台账](RISKS.md) - 风险触发与回滚点
- [前端美化指标](METRICS.md) - 每轮质量与过程指标
- [前端文档](frontend/README.md) - 前端开发指南
- [后端测试](backend/README.md#5-运行测试) - test:db 包含真实只读概览来源验收、上海期间与收付趋势，以及合成邮箱注册 HTTP 成功/重放与未激活 SALES 安全字段回读
- [前端浏览器验收](frontend/e2e/README.md) - 真实角色与合成资料验收约定，含出口3D绘制/控制/响应式返回和 Header 个人设置本地保存/重载/部分失败重试的 hosted CI 定义；定义检查不代表浏览器通过
- [普通用户名称验收](docs/qa/account-name-lifecycle-2026-10-06.md) - 两个现有用户管理入口完整目录搜索与真实失败保留草稿重试；仅名称合成HTTP/React检查
- [历史 Supabase 迁移指南](docs/Supabase迁移指南.md) - 历史方案，与当前 SQLite schema 不兼容

## License

Private - All Rights Reserved
