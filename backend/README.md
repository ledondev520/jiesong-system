# 捷淞进销存系统 - 后端 API

> 若本文件夹结构或内容变化，请更新本文件。

## 目录说明

本目录包含进销存系统的后端 API 服务，基于 Node.js + Express + Prisma + Supabase PostgreSQL 构建。

当前VPS使用SQLite与绝对DATABASE_URL（见DEPLOY.md）。密码找回路由使用锁定express-rate-limit；`TRUSTED_PROXY_CIDRS` 默认空，显式可信IP/CIDR配置及生产一致备份前置条件见 `../docs/security/password-recovery.md`。不要使用固定本地dev.db备份替代生产数据库。

`src/testHelpers/account-name-server.js` 为两个用户页面的普通名称回归提供已提交迁移初始化的私有SQLite/localhost服务，不查询凭据字段或调用外部服务；夹具目录边界见 `src/testHelpers/README.md`，真实HTTP与React执行层级见 `../docs/qa/account-name-lifecycle-2026-10-06.md`。

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
npm run db:migrate    # 自动备份后应用迁移，禁止 db push
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
npm run test              # 单元/模块测试
npm run test:db           # 数据库集成测试（临时 SQLite：schema + 事务 + seed 幂等 + 真实 HTTP 业务闭环）
npm run test:carrier-pdf  # 真实船司 PDF 边缘集成（迁移后的临时 SQLite、default pdfjs、原件归档与准备度）
npm run test:all          # 依次执行 test → test:db → test:carrier-pdf；任一阶段失败即停止
```

`test:db` 包含 `src/integration/overview-source-readbacks.integration.js` 的三类真实只读概览验收：上海发运期间与销售下钻的 CNY 毛利/净现金、当前所有权应收应付、固定 UTC 收付趋势来源。使用已提交迁移、独立 SQL 字面夹具和全库非变更断言，保留合同汇总余额与逐笔 USD 收款的不同用途；已在当前 CI Node 20.19.0 验证，Date/object-form mock timers 最低需 20.11，另需 Python 3，不访问现有业务库。

`src/integration/application-audit-readback.integration.js` 验证系统日志实际 HTTP 查询与 CSV：八类关键词/IP、组合日期/角色/实体过滤、分页独立导出、完整旧新值与空用户、中文引号换行及真实生成审计的重复读取。只用已提交迁移、0700/0600 合成 SQLite 与独立只读全表快照；SQLite `contains` 保留既有 LIKE 子串语义，禁止在日志查询中传入不支持的 Prisma `mode`。现有页面只有摘要列表，完整记录经同一列表 DTO 验证，没有新增详情端点；不构成浏览器通过。证据与边界见 [系统日志回归](../docs/quality/application-audit-readback-2026-10-06.md)。
`ordinary-setting-text.integration.js` 仅验证既有 `invoiceTitleInfo` 的合成公司固定文本单键保存、重复保存、实际私有库约束失败、明确重试、清空与独立回读。使用已提交迁移、现有合成 ADMIN 与正常限流/审计，配置表始终只含该普通文本键；不能替代当前含汇率/AI 参数的整表 UI 保存验收。范围说明见 `docs/quality/ordinary-setting-text-20261006.md`。
`test:db` 也包含 `src/integration/email-registration-http.integration.js`：真实 localhost HTTP 发码 200 → 注册 201 → 重放 400，独立安全字段 SQL 回读确认一个未激活 SALES 账号，响应不发 token/Set-Cookie。仅模拟邮件出口，保留真实校验、bcrypt、事务及限流；只创建私有临时合成库，不激活或登录新账号，不覆盖浏览器。

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
| 系统 | `/api/v1/system` | 系统配置/日志/通知 |
| 数据导入导出 | `/api/v1/import` `/api/v1/export` | 导入/导出任务与历史 |
| AI | `/api/v1/ai` | 智能问答/辅助录入/对话历史 |

### 核心功能说明

#### 收款分配与来源关联

- `POST /finance/payments/:id/allocate` 是新建来源关联收款的唯一入口。来源必须是未关联购销合同/其他来源的正金额到账记录；逐条分配金额必须是有限正数，并关联实际存在的销售合同
- 分配在 SQLite 写锁后的同一事务内校验来源状态和剩余余额，全部成功才写入子记录和合同应收汇总；沿用原有 0.01 金额容差及角色权限，不新增汇率换算
- 历史到账币种接受既有规范化语义；只把新分配子记录存为 `USD`，不改写历史来源的币种或金额
- 通用 `POST /finance/payments` 对新的非空 `sourcePaymentId` 明确返回 400，避免跳过分配余额校验。普通未关联到账、直接合同收款和已有幂等键记录的只读重放仍受支持；已有来源关联响应字段保留
- 隔离实际 HTTP/SQLite 验收及未覆盖范围见 `docs/api-contracts/收款分配链路验收.md`；这只是内部记账，不代表外部汇款或财务审批

#### 1. 数据导入导出

- **CSV导入**: `POST /api/v1/import` - 导入历史CSV数据
- **导入历史**: `GET /api/v1/import/records` - 查看导入历史
- **数据导出**: `GET /api/v1/export/:type` - 导出各类数据为CSV

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

#### 6. 财务写入幂等

- **创建付款**: `POST /api/v1/finance/payments`
- 可选请求头：`X-Idempotency-Key`
- 相同幂等键重复提交时复用首次结果，避免重复入账

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

本地HS字典的 `src/testHelpers/hs-code-browser-server.test.js` 随 `npm test` 自动发现；六项合同检查使用已提交迁移、真实现有角色登录/HTTP与独立只读SQLite，覆盖名称/数字前缀/组合交集、详情、手工证据保存回读、缓存刷新、失败与现有读角色零写入，以及夹具拒绝非测试/不安全目录/缺少IPC。无AI、外部HS或生产访问；浏览器结果另以hosted CI为准。

## 默认账户

管理员用户名固定为 `admin`，密码来自环境变量 `DEFAULT_ADMIN_PASSWORD`。

- 若未配置 `DEFAULT_ADMIN_PASSWORD`，`db:seed` 默认将管理员密码设为 `123456`（仅测试阶段使用）。
- 生产环境请务必显式配置强密码并妥善保管。

## 技术栈

- **运行时**: Node.js >= 18
- **框架**: Express.js 4.x
- **ORM**: Prisma 5.x
- **数据库**: Supabase PostgreSQL
- **认证**: JWT
- **密码加密**: bcryptjs

`test:db` 需要 Python 3 自带的 sqlite3；从 schema 生成空库，使用合成资料验证分批验货、两次出货、库存守恒、单据归档和权限，不读取现有业务库。`warehouse-exceptions.integration.js` 补充 WAREHOUSE 的跨批次 FIFO、来源库存隔离、待验/复验排除、超分配与失败发运原子回滚；负数/零自有出库量拒绝发运，空草稿与非自有拼柜保持可用。

Agent SDK 固定为含 `dist/index.js` 的发布版本 `0.2.4`，`npm ci` 后可直接加载，不依赖本地 `.tmp` 构建。普通与流式入口均走本地 Anthropic 兼容代理，保留关闭重试、失败不写成功记录的测试。

`sales-transition-races.integration.js` 使用两个真实 HTTP 进程共享专用临时 SQLite，覆盖同一销售合同的取消/发运、到港/结清及陈旧状态请求。测试在真实查询完成后短暂暂停首个事务，再排入另一个请求，验证当前状态重读、一次扣库、发运时间及收款账簿守恒；不模拟数据库结果、不访问既有业务库。
