# 捷淞进销存系统 — Engineering Review

> **审查视角**：工程总监（Engineering Director）
> **审查范围**：后端架构、代码质量、测试策略、安全、性能、可观测性、扩展性
> **审查日期**：2026-06-05
> **基线版本**：backend v1.0.0 / frontend Next.js 16.2.0

---

## 1. 执行摘要

捷淞系统当前处于**功能完备但工程化欠账**的阶段。业务域覆盖广（采购/销售/库存/财务/报关/退税/AI/Agent/MCP/财务报表），单体 Express 架构在中小规模下运转良好，P95 < 35ms 的本地基线也证明了基础性能不差。但随着功能持续堆砌，**单体膨胀、测试缺口、缓存缺失、可观测性薄弱**已成为制约 10x 增长的显性瓶颈。

**风险评级**：

| 维度 | 评级 | 说明 |
|------|------|------|
| 架构健康度 | 🟡 中 | 单体膨胀初显，但尚未失控 |
| 代码质量 | 🟡 中 | 技术债务可控，需尽快遏制 |
| 测试覆盖 | 🔴 低 | CI 完全不跑后端测试，mock 占比过高 |
| 安全基线 | 🟡 中 | 认证完备，限流/输入验证/审计待补强 |
| 性能优化 | 🟡 中 | 索引已补，缓存/CDN/查询优化空间大 |
| 可观测性 | 🔴 低 | 仅 stdout JSONL，无 APM/Metrics/告警 |
| 扩展能力 | 🔴 低 | 单 VPS + 内存状态，无法水平扩展 |

**核心建议**：
1. **立即补齐后端 CI 与集成测试**，这是当前最大的交付风险。
2. **Q2 内引入 Redis + 消息队列**，解耦 AI/报表/报关等慢路径。
3. **Q3 启动服务拆分预研**，将 Agent/MCP/AI 模块从核心进销存管线剥离。

---

## 2. 架构合理性评估

### 2.1 单体架构现状

当前为典型**分层单体**（Layered Monolith）：

```
Express App
├── Routes (21+ modules)
├── Controllers
├── Services (sales/finance/inventory/...)
├── Prisma ORM
└── SQLite (dev) / PostgreSQL (prod)
```

**优点**：
- 开发效率高，同一仓库内前后端协作 friction 低。
- Prisma 统一数据访问，SQL 注入风险低。
- 事务边界清晰（`prisma.$transaction` 大量使用）。

**膨胀信号**（需警惕）：
- `backend/src/routes/index.js` 挂载了 **21 个业务路由**，从核心进销存延伸到 AI Chat、Agent CLI、MCP、银行流水、数电发票、HS 编码查询、三维装箱、财务报表导入等。
- `financeService.js` **804 行**，`salesService.js` **363 行**，单一文件承担过多职责。
- Prisma Schema **992 行、35+ 模型**，跨域耦合明显（如 `SalesContract` 同时承载出口合同、货柜、装箱、报关、退税、外汇核销等多重语义）。

### 2.2 单体膨胀风险判断

**当前风险等级：🟡 黄色（需干预）**

虽然尚未到必须微服务化的程度，但以下信号表明**继续在同一进程内堆砌功能将迅速失控**：

1. **Agent/MCP/AI 模块与核心进销存共享数据库和进程**。AI 调用（OpenAI/Kimi）是典型慢 IO（秒级），与进销存核心 API（毫秒级）混跑在同一事件循环中，存在尾部延迟污染风险。
2. **银行流水与发票原始数据**（`BankTransaction`、`InvoiceRecord`）是高频写入场景，与财务结算逻辑共用同一数据库连接池，易在导入大文件时产生连接争抢。
3. **财务报表（资产负债表/利润表）**是只读分析负载，与 OLTP 交易负载混跑，缺乏读写分离。

### 2.3 架构迭代建议

**短期（1-3 个月）：模块内聚化**

