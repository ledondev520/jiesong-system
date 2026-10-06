# Jiesong System Frontend

> 若本文件夹结构或内容变化，请更新本文件。
>
> Input: docs/PRD.md, docs/技术方案.md
> Output: Web Application Interface
> Pos: 用户交互层

## 简介

捷淞进销存系统前端项目，基于 Next.js 16 App Router 构建。

## 目录结构

- `src/app`: 页面路由
  - `(auth)`: 认证相关页面 (Login)
  - `(dashboard)`: 主应用页面 (Dashboard, Products, etc.)
- `src/components`: 组件库
  - `ui`: shadcn/ui 基础组件
  - `layout`: 布局组件 (Sidebar, Header)
- `src/lib`: 工具函数与配置 (Axios, Utils)
- `src/services`: API 服务层
- `src/store`: 全局状态管理 (Zustand)
- `src/types`: TypeScript 类型定义 (与数据库 Schema 对齐)
- `src/**/*.test.ts`: 前端单元测试文件
- `e2e`: Playwright 自动化验收测试
  - `e2e/README.md`: 合成 API 夹具与移动端注册、采购验货汇总的验收约定
  - `e2e/real-export-3d.spec.ts`: 真实 SALES 菜单下既有3D货物绘制、鼠标控制、390/1440px尺寸及返回/重载验收；实际浏览器结果以 hosted CI 为准
  - `e2e/profile-preference-lifecycle.spec.ts` / `e2e/profile-preference-fixture.ts`: Header 个人设置取消、同标签保存/重开/重载及两种本地写失败重试的真实合成登录定义；只读安全用户字段，浏览器执行以 hosted CI 为准
  - `e2e/real-hs-catalog.spec.ts` / `real-hs-fixture.ts`: 四项真实本地HS查询/详情/手工证据取消、失败纠正、保存回读与BOSS只读验收定义；已提交迁移私有SQLite，不调用外部HS或AI，也不把AI结果复制算作普通本地路径
- `vitest.config.ts`: Vitest 测试配置
- `playwright.config.ts`: Playwright 配置
- `eslint.config.mjs`: 源码 lint；忽略构建、覆盖率及 Playwright 生成报告

## 核心依赖

- **Framework**: Next.js 16
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui (Radix UI)
- **State**: Zustand
- **Icons**: Lucide React
- **HTTP**: Axios
- **Forms**: React Hook Form + Zod

## 开发规范

1. **类型安全**: 所有 API 调用和数据处理必须使用 strict types (见 `src/types/index.ts`)。
2. **组件风格**: 使用 shadcn/ui 组件，遵循原子化 CSS 设计。
3. **状态管理**: 尽量使用 Server Components 获取数据，客户端交互状态使用 Zustand。
4. **API 调用**: 所有 HTTP 请求封装在 `src/services` 中。

## 常用命令

```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 运行 Lint
npm run lint

# PR 改动源码格式检查（需完整 Git 历史与明确 base/head SHA）
PR_BASE_SHA=$(git merge-base origin/main HEAD) PR_HEAD_SHA=$(git rev-parse HEAD) npm run format:pr

# 运行单元测试
npm run test

# 单元测试开发模式
npm run test:watch

# 单元测试覆盖率
npm run test:coverage

# 自动化验收测试
npm run test:e2e
```

PR 格式工具精确锁定 Prettier 3.9.9。`scripts/check-pr-format.cjs` 以完整 SHA 和 NUL 路径读取 PR 改动，检查新增、修改及重命名目标的 TS/TSX 源码；浅历史、缺失引用及读文件错误均失败。历史未改动源码不做批量格式迁移，单测和 E2E 仍完整运行。工具回归：`node --test ../scripts/check-pr-format.test.cjs`。

## 登录与联调排查

- 管理员账号：`admin`，密码来自 `backend/.env` 的 `DEFAULT_ADMIN_PASSWORD`
- 前端 API 默认走 `/api/v1`，由 Next.js 代理到 `http://localhost:3001/api/v1`
- 出现登录 `500` 时，优先确认后端 `backend` 服务是否已启动（`cd backend && npm run dev`）
- 主题支持白天/夜间模式切换（Header 右上角主题按钮）

认证提示由 `src/lib/auth-session.ts` 统一处理：无本标签令牌的 401 进入普通登录页；持有失效令牌才显示会话过期。令牌仍按标签保存在 sessionStorage。

全局搜索复用各模块的 `lite` 列表，旧查询完成后不会覆盖当前查询。商品页只在 URL 关键词变化时同步输入，允许修改或清空全局搜索带入的关键词。

财务概览手动刷新同时失效页面缓存与 HTTP GET 缓存，确保重新读取后端数据。

手机端 Header 使用图标展开全局搜索；共享弹窗限制在动态视口高度内滚动并处理安全区。手机输入字号至少 16px、常用按钮至少 44px，列表卡片完整换行展示字段；保留浏览器缩放能力。

系统 AI 配置按后端当前供应商展示；DeepSeek 使用 `deepseek-flash`，思考模式开启、推理强度 `high`，新密钥只写入 `deepseekApiKey`，温度原值保留。未登记单价的模型显示“暂无价格”，不使用其他模型的单价估算费用。

