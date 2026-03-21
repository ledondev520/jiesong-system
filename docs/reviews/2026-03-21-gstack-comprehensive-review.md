# 捷淞系统综合评审报告 2026-03-21

> 技术总监视角 · 基于仓库代码 + 历史 PLAN/RISKS/TASKS 文档 + 近期迭代记录

---

## 评审背景

- **时间节点**：2026-03-21，距上一轮三维评审（2026-03-20）约 1 天
- **评审方法**：静态代码阅读 + 文档链路分析 + 测试配置审查
- **覆盖范围**：后端路由/中间件/控制器、前端关键页面、测试体系、安全配置、近 60+ 轮迭代回顾
- **评审员角色**：技术总监（兼顾产品、工程、安全三维度）

---

## 一、CEO/产品视角

### 1.1 当前系统状态评估

| 维度 | 评分 | 说明 |
|------|------|------|
| 业务覆盖完整度 | 7/10 | 采购→销售→货柜→库存→财务→退税→报关全链路贯通，但执行层工具尚浅 |
| 核心流程可用性 | 7/10 | CRUD 可用，但缺乏批量操作、智能提醒与数据校验闭环 |
| 管理层决策支撑 | 6/10 | 财务驾驶舱已有但数据深度有限，缺趋势分析与归因 |
| 移动端可用性 | 4/10 | 无移动导航（R-019 已知，未修复） |
| AI 辅助效果 | 6/10 | AI 助手接入但功能局限于对话，缺自动化工作流 |
| **综合评分** | **6/10** | 可用但距"好用"有明显距离 |

### 1.2 核心业务价值链分析

```
供应商 → 采购合同 → 库存入库 → 装箱（货柜）→ 出口销售合同
                                    ↓
                             报关单 → 退税草稿 → 外汇核销
                                    ↓
                             财务应收/应付 → 收付款流水
```

**已贯通路径**：采购→销售→库存→财务→退税→报关单（自动草稿）  
**断点路径**：退税审批流程、外汇核销状态跟踪、供应商结款周期、门店经营报表

### 1.3 未覆盖的用户需求（产品缺口）

| 缺口 | 影响用户 | 紧迫度 | 说明 |
|------|----------|--------|------|
| 移动端导航入口 | 所有用户 | Critical | `R-019` 已记录 18 轮仍未修复 |
| 财务趋势分析（月度/季度） | 管理层 | High | 驾驶舱仅有快照无趋势 |
| 应收账款逾期催收提醒 | 财务/销售 | High | 当前无逾期维度 |
| 退税进度跟踪（状态机） | 财务 | High | 退税模块仅有 CRUD，无状态流转 |
| 供应商付款计划排期 | 采购 | Medium | 应付账款无 due date 维度 |
| 经营执行中台任务提醒实际触达 | 运营 | Medium | OPS-EXEC-03 提醒引擎已建，但无 IM/短信推送 |
| 门店采购清单模板版本管理 | 运营 | Medium | 当前模板保存在 SystemConfig，不支持历史版本 |
| 批量合同状态变更 | 销售/采购 | Low | 每次需逐条操作 |

### 1.4 下一个最有价值的产品投资方向

**首选：应收账款逾期预警 + 财务趋势看板（2 周，高杠杆）**

理由：财务驾驶舱已有框架，补充时间维度（近 30/90 天趋势）+ 逾期预警，管理层使用频率将从"偶尔查看"升为"每日必看"，ROI 最高。

---

## 二、工程视角

### 2.1 架构健康度评分

**综合评分：7/10**

```
┌─────────────────────────────────────────────────────────┐
│                     捷淞进销存系统架构                    │
├─────────────────────────────────────────────────────────┤
│  前端（Next.js 14 App Router）                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ page.tsx │  │ service  │  │ hooks/   │              │
│  │ (wrapper)│→ │  .ts     │→ │ lib/axios│ ─→ GET缓存   │
│  └──────────┘  └──────────┘  └──────────┘    180s TTL  │
├─────────────────────────────────────────────────────────┤
│  HTTP / REST（/api/v1/*）                               │
│  Bearer JWT + roleAuth 中间件                           │
├─────────────────────────────────────────────────────────┤
│  后端（Express + Prisma）                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │  routes  │→ │controller│→ │ service  │→ Prisma ORM  │
│  │ (+RBAC)  │  │ (HTTP层) │  │ (业务层) │             │
│  └──────────┘  └──────────┘  └──────────┘              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ auditLog │  │ roleAuth │  │compress  │              │
│  │ 中间件   │  │ 中间件   │  │ 中间件   │              │
│  └──────────┘  └──────────┘  └──────────┘              │
├─────────────────────────────────────────────────────────┤
│  数据层（Supabase PostgreSQL）                           │
│  SystemConfig KV | 业务表 | HsCode(905条) | 审计日志    │
└─────────────────────────────────────────────────────────┘
```