将 `services/` 按**有界上下文（Bounded Context）**重组：

```
services/
├── core/               # 采购、销售、库存、财务核心
│   ├── sales/
│   ├── purchase/
│   ├── inventory/
│   └── finance/
├── customs/            # 报关、退税、外汇核销
├── ai/                 # AI Chat、HS 推荐、3D 装箱
├── agent/              # Agent CLI、MCP、权限凭证
└── data/               # 批量导入、银行流水、财务报表
```

**中期（3-6 个月）：异步解耦**

引入消息队列（BullMQ/Bull + Redis），将以下操作异步化：
- AI 助手对话与 Token 用量统计
- 银行流水/发票批量导入后的对账匹配
- 报关单生成与退税核销状态流转
- 库存预警与通知推送

**长期（6-12 个月）：服务拆分**

优先拆分 **Agent/MCP 服务**与**数据导入/报表服务**：
- 前者有独立的认证模型（AgentCredential/AgentGrant）和权限语义，与进销存用户体系差异大。
- 后者是典型 ETL + OLAP 负载，适合独立部署并对接专用读库或数据仓库。

---

## 3. 代码质量与技术债务

### 3.1 关键债务项

#### D1. 循环内聚合查询（性能隐患）

`financeService.allocatePaymentToContracts` 在 Prisma Transaction 内部**逐条 allocation 循环创建记录后，每次都调用 `syncContractPaymentAmounts`**，后者执行 `aggregate` + `update`：

```js
// financeService.js ~L470-L492
for (const alloc of allocations) {
  const payment = await tx.payment.create({ ... });
  created.push(payment);
  await syncContractPaymentAmounts(tx, { salesContractId: alloc.salesContractId });
}
```

**问题**：若一次分配 10 笔合同，同一 transaction 内会产生 10 次聚合查询 + 10 次更新。虽然 `autoMatchUnallocatedPayments` 的 N+1 已修复，但此处仍是**循环内聚合**。

**修复**：
- 在 transaction 外预计算所有合同的已收金额，transaction 内仅做批量 `createMany` + 批量 `updateMany`。
- 或改用**数据库触发器/物化视图**维护 `receivedAmount`/`paidAmount`。

#### D2. 服务层文件体积失控

| 文件 | 行数 | 问题 |
|------|------|------|
| `financeService.js` | 804 | 包含付款、应收应付、自动匹配、趋势统计、逾期预警、金额回写 |
| `salesService.js` | 363 | 合同、商品、装箱、状态机、库存联动 |

**影响**：
- 代码审查（Code Review）成本高，改动易引入回归缺陷。
- 单元测试难以聚焦，mock 复杂度随文件体积线性上升。

**修复**：按领域子服务拆分。以 financeService 为例：

```
finance/
├── paymentService.js        # 付款 CRUD + 幂等
├── allocationService.js     # 收款分配 + 自动匹配
├── receivableService.js     # 应收列表 + 逾期预警
├── payableService.js        # 应付列表
├── statsService.js          # 趋势统计 + 仪表盘
└── syncPaymentAmounts.js    # 金额回写（可内嵌或独立）
```

#### D3. 类型系统缺失

后端全量 JavaScript，无 TypeScript。虽然 Prisma Client 提供生成类型，但**服务层函数签名、控制器入参、中间件上下文均无类型约束**。

**影响**：
- 重构风险高（如 `contract.totalAmount` 在某处被当成字符串拼接）。
- 前端已用 TS 但存在类型错误，前后端契约靠人肉维护。

**修复**：
- 短期：为所有 Service 函数编写 JSDoc 类型注释，开启 VSCode `checkJs`。
- 中期：核心模块（finance/sales/inventory）渐进式迁移至 TypeScript。

#### D4. 生产环境直接 `console.log`

`salesService.js` 在库存回滚/出库时直接 `console.log`：