采购与出口详情、报关商品、退税工作台、发票和 HS 查询在手机上使用明细卡片；采购首页优先展示新增与搜索，统计为紧凑双列。手机通过底部「更多」进入 AI，避免悬浮按钮遮住列表；设置二级菜单在手机和平板上可展开，保留港口、分类、报关公司与导出入口。

移动端回归：`npm run test:e2e -- e2e/mobile.spec.ts`（需安装 Playwright Chromium）。使用合成 API 数据，覆盖 320/390/430px 页面、长表单与横屏、核心操作和失败恢复；768/1440px 验证主要页面。该检查验证界面与客户端交互，不代表真实后端业务写入或 iOS 真机验收。

财务报表账期详情使用明确的单列网格和可收缩卡片，科目余额/明细账宽表只在卡片内横向滚动。移动验收等待延迟报表明细完成后检查整页宽度及内部滚动，避免只验证加载前的概览。

## 出货退税准备

- 现有出口详情在确认发运后打开材料清单；按报关单读取最新三单、采购和进项发票，差异补齐后一次确认并归档下载。
- `TaxRefundPreparationDialog.tsx` 支持报关单切换、刷新补件状态、资料变化后重新确认；原确认附件保留。
- 退税工作台按申报月份汇总全部待申报出货（含历史补件），分页仅影响展示，月度 Excel 全量导出。确认及核验行导出仅供管理员/财务，清单是内部准备文件。

## 流程自动推进

采购详情将生产资料保存与完工登记合并为一次操作，已签约合同可直接登记供应商完工报告；缺项仍可先保存。已确认出口合同添加装箱资料后自动进入装柜，采购收货及销售到港后的结清由收付款事实推导，无需再点完成。收货、发运、到港仍登记实际事实，后续库存自动联动。

AI 创建内部采购、报关、核销和退税草稿按用户请求直接执行；执行成功后不再显示待确认卡片，实际付款及实物状态保留一次确认。只读诊断建议不会自动执行；草稿不代表签约、出入库或官方申报。

`src/lib/api-base-url.ts` 同时用于客户端与 Next 文件代理：`NEXT_PUBLIC_API_BASE_URL` 支持裸后端 origin 或完整 `/api/v1` 地址，兼容 `NEXT_PUBLIC_API_URL`；显式自定义 API 路径保留。收付页未读取应收汇总时提示切换应收页签，避免显示永久加载。

库存页面对采购/验货来源记录展示“自动流转”，隐藏重复手工入库/出库动作；独立历史库存仍沿用既有状态机。

AI 主页面与对话框保持相同确认口径：内部草稿直接生成，付款、实物状态与异常操作确认一次。

## 注册与账号开通体验

- 注册成功后显示当前标签页的提交回执、申请邮箱和管理员操作路径；刷新或返回登录仍可查看。回执只保存邮箱和提交时间，不是实时审批状态，不保存密码、验证码或授权信息；登录成功即清除。
- 管理员从「系统管理 → 账号管理 → 未开通/已停用」搜索申请邮箱，再逐个核对身份、角色和开通开关。当前数据仅有 isActive，因此列表明确同时包含未开通与已停用账号，不推断审批来源、不自动恢复。
- 账号列表沿用 loadPaginatedCatalog 读取所有分页，避免只看前100条；刷新失败有明确提示。保存失败保留表单修改，取消不写入。
- 登录密码标签/错误说明关联实际输入，显示密码可通过键盘切换，注册和找回密码入口各一个焦点。
- 验证：登录、注册、registration-receipt、账号页、UserDialog 单测；`e2e/onboarding.spec.ts` 使用合成数据验证390/1440px核对、取消与保存，`e2e/mobile.spec.ts` 验证回执刷新。没有新增公开查询接口、改变ADMIN权限或邮箱注册默认角色。

TabSync 单测用 fake timers 执行并清理所有回退计时器，防止覆盖率运行在 jsdom 销毁后出现异步 localStorage 错误；不跳过回退行为断言。

PR32 与审批体验整合：邮箱注册、管理员新增用户均保留统一 Unicode/UTF-8 密码规则；超72字节拒绝后可修正重试，注册成功仍生成仅邮箱/时间的待审批回执，管理员取消或保存失败行为不变。

### 业务体验修复（2026-10-04）

- 采购检索通过既有 `keyword` 参数匹配合同号、供应商和商品；桌面图标操作具有合同级可访问名称。
- 出口已发运、已到港和已完成阶段展示历史装箱资料模拟核对，保留超载和未装下风险；装柜阶段发运门禁不变。
- 收付明细在手机卡片与桌面表格统一中文状态，采购已发货与出口已发运分别映射，不改变账务数据。

- 出口创建向导一次提交合同编号、表头和明细；失败重试保留同一请求键，修改内容后换键，离开页面后不触发迟到跳转。数值输入直接保存数字，成本连续输入不会重挂载整行。
- 出口合同详情在发运后禁用装箱商品导入、新增、删除和数量变更；桌面与手机保持一致，单证及历史资料仍可补录。后端销售及旧货柜入口以同事务发运/出库检查兜底。