**优势**：路由/控制器/服务层三层分离已落地，审计中间件全量接入，GET 请求缓存与压缩已启用。

**主要结构问题**：

1. **`authenticate()` 每请求打一次 DB**（`backend/src/middleware/auth.js:48`）  
   每个 API 调用都执行 `prisma.user.findUnique`，无任何内存缓存层。高并发时 DB 连接压力集中在认证路径。

2. **SystemConfig 仍是万能 KV 桶**  
   `OPS-EXEC-*` 的负责人映射、采购清单模板、提醒任务数据均写入 `SystemConfig`，缺乏结构约束和查询效率。`configController.js` 的 `CONFIG_DOMAIN_MAP` 是应用层补救，非根治。

3. **ops-execution 页面引用错误 Tab 常量**（`frontend/src/app/dashboard/ops-execution/page.tsx:13`）
   ```tsx
   import { ModuleTabHeader, FINANCE_TABS } from '@/components/layout/ModuleTabHeader';
   // ...
   <ModuleTabHeader tabs={FINANCE_TABS} moduleName="财务" />
   ```
   经营执行中台用的是 `FINANCE_TABS`，且 `moduleName` 写的是"财务"——明显的 copy-paste 残留，影响导航高亮和语义。

4. **configController 中存在空 catch 块**（`backend/src/controllers/system/configController.js:155`）
   ```js
   try {
     const parsed = JSON.parse(config.value);
     // ...
   } catch {}  // 静默失败，解析失败返回硬编码 fallback，无日志
   ```
   JSON 格式错误时静默兜底，调试困难。

5. **财务页面货币单位不一致**（`frontend/src/app/dashboard/finance/page.tsx`）  
   应付账款用 `¥`（人民币），应收账款用 `$`（美元）。驾驶舱混用两种货币，"账款健康度"横幅中混排会造成阅读混乱（第 190、244 行）。

### 2.2 安全性评估

| 风险 | 严重程度 | 状态 | 位置 |
|------|----------|------|------|
| 种子脚本默认密码 `123456` | **Critical** | ⚠ 已知，Round 54 引入 | `backend/prisma/seed.js` |
| `authenticate()` 每请求查 DB | **High** | 未修复 | `backend/src/middleware/auth.js:48` |
| `SystemConfig.apiKey` 脱敏依赖应用层（`secretCrypto`），若绕过接口直查 DB 则明文可见 | **High** | 部分缓解 | `backend/src/utils/secretCrypto.js` |
| `GET /system/export/:type` 权限过宽（全角色可访问，包括 SALES/WAREHOUSE 导出全量财务数据） | **High** | `system.js:122` | `roleAuth('ADMIN','FINANCE','PURCHASE','SALES','WAREHOUSE')` |
| `PUT /system/notifications/:id/read` 无所有者校验（任何角色可标记他人通知为已读） | **Medium** | `system.js:48` | 无 `userId === req.user.id` 检查 |
| 快捷登录将账号密码明文存 localStorage | **Medium** | Round 19/54/58 引入 | `frontend/src/app/(auth)/login/page.tsx` |
| 外部部署平台 ClawPi 旧域名可能仍在环境变量中 | **Medium** | `R-033` 已记录，未复核 | 仓库外，需人工核查 |
| JWT `secret` 默认值未在启动时校验强度 | **Medium** | 未记录 | `backend/src/config/index.js` |
| 移动端 Dashboard 无导航 | **Low** | `R-019`，18 轮未修复 | `frontend/src/components/layout/Sidebar.tsx` |

**已修复项**（本轮迭代内）：
- `rememberMe` 复选框可访问性（Round 42，`A11Y-02 DONE`）
- 注册流程改为管理员邀请制（Round 32）
- 审计日志全量接入写操作（Round 35）
- 导出操作记入审计（`system.js:122-135`）

### 2.3 代码质量发现

**DRY 违规：**

