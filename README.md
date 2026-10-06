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
- 📊 **库存管理** - 入库出库、状态流转
- 🚢 **货柜管理** - 自动编号、装箱管理、位置查询
- 🔔 **流程提醒** - 次月5号内部退税材料准备提醒、已出货缺发票提醒（法定期限以主管税务机关和当期申报期为准）
- 🤖 **AI助手** - 智能问答、辅助录入
- 📈 **财务报表** - 收付款跟踪、月度报表预览确认导入、数字公式缓存保留、成本结构分析；同页财务资料库通过独立CLI脱敏入库，来源/Sheet/分页读取不会恢复旧来源（隔离验收见 `backend/src/integration/financial-library-source-readbacks.integration.js` 和 `frontend/e2e/real-financial-library.spec.ts`）
- 🧭 **工作台** - 出口全流程导航（签约→付款→排柜→单证→发票→退税→财务）

## 技术栈

系统采用前后端分离架构：

- **Frontend**: Next.js 16 (App Router) + Tailwind CSS + shadcn/ui
- **Backend**: Express + Prisma + Supabase (PostgreSQL)（详见 `backend/`）
- **AI**: Kimi API

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

## 开发状态

| 阶段 | 状态 |
|------|------|
| ✅ 需求调研 | 完成 |
| ✅ PRD文档 | 完成 |
| ✅ 技术方案 | 完成 |
| ✅ 数据库设计 | 完成 |
| 🚧 系统开发 | 进行中 (Frontend Phase 3/5) |

## 快速开始

### 前端 (Frontend)

```bash
cd frontend
npm install
npm run dev
# 访问 http://localhost:3001
```

### 后端 (Backend)

```bash
cd backend
npm install
npm run dev
# API 服务运行在 http://localhost:3000
```

### 联调提示

- 执行 `backend` 的 `db:seed` 前，请先在 `.env` 配置 `DEFAULT_ADMIN_PASSWORD`，管理员账号为 `admin / <DEFAULT_ADMIN_PASSWORD>`
- 若登录接口报 `500`，先确认后端是否已启动并监听 `3000` 端口
- 前端会通过 `/api/v1/*` 代理到 `http://localhost:3000/api/v1/*`

## 启动与上线

### 本地启动（Supabase）

1. 配置后端环境变量（`backend/.env`）  
  必填：`DATABASE_URL`（Pooler 6543）、`DIRECT_URL`（Direct 5432）、`JWT_SECRET`、`DEFAULT_ADMIN_PASSWORD`
2. 初始化数据库结构与种子：
```bash
cd backend
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
```
3. 启动后端：
```bash
cd backend
npm run dev
```
4. 启动前端：
```bash
cd frontend
npm install
npm run dev -- -p 3001
```
5. 访问：`http://localhost:3001`

### 推荐上线方式

1. 数据库：Supabase PostgreSQL（已配置 Prisma `postgresql` provider）
2. 后端：部署到 Render/Railway/Fly.io 任一 Node 平台
3. 前端：部署到 Vercel（项目根已配置 `vercel.json`）
4. Vercel 环境变量设置：
  `NEXT_PUBLIC_API_BASE_URL=https://<your-backend-domain>`
5. 后端环境变量设置：
  `DATABASE_URL`、`DIRECT_URL`、`JWT_SECRET`、`DEFAULT_ADMIN_PASSWORD`、`KIMI_API_KEY`

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
- [后端测试](backend/README.md#5-运行测试) - 真实只读概览来源验收已接入 test:db，覆盖上海发运期间、CNY 毛利/净现金、当前所有权账款与 UTC 收付趋势
- [前端浏览器验收](frontend/e2e/README.md) - 真实角色与合成资料验收约定，含出口3D绘制/控制/响应式返回和 Header 个人设置本地保存/重载/部分失败重试的 hosted CI 定义；定义检查不代表浏览器通过
- [Supabase 迁移指南](docs/Supabase迁移指南.md) - SQLite → Supabase 迁移步骤与 MCP 配置

## License

Private - All Rights Reserved