```js
console.log(`[库存回滚] 销售合同 ${id}: 恢复 ${revertResult.reverted} 条出库记录`);
```

**问题**：
- 无日志级别控制，无法在生产环境关闭 debug 级输出。
- 无上下文注入（requestId、userId），排障困难。
- stdout 无轮转，长期运行可能撑爆磁盘。

**修复**：引入结构化日志库（Pino/Winston），统一使用 `logger.info/warn/error`，并接入日志收集（如 Grafana Loki / CloudWatch）。

#### D5. `getStats` 全表扫描后 JS 聚合

```js
// financeService.js ~L657-L691
const receivableContracts = await prisma.salesContract.findMany({
  where: { NOT: { status: 'CANCELLED' }, totalAmount: { gt: 0 } },
  include: { packingItems: true },
});

const receivableTotals = receivableContracts.reduce((acc, contract) => { ... }, ...);
```

**问题**：加载所有未取消的销售合同及其装箱明细到内存再聚合。合同量过千后，内存占用和查询时间将急剧上升。

**修复**：
- 使用 Prisma `groupBy` + 聚合查询，或编写 Raw Query 在数据库层完成计算。
- 引入物化视图/汇总表（如 `financial_daily_summary`），由定时任务刷新。

### 3.2 债务优先级

| 债务项 | 严重度 | 修复成本 | 优先级 |
|--------|--------|----------|--------|
| D1 循环内聚合 | 高 | 低 | P0 |
| D2 服务层过胖 | 中 | 中 | P1 |
| D3 类型缺失 | 中 | 高 | P1 |
| D4 console.log | 中 | 低 | P1 |
| D5 getStats 全表扫描 | 高 | 中 | P0 |

---

## 4. 测试策略与 CI/CD

### 4.1 当前状态

**测试框架**：Node.js 内置 `node --test`（无需 Jest/Vitest 依赖，轻量）。

**测试分布**（粗略统计，排除 `node_modules`）：
- `services/*.test.js`：约 8 个（finance、inventory、agent、batchImport 等）。
- `controllers/*.test.js`：约 6 个。
- `routes/*.test.js`：约 8 个。
- `middleware/*.test.js`：约 4 个。
- `agent/**/*.test.js`：约 2 个。
- **集成测试**：仅 `src/integration/database.integration.js` 1 个。

**关键问题**：

1. **CI 完全不跑后端测试**。
   `.github/workflows/ci.yml` 三阶段（quality / test / build）全部只操作 `./frontend`，后端 `npm run test` 从未执行。
2. **Mock 测试占比过高**。
   `financeService.test.js` 全部通过替换 `prisma.xxx.findUnique = async () => ...` 实现，属于**实现感知型测试（Implementation-aware tests）**。这类测试在重构时极易失效，且无法验证真实 SQL 行为。
3. **无测试覆盖率门槛**。
   `npm run test` 未生成 coverage 报告，无法量化缺口。
4. **缺乏端到端/API 契约测试**。
   前后端接口契约靠人肉维护，无 OpenAPI/Swagger 自动化校验。

### 4.2 CI/CD 缺口

| 缺口 | 说明 | 风险 |
|------|------|------|
| 后端 CI 缺失 | ci.yml 只跑前端 | 后端代码无编译/测试把关，缺陷极易流入生产 |
| 数据库迁移校验 | deploy.yml 中 `prisma migrate deploy` 前无 schema drift 检查 | 迁移失败可能导致生产服务启动崩溃 |
| 无预发布环境验证 | staging deploy 后直接 production，无自动化冒烟 | 回归缺陷可能直接影响生产用户 |
| 无回滚机制 | deploy.sh 中 `git reset --hard` + `pm2 restart`，无快速回滚 | 故障时恢复时间（MTTR）长 |
| 无制品管理 | 依赖 git 拉取源码后在服务器构建，无 Docker 镜像仓库 | 构建环境不可复现，供应链风险 |

### 4.3 改进建议