- `SettingsPageContent.tsx` 中 `saveConfig()` 被 `onSubmit`、`handleAddUnit`、`handleDeleteUnit`、`handleAddBroker`、`handleDeleteBroker` 五处调用，模式一致但没有统一错误处理逻辑，每处都需要独立 `try/catch`（第 181-188、194-200 行）。

- `finance/page.tsx` 内 `loadData(isRefresh)` 函数混合了"首次加载"与"刷新"两种状态，`setLoading`/`setRefreshing` 对称设置容易遗漏，建议抽取 `useFinanceData` hook。

**错误处理缺口：**

- `configController.js:155` 的空 `catch {}` 已述。
- `SettingsPageContent.tsx` 的 `handleDeleteUnit/handleDeleteBroker` 捕获 catch 后无 toast 提示（第 197-200 行），用户删除失败无感知。
- `finance/page.tsx` 加载失败仅 `console.error`，无降级 UI（第 76-78 行），用户看到空白界面无法区分"无数据"与"加载失败"。

**复杂度：**

- `SettingsPageContent.tsx` 约 600 行，混合表单、数据字典、导出、用户管理、AI 工具五类关注点。虽已做 wrapper/content 拆分，但 content 本身仍需继续拆分。

### 2.4 测试覆盖率分析

**前端测试现状：**

```
vitest.config.ts coverage.include:
  src/components/**/*.ts(x)   ← 已覆盖
  src/lib/**/*.ts             ← 已覆盖
  src/services/**/*.ts        ← 已覆盖
  ❌ src/app/**               ← 完全排除（最大业务逻辑集中地）

coverage.thresholds:
  statements: 15   ← 极低，等同无门禁
  lines: 15
  functions: 25
  branches: 20
```

**这意味着**：当前 CI coverage 门禁形同虚设——所有页面级业务代码（`/dashboard/*`）都不在统计范围内，而 `FE-COV-98` 计划目标已确认后续需扩围，但执行停留在 plan 阶段。

**后端测试基线**（Round 51）：
```
lines:    63.88%   ← 差距明显
branches: 61.74%   ← 超过 1/3 分支未覆盖
functions: 55.40%  ← 接近一半函数无测试
```

**已有测试亮点**：
- E2E Playwright：52/52 smoke + button-coverage（有效回归基础设施）
- 审计中间件、AI 降级、RBAC 路由均有定向测试
- 数据库集成测试 3/3（事务回滚/幂等验证）

**缺失：**
- 财务幂等 `X-Idempotency-Key` 的重复提交拒绝场景（仅服务层测试，无集成测试）
- 库存状态机非法流转的 E2E 测试
- `authenticate()` DB 查询失败的中间件测试

### 2.5 性能潜在问题

| 问题 | 位置 | 影响 | 建议 |
|------|------|------|------|
| `authenticate()` 每请求查 DB | `auth.js:48` | 高并发时认证成瓶颈 | 加内存 LRU 缓存（TTL 60s，大小 1000） |
| `SystemConfig.findMany()` 每次读全量 KV | `configController.js:57` | 无分页、无缓存，配置越积越慢 | 按域缓存，写时失效 |
| 审计日志 before/after 快照为同步 DB 写 | `middleware/auditLog.js` | 高频写接口（库存批量更新等）RT 上升 | 低优先级路由改为异步写队列 |
| GET 缓存 TTL 180s 与写后失效策略 | `frontend/src/lib/axios.ts` | 跨标签页数据陈旧 180s | 已知可接受，但需在文档中明确边界 |
| AI 助手首屏挂载在 `/dashboard*` 全路径 | `app/layout.tsx` | 任何 dashboard 子页均需加载 AI 组件 | 已 Lazy mount，但仍在 `dashboard*` 下全量挂载，可收敛到用户触发后懒加载 |

### 2.6 可观测性与审计追踪评估

**已建立：**
- 审计中间件（`withAuditLog`）全量接入核心写操作路由 ✅
- 导出操作记入审计日志 ✅
- CSV 审计日志导出接口 ✅
- AI 降级日志（CI/test 环境）✅
- 低库存预警通知（去重逻辑）✅

**缺口：**
- **无结构化日志格式**：后端 `console.error` 混用，生产环境难以聚合分析
- **无错误率监控**：Sentry 已接入前端（`@sentry/nextjs`），但后端无对应配置
- **无 API 响应时间追踪**：无法识别哪条路由 RT 在劣化
- **审计日志本身无保留策略**：长期运行后 `operation_logs` 表将无限增长

