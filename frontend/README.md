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
- `vitest.config.ts`: Vitest 测试配置
- `playwright.config.ts`: Playwright 配置

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

# 运行单元测试
npm run test

# 单元测试开发模式
npm run test:watch

# 单元测试覆盖率
npm run test:coverage

# 自动化验收测试
npm run test:e2e
```

## 登录与联调排查

- 管理员账号：`admin`，密码来自 `backend/.env` 的 `DEFAULT_ADMIN_PASSWORD`
- 前端 API 默认走 `/api/v1`，由 Next.js 代理到 `http://localhost:3000/api/v1`
- 出现登录 `500` 时，优先确认后端 `backend` 服务是否已启动（`cd backend && npm run dev`）
- 主题支持白天/夜间模式切换（Header 右上角主题按钮）

认证提示由 `src/lib/auth-session.ts` 统一处理：无本标签令牌的 401 进入普通登录页；持有失效令牌才显示会话过期。令牌仍按标签保存在 sessionStorage。

全局搜索复用各模块的 `lite` 列表，旧查询完成后不会覆盖当前查询。商品页只在 URL 关键词变化时同步输入，允许修改或清空全局搜索带入的关键词。

财务概览手动刷新同时失效页面缓存与 HTTP GET 缓存，确保重新读取后端数据。

手机端 Header 使用图标展开全局搜索；共享弹窗限制在动态视口高度内滚动并处理安全区。手机输入字号至少 16px、常用按钮至少 44px，列表卡片完整换行展示字段；保留浏览器缩放能力。

采购与出口详情、报关商品、退税工作台、发票和 HS 查询在手机上使用明细卡片；采购首页优先展示新增与搜索，统计为紧凑双列。手机通过底部「更多」进入 AI，避免悬浮按钮遮住列表；设置二级菜单在手机和平板上可展开，保留港口、分类、报关公司与导出入口。

移动端回归：`npm run test:e2e -- e2e/mobile.spec.ts`（需安装 Playwright Chromium）。使用合成 API 数据，覆盖 320/390/430px 页面、长表单与横屏、核心操作和失败恢复；768/1440px 验证主要页面。该检查验证界面与客户端交互，不代表真实后端业务写入或 iOS 真机验收。

## 出货退税准备

- 现有出口详情在确认发运后打开材料清单；按报关单读取最新三单、采购和进项发票，差异补齐后一次确认并归档下载。
- `TaxRefundPreparationDialog.tsx` 支持报关单切换、刷新补件状态、资料变化后重新确认；原确认附件保留。
- 退税工作台按申报月份汇总全部待申报出货（含历史补件），分页仅影响展示，月度 Excel 全量导出。确认及核验行导出仅供管理员/财务，清单是内部准备文件。

## 流程自动推进

采购详情将生产资料保存与完工登记合并为一次操作，已签约合同可直接登记供应商完工报告；缺项仍可先保存。已确认出口合同添加装箱资料后自动进入装柜，采购收货及销售到港后的结清由收付款事实推导，无需再点完成。收货、发运、到港仍登记实际事实，后续库存自动联动。

AI 创建内部采购、报关、核销和退税草稿按用户请求直接执行；执行成功后不再显示待确认卡片，实际付款及实物状态保留一次确认。只读诊断建议不会自动执行；草稿不代表签约、出入库或官方申报。