**测试策略**：

1. **立即在 CI 中加入后端测试**：
   ```yaml
   backend-test:
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@v4
       - uses: actions/setup-node@v4
         with:
           node-version: '20'
           cache: 'npm'
           cache-dependency-path: backend/package-lock.json
       - run: cd backend && npm ci
       - run: cd backend && npm run test
       - run: cd backend && npm run test:db  # 集成测试
   ```

2. **引入测试数据库隔离**：
   使用 `sqlite::memory:` 或 `testcontainers` 启动临时 PostgreSQL，避免 mock Prisma Client。真实数据库测试能捕获 N+1、索引缺失、事务隔离级别等问题。

3. **设定覆盖率门槛**：
   使用 `c8`（Node 内置 coverage 工具）生成报告，P0 模块（finance/sales/inventory）覆盖率目标 **≥ 80%**。

4. **引入 API 契约测试**：
   使用 `zod` + `hono` 或 `express-validator` 强化入参校验，并导出 OpenAPI Spec，前端可基于 Spec 生成类型。

**CI/CD 改进**：

1. **构建 Docker 镜像并推送到镜像仓库**（GitHub Container Registry / 阿里云 ACR），部署时直接拉取镜像而非服务器构建。
2. **数据库迁移作为独立 Job**，在应用部署前执行，并配置 `prisma migrate deploy` 失败时阻断后续部署。
3. **Staging 环境增加自动化冒烟**：
   - 部署后调用 `/health` 及核心接口（list purchases/sales/finance）。
   - 使用 Playwright 或自定义脚本验证关键用户旅程。
4. **生产部署增加蓝绿或金丝雀能力**：
   短期可通过 Nginx upstream 权重切换实现零停机发布。

---

## 5. 安全加固建议

### 5.1 当前安全基线

**已做对的**：
- JWT 认证 + 角色授权（`roleAuth`、`adminOnly`）。
- 认证缓存 LRU + 禁用用户即时踢出逻辑。
- CORS 白名单（生产环境强制校验）。
- 请求日志脱敏（`security-scan.js` 覆盖 JWT、邮箱、手机、银行卡、API Key）。
- 文件权限检查（`.env` 权限 `0o600`）。
- `express-validator` 已列入依赖（但未知是否广泛使用）。
- CodeQL + TruffleHog 在 CI 中运行。

### 5.2 待加固项

#### S1. 速率限制多实例失效

`rateLimit.js` 使用**内存 Map**存储限流状态：

```js
const store = new Map();
```

**问题**：PM2 cluster 模式或 Docker 多副本时，各进程内存不共享，攻击者可通过轮询不同实例绕过限流。

**修复**：引入 Redis 存储限流状态（`rate-limit-redis`），或至少在 Nginx 层配置 `limit_req_zone` 作为兜底。

#### S2. 输入验证覆盖不完整

已知 `express-validator` 在 `package.json` 中，但无法确认是否在所有写接口（POST/PUT/PATCH）上强制执行。

**风险点**：
- `salesService.addPackingItem` 中 `data.quantity` 等字段无类型/范围校验，直接入库。
- `Payment.amount` 为 Float，如果传入字符串 `"abc"`，Prisma 会抛异常，但错误信息可能泄露数据库结构。

**修复**：
- 所有路由在 Controller 层前置 `validationResult` 检查。
- 对数值型字段增加范围校验（如 `amount > 0 && amount < 1e12`）。

#### S3. 文件上传安全

`app.js` 中 `express.json({ limit: '10mb' })`，文件上传使用 `multer`。

**风险**：
- 无文件类型白名单，可能上传可执行脚本。
- 上传目录 `./uploads` 未知是否有执行权限隔离。

**修复**：
- 限制 MIME 类型（如仅允许 `application/pdf`, `image/*`, `application/vnd.openxmlformats`）。
- 上传文件重命名为随机 ID，禁止保留原始扩展名或做二次校验。
- 上传目录配置 `nosniff` + `X-Content-Type-Options`。