---

## 三、本轮迭代回顾

### 3.1 已完成的改进

本轮评审周期（2026-03-19 至今，基于 PLAN.md + 2026-03-20 三维评审后的执行）：

| ID | 内容 | 完成状态 |
|----|------|----------|
| REV-01 | ClawPi 旧域名全仓扫清 + 前端 API 基址统一（`api-base-url.ts`） | ✅ 完成 |
| REV-02 | 经营执行中台（OPS-EXEC-01~03）：未发货清单 + 采购清单 + 任务提醒引擎 | ✅ 完成 |
| REV-03 | 财务驾驶舱重构（KPI + 进度条 + 汇率 + 紧迫预警 + 快捷导航） | ✅ 完成 |
| REV-04 | 设置页信息架构瘦身（新增运维中心Tab，归拢日志/通知/导入记录） | ✅ 完成 |
| REV-05 | SystemConfig 分域控制器（`configController.js` + `getConfigsByDomain`） | ✅ 完成 |
| REV-06 | 导出审计日志强化（`GET /system/logs/export/csv` + 扩展过滤参数） | ✅ 完成 |
| REV-07 | AI 助手 z-index 与可见性治理（Lazy mount + 仅 dashboard 路径挂载） | ✅ 完成 |
| REV-08 | Vitest testTimeout 稳定化（20000ms）防止 CI 假红 | ✅ 完成 |

### 3.2 实施质量评估

| 改进项 | 质量评价 | 遗留问题 |
|--------|----------|----------|
| REV-01 ClawPi 扫清 | ✅ 优：有回归测试，有文档 | 外部环境（Vercel env vars）仍需人工核查 |
| REV-02 经营执行中台 | ⚠ 良：功能可用，但 `FINANCE_TABS` 引用错误和 `moduleName="财务"` 需修正 | ops-execution 不应用 FINANCE_TABS |
| REV-03 财务驾驶舱 | ⚠ 良：视觉清晰，但货币混用（¥/\$）和错误处理缺 fallback UI | 应付/应收货币展示不一致 |
| REV-04 设置页 IA | ✅ 优：信息架构清晰，Tab 分层合理 | 600 行组件仍需下一步拆分 |
| REV-05 SystemConfig 分域 | ✅ 优：CONFIG_DOMAIN_MAP 设计合理，向后兼容 | KV 存储本质未变，数据量大后仍有瓶颈 |
| REV-06 审计日志导出 | ✅ 优：有过滤参数，有 CSV 下载 | 无日志保留策略 |
| REV-07 AI Lazy mount | ✅ 优：减少首屏包体 | 仍在 dashboard* 全量挂载，可进一步收敛 |
| REV-08 Vitest 超时 | ✅ 优：治标有效 | Coverage 口径仍排除 src/app，门禁形同虚设 |

---

## 四、30天研发计划建议

### P0（本周必做，安全/正确性）

| 任务 | 工作量 | 负责人 | 验收标准 |
|------|--------|--------|----------|
| 修复 `ops-execution/page.tsx` 的 `FINANCE_TABS`/`moduleName` 引用 | 0.5h | 前端 | lint + 单测通过，Tab 高亮正确 |
| 修复财务驾驶舱货币混用（统一应收为 USD，应付为 CNY，标注清楚） | 2h | 前端 | 代码审查 + finance 页面测试通过 |
| `authenticate()` 加 LRU 内存缓存（TTL 60s，size 1000） | 4h | 后端 | 压测下 DB 查询频率降低 90% |
| 修复 `configController.js` 空 `catch {}` 加日志 | 0.5h | 后端 | 错误可观测 |
| `handleDeleteUnit/Broker` 补充失败 toast 提示 | 1h | 前端 | 用户删除失败有反馈 |
| 收紧 `GET /system/export/:type` 权限（SALES/WAREHOUSE 不能导出全量财务数据） | 2h | 后端 | RBAC 测试覆盖 |
| 核查并清理外部部署平台 ClawPi 旧域名（Vercel env vars） | 1h | 运维 | 人工确认截图存档 |

### P1（本月内，工程质量）

