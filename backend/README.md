# 捷淞进销存系统 - 后端 API

> 若本文件夹结构或内容变化，请更新本文件。

## 目录说明

本目录包含进销存系统的后端 API 服务，基于 Node.js + Express + Prisma + Supabase PostgreSQL 构建。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp env.example .env
# 编辑 .env 文件，配置 Supabase 连接字符串与业务参数
```

### 3. 初始化数据库

```bash
npm run db:generate   # 生成 Prisma 客户端
npm run db:push       # 同步数据库结构到 Supabase（开发环境）
npm run db:seed       # 初始化种子数据
```

### 4. 启动服务

```bash
npm run dev   # 开发模式（热重载）
npm start     # 生产模式
```

服务默认运行在 `http://localhost:3000`

### 5. 运行测试

```bash
npm run test
```

## 目录结构

```
backend/
├── prisma/
│   ├── schema.prisma    # 数据库模型定义
│   └── seed.js          # 种子数据脚本
├── src/
│   ├── config/          # 配置文件
│   │   ├── index.js     # 环境配置
│   │   └── constants.js # 常量定义
│   ├── controllers/     # 控制器（处理HTTP请求）
│   ├── middleware/      # 中间件（认证/日志/错误处理）
│   ├── routes/          # 路由定义
│   ├── services/        # 业务逻辑层
│   ├── utils/           # 工具函数
│   └── app.js           # 应用入口
├── env.example          # 环境变量示例
├── package.json
└── README.md
```

## API 接口

### 基础路径

所有 API 路由前缀为 `/api/v1`

### 认证

除登录接口外，所有接口需要在请求头携带 JWT Token：

```
Authorization: Bearer <token>
```

### 接口列表

| 模块 | 路径前缀 | 说明 |
|------|----------|------|
| 认证 | `/api/v1/auth` | 登录/注册/用户管理 |
| 供应商 | `/api/v1/suppliers` | 供应商 CRUD |
| 门店 | `/api/v1/stores` | 门店 CRUD + 港口列表 |
| 商品 | `/api/v1/products` | 商品 CRUD + 分类 |
| 采购 | `/api/v1/purchases` | 采购合同管理 |
| 销售 | `/api/v1/sales` | 出口合同管理 |
| 货柜 | `/api/v1/containers` | 货柜管理 |
| 库存 | `/api/v1/inventory` | 库存查询和状态变更 |
| 财务 | `/api/v1/finance` | 付款记录和账款查询 |
| 系统 | `/api/v1/system` | 系统配置/日志/通知/数据导入导出 |
| AI | `/api/v1/ai` | 智能问答/辅助录入/对话历史 |

### 核心功能说明

#### 1. 数据导入导出

- **CSV导入**: `POST /api/v1/system/import` - 导入历史CSV数据
- **导入记录**: `GET /api/v1/system/import/records` - 查看导入历史
- **数据导出**: `GET /api/v1/system/export/:type` - 导出各类数据为CSV

#### 2. AI辅助录入

- **智能问答**: `POST /api/v1/ai/chat` - 与AI助手对话
- **内容解析**: `POST /api/v1/ai/parse` - 解析报价单/合同信息
- **对话历史**: `GET /api/v1/ai/history` - 获取对话记录

#### 3. 历史价格查询

- **价格历史**: `GET /api/v1/products/:id/price-history` - 商品历史价格
- **价格趋势**: `GET /api/v1/products/:id/price-trend` - 价格趋势分析
- **记录价格**: `POST /api/v1/products/:id/price-history` - 记录新价格

#### 4. 合同文件管理

- **上传文件**: `POST /api/v1/purchases/:id/files` - 上传合同附件
- **文件列表**: `GET /api/v1/purchases/:id/files` - 获取合同文件
- **删除文件**: `DELETE /api/v1/purchases/files/:fileId` - 删除文件

#### 5. 操作审计

- **操作日志**: `GET /api/v1/system/logs` - 查看用户操作记录（管理员）
- 自动记录：登录、创建、更新、删除等关键操作

### 响应格式

```json
{
  "code": 200,
  "message": "操作成功",
  "data": { ... }
}
```

### 分页响应

```json
{
  "code": 200,
  "message": "获取成功",
  "data": {
    "items": [...],
    "pagination": {
      "total": 100,
      "page": 1,
      "pageSize": 20,
      "totalPages": 5
    }
  }
}
```

## 开发说明

### 添加新模块

1. 在 `routes/` 创建路由文件
2. 在 `controllers/` 创建控制器
3. 在 `routes/index.js` 注册路由
4. 更新本 README

### 代码规范

- 每个文件不超过 500 行
- 文件头注释必须包含 Input/Output/Pos
- 函数必须有职责注释
- 单元测试使用 Node 内置 test runner（`node --test`）

## 默认账户

管理员用户名固定为 `admin`，密码来自环境变量 `DEFAULT_ADMIN_PASSWORD`。

- 若未配置 `DEFAULT_ADMIN_PASSWORD`，`db:seed` 会生成一次性随机密码并打印在终端。
- 生产环境请务必显式配置强密码并妥善保管。

## 技术栈

- **运行时**: Node.js >= 18
- **框架**: Express.js 4.x
- **ORM**: Prisma 5.x
- **数据库**: Supabase PostgreSQL
- **认证**: JWT
- **密码加密**: bcryptjs