#### S4. SQL 注入潜在风险

Prisma ORM 本身参数化，但系统中存在 `prisma.$queryRaw` / `$executeRaw` 的未知使用情况。如有动态拼接 SQL，需全部审计。

#### S5. Agent 凭证安全

`AgentCredential.secretHash` 使用自定义 `verifyAgentSecret`（未知算法）。需确认：
- 是否使用 bcrypt/scrypt/Argon2，而非 SHA256 等快速哈希。
- `credentialKey` 是否具备足够熵值（不应是简单自增 ID）。

---

## 6. 性能优化空间

### 6.1 数据库层

**已做**：17 个索引（status、productId、createdAt 等）。

**待优化**：

1. **复合索引缺失**：
   - `Payment` 表高频查询 `where type = ? and salesContractId = ? and paymentDate >= ?`，当前只有单列索引，需补充复合索引：
     ```prisma
     @@index([type, salesContractId, paymentDate])
     @@index([type, purchaseContractId, paymentDate])
     ```
   - `SalesContract` 的 `where status != 'CANCELLED' and totalAmount > 0` 是 `getReceivables`/`getStats` 的核心过滤条件，建议：
     ```prisma
     @@index([status, totalAmount])
     ```

2. **PostgreSQL 专项优化**：
   - 迁移至 PG 后，启用 `pg_stat_statements` 捕获慢查询。
   - 大表（如 `Payment`、`Inventory`、`OperationLog`）按时间分区（`createdAt`）。
   - `getPaymentTrends` 使用 `date_trunc('week', paymentDate)` 在数据库层聚合，而非加载全量数据到 Node 内存。