| 任务 | 工作量 | 说明 |
|------|--------|------|
| 移动端 Dashboard 汉堡菜单（`R-019` 18 轮未修复） | 3 人天 | 需同步 E2E 移动端验收 |
| 将 `SettingsPageContent.tsx` 拆为 5 个子组件 | 2 人天 | 降低单文件复杂度，提升可测性 |
| 财务页补充错误降级 UI（区分"无数据"与"加载失败"） | 1 人天 | 影响管理层使用感知 |
| Vitest coverage 扩围至 `src/app`，thresholds 提升到 50% | 3 人天 | 按 FE-COV-98 master plan 第二阶段执行 |
| 后端 coverage 冲刺（优先 controller 薄层 + 财务/库存 service） | 3 人天 | 目标：branches 从 61% 提到 75% |
| 审计日志保留策略（超 90 天自动归档或清理） | 1 人天 | 防止 operation_logs 无限增长 |
| 为 `PUT /system/notifications/:id/read` 加所有者校验 | 0.5 人天 | 防止跨用户标记 |
| Sentry 后端接入（与前端已有 `@sentry/nextjs` 对齐） | 1 人天 | 统一错误监控 |

### P2（下月，产品能力）

| 任务 | 工作量 | 说明 |
|------|--------|------|
| 财务趋势看板（近 30/90 天应收/应付折线图） | 5 人天 | CEO 优先级 #1 产品投资方向 |
| 应收账款逾期预警（超 X 天未收款自动通知） | 3 人天 | 联动库存预警通知体系 |
| 任务提醒引擎对接飞书/IM 推送 | 3 人天 | OPS-EXEC-03 已建 API，缺推送侧 |
| SystemConfig 高频 KV（负责人/模板/任务）迁移为专用表 | 4 人天 | 提升并发写入安全性和查询效率 |
| JWT 验证强度检查（启动时校验 secret 强度） | 1 人天 | 安全加固 |

---

## 五、未解决的技术债

| 债务 | 年龄（约） | 严重度 | 清理成本 |
|------|-----------|--------|----------|
| 移动端 Dashboard 无导航（`R-019`） | 18+ 轮 | High | 3 人天 |
| `authenticate()` 无缓存每请求打 DB | 全程 | High | 4h |
| 前端 coverage 门禁形同虚设（thresholds 15%，排除 src/app） | 10+ 轮 | High | 3 人天 |
| 后端 coverage branches 61.74% | 已记录 | High | 3 人天 |
| `SystemConfig` 作为万能存储桶（OPS 数据存 KV） | 15+ 轮 | Medium | 4 人天 |
| `SettingsPageContent.tsx` 600 行大组件 | 10+ 轮 | Medium | 2 人天 |
| 审计日志无保留策略 | 5+ 轮 | Medium | 1 人天 |
| 结构化日志缺失（后端仍用 console.error） | 全程 | Medium | 2 人天 |
| `finance/page.tsx` 无错误降级 UI | 本轮 | Medium | 1 人天 |
| `ops-execution` FINANCE_TABS 引用错误 | 本轮 | Low | 0.5h |

---

## 六、结论与优先级建议

### 总体结论

本轮迭代（REV-01 ~ REV-08）完成了三维评审后最关键的 8 项改进，工程层面有明显进步：审计链路已闭环、驾驶舱有了业务骨架、RBAC 已覆盖写接口、测试稳定性提升。

**但有 3 个问题需要立即关注：**

1. **`FINANCE_TABS` 错误引用**：这是本轮 REV-02 遗留的代码错误，影响经营执行中台的 Tab 高亮和语义。1 行修复，0 理由拖延。

2. **Coverage 门禁形同虚设**：thresholds 15% + 排除 src/app 意味着 CI 对前端页面质量毫无约束。Coverage 冲刺 FE-COV-98 需从"文档阶段"进入"执行阶段"。

3. **`authenticate()` 无缓存**：每个 API 请求都打 DB，这是未来流量上来后第一个爆点，且修复成本低。

### 优先级矩阵

```
影响高 │ authenticate缓存  │  移动端导航  │
       │ 货币单位统一      │  趋势看板    │
       │                   │              │
影响低 │ FINANCE_TABS修复  │  coverage门禁│
       │ 空catch加日志     │  结构化日志  │
       └───────────────────┴──────────────
         成本低（<1天）      成本高（>3天）
```

**本周必做**：影响高+成本低的象限（共约 2 人天），消除正确性问题和安全风险。  
**本月推进**：成本高+影响高的象限（共约 15 人天），为下一阶段扩展打基础。

---

*报告生成时间：2026-03-21 | 基于 Round 62 之后的代码状态*
