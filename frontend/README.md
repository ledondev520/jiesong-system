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