3. **连接池调优**：
   Prisma 默认连接池大小为 `2 * num_cpus + 1`，在容器化/VPS 场景下可能不足。建议显式配置：
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
     directUrl = env("DIRECT_URL") // 用于迁移
   }
   ```
   并在 `DATABASE_URL` 中增加连接池参数：`?connection_limit=20&pool_timeout=10`。

### 6.2 缓存层

**当前状态**：无缓存，每次请求直连数据库。

**引入 Redis 的收益场景**：

| 场景 | 当前行为 | 优化后 |
|------|----------|--------|
| 仪表盘统计 | 每次请求聚合全表 | Redis 缓存 5 分钟，更新时异步刷新 |
| 销售合同列表 | 每次翻页查 DB + count | 热点页缓存 1 分钟 |
| 用户认证 | 每次请求查 DB 或 LRU（60s） | Redis 缓存 JWT 黑名单 + 用户角色 |
| HS 编码查询 | 每次调外部 API | Redis 缓存结果 24h |
| 3D 装箱计算 | CPU 密集型实时计算 | 缓存相同 SKU 组合的装箱结果 |

**建议**：引入 `ioredis`，封装 `cacheService.js`，支持 `Cache-Aside` 模式与 TTL 管理。

### 6.3 CDN 与静态资源

- 前端为 Next.js，生产构建后静态资源应通过 CDN（Cloudflare / 阿里云 CDN）分发，减轻 Nginx 和前端服务负载。
- 上传文件（合同附件、报关单 PDF）应从本地磁盘迁移至对象存储（OSS/S3），并通过 CDN 域名回源。

### 6.4 API 与查询优化

1. **`salesService.getSalesContracts` 的 `lite` 模式**：
   当前实现通过 `include` 条件分支控制字段，但 Prisma `include` 仍会产生 JOIN。建议 `lite=true` 时完全避免 `packingItems` 查询，或改用 `select` 精确字段。

2. **GraphQL / 按需字段**：
   前端列表页往往不需要全部关联字段，长期可考虑引入 `json-api` 规范或轻量 GraphQL，减少 Over-fetching。

---

## 7. 可观测性评估

### 7.1 当前状态

**日志**：
- `requestLogger`：输出 JSONL 到 stdout/stderr，含 method、url、status、duration、脱敏后的 body。
- `errorHandler`：`console.error` 输出错误消息和堆栈（仅开发环境）。

**监控**：
- `/health` 端点：仅返回 `{ status: 'ok', timestamp, version }`，无数据库/Redis/外部 API 依赖检查。
- 无 Prometheus /metrics 端点。

**告警**：无。

### 7.2 缺口分析

| 维度 | 现状 | 目标 |
|------|------|------|
| 日志聚合 | stdout 落地服务器磁盘 | 接入 Loki / CloudWatch Logs / SLS |
| 指标（Metrics） | 无 | 暴露 `/metrics`（prom-client），追踪 QPS、P95/P99、DB 查询耗时、外部 API 耗时 |
| 链路追踪（Tracing） | 无 | 引入 OpenTelemetry，追踪请求在 Controller → Service → Prisma → AI API 的全链路 |
| 告警 | 无 | 配置 P99 > 500ms、错误率 > 1%、磁盘 > 80% 等阈值告警（PagerDuty/飞书/钉钉） |
| 健康检查 | 极简 | 深度探针：DB 连接、Prisma 查询、Redis 连通性、外部 API（Kimi/HSCIQ）可用性 |

### 7.3 快速落地建议

**Phase 1（1 周内）**：
- 使用 `prom-client` 暴露基础指标：HTTP 请求数/耗时、Node 事件循环延迟、内存/GC 情况。
- 增强 `/health` 端点，增加数据库 `SELECT 1` 探测。

**Phase 2（1 个月内）**：
- 引入 `pino` 替代 `console.log`，配置 `pino-pretty`（开发）和 `pino-loki`（生产）。
- 为所有 Service 函数增加耗时埋点：
  ```js
  const timer = metrics.dbQueryDuration.startTimer({ operation: 'salesContract.findMany' });
  const result = await prisma.salesContract.findMany(...);
  timer();
  ```

**Phase 3（3 个月内）**：
- 接入 OpenTelemetry，追踪跨服务调用（为未来拆分做准备）。
- 配置告警规则，对接企业 IM（飞书/钉钉机器人）。

---

## 8. 10x 增长架构演进路径

假设当前用户规模为 **N**（并发 < 50，数据量 < 10万行），目标支撑 **10N**（并发 500+，数据量百万级）。

### 8.1 瓶颈预判

| 增长倍数 | 预期瓶颈 | 当前架构能否支撑 |
|----------|----------|------------------|
| 2x | SQLite → PG 迁移完成，单 VPS 负载上升 | ✅ 可支撑 |
| 3x | 数据库连接池耗尽、慢查询暴露、内存限流失效 | ⚠️ 需优化 |
| 5x | 单节点 CPU/内存饱和、AI 调用阻塞核心 API、文件磁盘满 | ❌ 需架构升级 |
| 10x | 数据库主库压力、OLAP 查询拖垮 OLTP、单点故障 | ❌ 必须重构 |

### 8.2 演进路线

```
Phase 1: 夯实基线（0-3个月）
├── 后端 CI/CD 补齐
├── 引入 Redis（缓存 + 分布式限流 + Session）
├── 数据库连接池调优 + 慢查询治理
├── 日志与 Metrics 上线
└── getStats / getPaymentTrends 数据库层聚合优化

Phase 2: 读写分离与异步化（3-6个月）
├── PostgreSQL 主从复制，报表/查询走只读副本
├── 引入 BullMQ，异步化：AI 调用、批量导入、报表生成、通知推送
├── 文件存储迁移至 OSS/S3 + CDN
├── Nginx 负载均衡 + 后端多实例部署
└── 核心模块 TypeScript 迁移

Phase 3: 服务拆分（6-12个月）
├── 拆分 Agent/MCP 服务（独立部署、独立认证、独立扩缩容）
├── 拆分 Data Import / ETL 服务（高内存/CPU 独立伸缩）
├── 拆分 Notification / Webhook 服务
├── 核心进销存服务保留单体（足够支撑 10x），但数据库按域拆分读写库
└── 引入 API Gateway（Kong/Traefik），统一认证、限流、日志

Phase 4: 全球化与合规（12个月+）
├── 多区域部署（如中东客户就近接入）
├── 数据库按区域分片 / 全局复制
└── 数据合规（GDPR / 中国数据安全法）审计与加密
```

### 8.3 关键技术决策

| 决策 | 建议方案 | 理由 |
|------|----------|------|
| 缓存 | Redis (单实例 → Sentinel → Cluster) | 生态成熟，支持限流、分布式锁、消息队列 |
| 消息队列 | BullMQ (Redis 基础) | 与现有 Redis 投资复用，支持延迟任务、重试、监控面板 |
| 日志 | Pino + Loki / SLS | 高性能 JSON 日志，与 Grafana 生态无缝集成 |
| 指标 | prom-client + Grafana Cloud / 阿里云 Prometheus | Node.js 原生支持，社区仪表盘丰富 |
| 对象存储 | 阿里云 OSS / AWS S3 | 国内部署优选阿里云，CDN 回源成本低 |
| API Gateway | Traefik / Nginx + Lua | 当前 Nginx 已存在，短期增强 Lua 插件，长期考虑 Kong |

---

## 9. 优先级路线图（Roadmap）

### Q2 2026（当前季度）：止血与基线

- [ ] **P0** 在 CI 中接入后端 `npm run test` 与 `npm run test:db`。
- [ ] **P0** 修复 `allocatePaymentToContracts` 循环内聚合查询。
- [ ] **P0** 修复 `getStats` 全表扫描，改为数据库层聚合。
- [ ] **P1** 引入 Redis，替换内存限流，支撑分布式部署。
- [ ] **P1** `console.log` 全量替换为 `pino` 结构化日志。
- [ ] **P1** 补充 `/metrics` 端点与基础 Dashboard。

### Q3 2026：性能与解耦

- [ ] **P0** PostgreSQL 主从复制，报表/列表查询走只读副本。
- [ ] **P0** 引入 BullMQ，异步化 AI 调用、批量导入、库存预警。
- [ ] **P1** 服务层按领域拆分（finance/sales/inventory 子目录）。
- [ ] **P1** 文件存储迁移至 OSS，前端静态资源接入 CDN。
- [ ] **P1** 核心模块启动 TypeScript 迁移。

### Q4 2026：扩展性与可靠性

- [ ] **P0** 容器化部署标准化（镜像构建 → 镜像仓库 → K8s/Docker Swarm）。
- [ ] **P0** 生产环境蓝绿部署或金丝雀发布能力。
- [ ] **P1** Agent/MCP 模块服务化拆分（独立进程/独立数据库）。
- [ ] **P1** OpenTelemetry 全链路追踪上线。
- [ ] **P1** 告警体系（P99、错误率、磁盘、业务指标）对接企业 IM。

---

## 10. 结语

捷淞系统展现了极强的业务落地能力——从核心进销存到 AI 助手、Agent CLI、MCP 集成，功能覆盖面在同体量产品中非常突出。但工程化层面正处于**从“功能驱动”向“质量驱动”转型的关键节点**。

当前最大的风险不是单体架构本身，而是：
1. **测试缺口导致缺陷流入生产**；
2. **缓存与异步缺失导致性能瓶颈被增长放大**；
3. **可观测性薄弱导致故障定位困难**。

建议团队在未来 3 个月内优先补齐 CI/CD、缓存层和核心慢查询优化，为 10x 增长打下坚实的工程基座。

---

> **报告产出**：`docs/ENG_REVIEW.md`
> **下次评审建议时间**：2026-09-05（三个月后）
