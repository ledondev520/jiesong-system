# Frontend Polish Tasks

## 2026-04-05 回放摘要服务层收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-104 | P0 | 10m | 1 | DONE | 新增 `agentReplaySummaryService` 承接 replay summary record / upsert / map 构建 |
| AGENT-V2-GOV-105 | P0 | 10m | 1 | DONE | `openAgentService` / `aiController` 改为统一消费该 service |
| AGENT-V2-GOV-106 | P1 | 10m | 1 | DONE | 更新后端 service 测试与 checkpoint |

## 2026-04-05 独立回放摘要模型

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-100 | P0 | 15m | 1 | DONE | 在 Prisma schema 中新增 `AgentReplaySummary` 模型与 migration |
| AGENT-V2-GOV-101 | P0 | 10m | 1 | DONE | `openAgentService` 写时 upsert 独立 replay summary |
| AGENT-V2-GOV-102 | P0 | 10m | 1 | DONE | `aiController` 读时优先查询 `AgentReplaySummary`，前端补 `回放摘要` 来源 |
| AGENT-V2-GOV-103 | P1 | 10m | 1 | DONE | 更新 controller/service/UI 测试、迁移执行与 checkpoint |

## 2026-04-05 专用回放快照源

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-96 | P0 | 10m | 1 | DONE | `openAgentService` 写入专用 `AGENT_REPLAY_SNAPSHOT` 日志载荷 |
| AGENT-V2-GOV-97 | P0 | 10m | 1 | DONE | `aiController` 优先从 `AGENT_REPLAY_SNAPSHOT` 恢复 replay baseline |
| AGENT-V2-GOV-98 | P0 | 10m | 1 | DONE | 前端来源说明补齐 `回放快照` / `回放快照 + 操作日志` |
| AGENT-V2-GOV-99 | P1 | 10m | 1 | DONE | 更新 eventLedger/controller/service/UI 测试与 checkpoint |

## 2026-04-05 运行日志回放画像回退源

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-92 | P0 | 10m | 1 | DONE | `governanceReplayService` 支持外部 persisted profile fallback |
| AGENT-V2-GOV-93 | P0 | 10m | 1 | DONE | `aiController` 从 `AGENT_RUN` 日志提取 replay profile 作为回退源 |
| AGENT-V2-GOV-94 | P0 | 10m | 1 | DONE | 前端来源说明补齐 `运行日志` / `运行日志 + 操作日志` |
| AGENT-V2-GOV-95 | P1 | 10m | 1 | DONE | 更新 controller/service/UI 测试与 checkpoint |

## 2026-04-05 基础回放画像持久化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-88 | P0 | 15m | 1 | DONE | `openAgentService` 写时持久化基础 `governanceReplayProfile` |
| AGENT-V2-GOV-89 | P0 | 10m | 1 | DONE | `aiController` 读时解析并复用 metadata 中的 persisted profile |
| AGENT-V2-GOV-90 | P0 | 10m | 1 | DONE | `governanceReplayService` 优先消费 persisted profile，再做运行时 evidence 增强 |
| AGENT-V2-GOV-91 | P1 | 10m | 1 | DONE | 更新 openAgent/controller/service 测试、前端回归与 checkpoint |

## 2026-04-05 回放证据显式化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-85 | P0 | 10m | 1 | DONE | 在 `governanceReplayProfile` 中增加 replay evidence 计数字段 |
| AGENT-V2-GOV-86 | P0 | 10m | 1 | DONE | 前端头部增加 `操作日志证据 X` badge |
| AGENT-V2-GOV-87 | P1 | 10m | 1 | DONE | 更新 service/controller/UI 测试与 checkpoint |

## 2026-04-05 操作日志增强回放来源

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-81 | P0 | 10m | 1 | DONE | 在 `governanceReplayService` 识别 pending-action lifecycle 的 operation-log 证据 |
| AGENT-V2-GOV-82 | P0 | 10m | 1 | DONE | `aiController` 改为 merge 动作时间线后再构建 replay profile |
| AGENT-V2-GOV-83 | P0 | 10m | 1 | DONE | 前端来源说明升级为 `回放来源：会话元数据 + 操作日志` |
| AGENT-V2-GOV-84 | P1 | 10m | 1 | DONE | 更新 service/controller/UI 测试与 checkpoint |

## 2026-04-05 回放分类器服务化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-77 | P0 | 15m | 1 | DONE | 新增 `governanceReplayService`，统一构建 replay profile |
| AGENT-V2-GOV-78 | P0 | 10m | 1 | DONE | `aiController` 改为消费统一 `governanceReplayProfile` 并保持平铺字段兼容 |
| AGENT-V2-GOV-79 | P0 | 10m | 1 | DONE | 前端列表页优先消费 `governanceReplayProfile`，不再依赖散落 replay 字段 |
| AGENT-V2-GOV-80 | P1 | 10m | 1 | DONE | 更新后端 service/controller 测试、前端回归与 checkpoint |

## 2026-04-05 回放来源显式化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-74 | P0 | 10m | 1 | DONE | 在 controller 显式计算并返回 `governanceReplaySource` |
| AGENT-V2-GOV-75 | P0 | 10m | 1 | DONE | 前端接入并显示 `回放来源：会话元数据` |
| AGENT-V2-GOV-76 | P1 | 10m | 1 | DONE | 更新前后端测试与 checkpoint |

## 2026-04-04 回放级别显式化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-70 | P0 | 10m | 1 | DONE | 在 controller 显式计算并返回 `governanceReplayLevel` |
| AGENT-V2-GOV-71 | P0 | 10m | 1 | DONE | 前端接入并显示 `回放级别：工具层/建议层/动作层` |
| AGENT-V2-GOV-72 | P0 | 10m | 1 | DONE | 在会话行/移动卡片增加 `工具层回放 / 建议层回放 / 动作层回放` badge |
| AGENT-V2-GOV-73 | P1 | 10m | 1 | DONE | 更新前后端测试与 checkpoint |

## 2026-04-04 回放能力摘要显式化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-67 | P0 | 10m | 1 | DONE | 在 controller 显式下发 `governanceReplaySummary` |
| AGENT-V2-GOV-68 | P0 | 10m | 1 | DONE | 前端接入并渲染 `工具回放 / 建议回放 / 动作回放` badge |
| AGENT-V2-GOV-69 | P1 | 10m | 1 | DONE | 更新前后端测试与 checkpoint |

## 2026-04-04 审计回放状态显式化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-64 | P0 | 10m | 1 | DONE | 在 `getSessions / getChatHistory` 显式下发 `governanceReplayAvailable` |
| AGENT-V2-GOV-65 | P0 | 10m | 1 | DONE | 前端 service 和列表页切到消费显式 provenance 字段 |
| AGENT-V2-GOV-66 | P1 | 10m | 1 | DONE | 更新前后端测试与 checkpoint |

## 2026-04-04 自动治理视角不写 URL

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-59 | P0 | 10m | 1 | DONE | 阻止 `auto` 来源治理状态回写 URL query |
| AGENT-V2-GOV-60 | P0 | 10m | 1 | DONE | 对齐自动失败视角与待处理 chip 的回归测试口径 |
| AGENT-V2-GOV-61 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 治理视角来源提示

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-56 | P0 | 10m | 1 | DONE | 为治理视角增加来源提示，覆盖自动失败视角 |
| AGENT-V2-GOV-57 | P0 | 10m | 1 | DONE | 为手动接管后的视角增加显式来源说明 |
| AGENT-V2-GOV-58 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 风险排序显式提示

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-53 | P0 | 10m | 1 | DONE | 在 `risk` 模式下显式显示“当前：超时优先风险排序” |
| AGENT-V2-GOV-54 | P0 | 10m | 1 | DONE | 为默认排序补简短顺序说明，减少用户猜测成本 |
| AGENT-V2-GOV-55 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 自动治理视角不污染偏好

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-50 | P0 | 10m | 1 | DONE | 定位自动失败视角覆盖 localStorage 偏好的根因 |
| AGENT-V2-GOV-51 | P0 | 10m | 1 | DONE | 阻止 `auto` 来源治理状态写回本地偏好 |
| AGENT-V2-GOV-52 | P1 | 10m | 1 | DONE | 补本地偏好回归测试与 checkpoint |

## 2026-04-04 超时优先风险排序

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-47 | P0 | 10m | 1 | DONE | 将默认风险排序升级成“超时失败 > 超时待确认 > 普通失败 > 普通待确认” |
| AGENT-V2-GOV-48 | P0 | 10m | 1 | DONE | 保持 `latest-action / latest-message` 排序不受老化规则影响 |
| AGENT-V2-GOV-49 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 摘要条超时聚合徽标

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-44 | P0 | 10m | 1 | DONE | 在值班摘要中增加 `超时失败 X` 聚合徽标 |
| AGENT-V2-GOV-45 | P0 | 10m | 1 | DONE | 在值班摘要中增加 `超时待确认 Y` 聚合徽标 |
| AGENT-V2-GOV-46 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 摘要条老化升级提示

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-41 | P0 | 10m | 1 | DONE | 为失败动作摘要增加“超过 4 小时未处理”老化提示 |
| AGENT-V2-GOV-42 | P0 | 10m | 1 | DONE | 为待确认摘要增加“挂起超过 2 小时”老化提示 |
| AGENT-V2-GOV-43 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 顶部值班摘要条

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-38 | P0 | 10m | 1 | DONE | 在 AI 会话列表顶部新增值班摘要 Alert |
| AGENT-V2-GOV-39 | P0 | 10m | 1 | DONE | 按失败/待确认/已收口三种状态切换摘要文案、样式与快捷入口 |
| AGENT-V2-GOV-40 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 会话级 SLA 与值班提示

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-35 | P0 | 10m | 1 | DONE | 在会话列表行补 `SLA P1 / P2 / P3` 严重度徽标 |
| AGENT-V2-GOV-36 | P0 | 10m | 1 | DONE | 在桌面表格和移动卡片补 `需立即处理 / 待人工确认 / 已闭环` 值班提示 |
| AGENT-V2-GOV-37 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 治理预设 Sticky 控制条

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-33 | P0 | 10m | 1 | DONE | 将顶部治理预设改成 sticky 控制条 |
| AGENT-V2-GOV-34 | P1 | 10m | 1 | DONE | 为 sticky 容器和激活态补测试 |

## 2026-04-04 排序/筛选 URL 持久化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-30 | P0 | 15m | 1 | DONE | 从 URL 恢复 `sort` 与 `actionFilter` 初始状态 |
| AGENT-V2-GOV-31 | P0 | 15m | 1 | DONE | 在切换排序/筛选时回写 query，并保持默认值不落 URL |
| AGENT-V2-GOV-32 | P1 | 10m | 1 | DONE | 更新测试与 checkpoint |

## 2026-04-04 列表层可切换排序

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-27 | P0 | 15m | 1 | DONE | 增加 `排序方式` 控件：风险优先 / 最近动作 / 最近消息 |
| AGENT-V2-GOV-28 | P0 | 10m | 1 | DONE | 让排序方式与动作筛选同时生效 |
| AGENT-V2-GOV-29 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 列表层动作排序与筛选

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-24 | P0 | 15m | 1 | DONE | 在会话列表按动作风险优先级排序 |
| AGENT-V2-GOV-25 | P0 | 15m | 1 | DONE | 增加 `全部 / 有失败 / 有待确认 / 已完成动作` 筛选 |
| AGENT-V2-GOV-26 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 列表层失败高亮与最近动作时间

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-21 | P0 | 10m | 1 | DONE | 在列表层显示失败动作风险信号 |
| AGENT-V2-GOV-22 | P0 | 10m | 1 | DONE | 在列表层显示最近动作时间 |
| AGENT-V2-GOV-23 | P1 | 10m | 1 | DONE | 更新测试与 checkpoint |

## 2026-04-04 列表层失败高亮与最近动作时间

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-18 | P0 | 15m | 1 | DONE | 在会话列表中高亮失败动作风险 |
| AGENT-V2-GOV-19 | P0 | 10m | 1 | DONE | 在会话列表显示最近动作时间 |
| AGENT-V2-GOV-20 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 列表层动作状态汇总

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-15 | P0 | 15m | 1 | DONE | 在 AI sessions 桌面表格中显示动作状态汇总 |
| AGENT-V2-GOV-16 | P0 | 10m | 1 | DONE | 在移动端会话卡片中显示相同的动作状态汇总 |
| AGENT-V2-GOV-17 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 待确认动作生命周期时间线

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-12 | P0 | 20m | 1 | DONE | 在 controller 中为 `pendingActionSummary` 组装 `created -> final-state` 时间线 |
| AGENT-V2-GOV-13 | P0 | 15m | 1 | DONE | 在 AI sessions 详情中展示动作时间线与事件时间 |
| AGENT-V2-GOV-14 | P1 | 10m | 1 | DONE | 更新 checkpoint 与 progress，记录 lifecycle timeline 已落地 |

## 2026-04-04 待确认动作最终态回放

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-09 | P0 | 20m | 1 | DONE | 为 `AGENT_WRITE_CANCEL / AGENT_WRITE_FAILED` 补日志落点，并在执行日志中写入 `status/detail/sessionId` |
| AGENT-V2-GOV-10 | P0 | 20m | 1 | DONE | 在 `getSessions / getChatHistory` 中用 `OperationLog` 覆盖 `pendingActionSummary` 最终态 |
| AGENT-V2-GOV-11 | P1 | 15m | 1 | DONE | 在 AI sessions 详情中展示待确认动作的最终状态与结果说明，并更新 checkpoint |

## 2026-04-04 确认执行链治理回放补齐

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-06 | P0 | 15m | 1 | DONE | 在 `persistAgentRun` 中持久化 `pendingActionSummary`，让待确认动作能随会话回放 |
| AGENT-V2-GOV-07 | P0 | 15m | 1 | DONE | 为 `getSessions / getChatHistory` 补 `pendingActionSummary` 返回与后端测试 |
| AGENT-V2-GOV-08 | P1 | 15m | 1 | DONE | 在 AI sessions 详情中展示“待确认动作”回放，并更新 checkpoint |

## 2026-04-04 财务高置信挂账建议闭环

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-FIN-01 | P0 | 20m | 1 | DONE | 在 `DiagnoseSalesContractFlow` 中识别唯一高置信待分配收款，并升级为 `AllocatePayment` 建议 |
| AGENT-V2-FIN-02 | P0 | 10m | 1 | DONE | 为“多命中保持 manual，避免误挂账”补测试护栏 |
| AGENT-V2-FIN-03 | P1 | 10m | 1 | DONE | 更新 `PLAN.md / TASKS.md / RISKS.md / METRICS.md / task_plan.md / progress.md` checkpoint |

## 2026-04-04 诊断建议进入确认执行链

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-CLOSE-01 | P0 | 25m | 1 | DONE | 为税退链路新增 `CreateCustomsDeclarationDraft / CreateForexVerificationDraft / CreateTaxRefundDraft` 三个受控写工具与 executor |
| AGENT-V2-CLOSE-02 | P0 | 20m | 1 | DONE | 将组合诊断中的少量高价值建议升级为 `confirmable_write`，并在 runtime 内自动物化成 `pendingActions` |
| AGENT-V2-CLOSE-03 | P1 | 15m | 1 | DONE | 在 `AIAssistant` 实时消息中展示 `actionRecommendations`，让建议与待确认动作同屏可见并补测试/checkpoint |

## 2026-04-04 组合诊断建议闭环可见化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-ACT-01 | P0 | 25m | 1 | DONE | 为三类组合诊断工具补结构化 `recommendedActions`，把 blocker/next step 升级为正式建议对象 |
| AGENT-V2-ACT-02 | P0 | 20m | 1 | DONE | 在 runtime 执行层收集复合诊断建议，并沿 `ChatHistory / OperationLog` metadata 持久化到会话治理面 |
| AGENT-V2-ACT-03 | P1 | 20m | 1 | DONE | 在 AI 会话页展示推荐动作回放和建议数量，并补后端/前端定向测试与 checkpoint |

## 2026-04-04 组合型任务工具深化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-TOOL-01 | P0 | 35m | 1 | DONE | 为 unified runtime 新增 `DiagnoseSalesContractFlow / DiagnosePurchaseExecution / DiagnoseTradeComplianceReadiness` 三个组合型诊断工具 |
| AGENT-V2-TOOL-02 | P0 | 20m | 1 | DONE | 为 tool registry 增加 `isComposite` 与域级 `compositeToolCount`，区分基础工具与复合任务工具 |
| AGENT-V2-TOOL-03 | P1 | 20m | 1 | DONE | 在 AI 会话页展示域描述与复合工具数量，并补对应后端/前端测试与 checkpoint |

## 2026-04-04 Tool Registry 治理面接通

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-01 | P0 | 15m | 1 | DONE | 暴露 `GET /api/v1/ai/agents/tools`，让通用主 Agent 的工具注册表成为正式接口 |
| AGENT-V2-GOV-02 | P0 | 20m | 1 | DONE | 为 frontend `aiService` 增加 tool registry 调用，并在 AI 会话页展示主入口、读/写工具数与覆盖域数 |
| AGENT-V2-GOV-03 | P1 | 10m | 1 | DONE | 同步台账，记录 tool registry 已成为可见治理面 |
| AGENT-V2-GOV-04 | P1 | 15m | 1 | DONE | 在 AI 会话详情中展示 `toolTraceSummary.items`，把工具调用回放推进到可见层 |
| AGENT-V2-GOV-05 | P1 | 10m | 1 | DONE | 让 tool registry 成为 role-aware 治理面，展示当前角色和按域可用工具数量 |

## 2026-04-04 Universal Agent 深写能力接入

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-WRITE-01 | P0 | 30m | 1 | DONE | 扩通用主 Agent 写工具到供应商新建/更新、采购合同新建/更新、库存状态更新 |
| AGENT-V2-WRITE-02 | P0 | 20m | 1 | DONE | 为写工具补 `allowedRoles` 元数据，并在 runtime 内显式校验角色 |
| AGENT-V2-WRITE-03 | P1 | 10m | 1 | DONE | 同步 `task_plan.md / progress.md / PLAN.md / TASKS.md`，记录深写能力接入与剩余测试风险 |

## 2026-04-04 Universal Agent V2 可观测性接通

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-OBS-01 | P0 | 20m | 1 | DONE | 为 unified runtime 注入 internal specialist frame，并把 routePlan 作为统一 prompt 的内部路由上下文 |
| AGENT-V2-OBS-02 | P0 | 30m | 1 | DONE | 让 `getSessions / getChatHistory` 返回 routeMode、domainsTouched、toolsUsed 等 route metadata |
| AGENT-V2-OBS-03 | P0 | 25m | 1 | DONE | 在 AI 会话页显示 routeMode/工具域摘要，并在详情弹窗展示 routePlan 和 tools 数量 |
| AGENT-V2-OBS-04 | P0 | 30m | 1 | DONE | 扩通用事实工具到合同详情、财务风险、低库存、税退详情等更深层查询 |
| AGENT-V2-OBS-05 | P0 | 20m | 1 | DONE | 将工具调用明细汇总为 `toolTraceSummary`，写入 Agent metadata 与 `AGENT_RUN` 事件台账 |

## 2026-04-04 Universal Agent Runtime V2 实施起步

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-IMP-01 | P0 | 30m | 1 | DONE | 在 `openAgentService` 中明确 `unified` 为主公开入口，并将 legacy preset 标记为内部兼容态 |
| AGENT-V2-IMP-02 | P0 | 45m | 1 | DONE | 落第一版 tool registry，统一输出工具 metadata（domain/access/confirmationRequired） |
| AGENT-V2-IMP-03 | P0 | 45m | 1 | DONE | 接入首批跨域读工具：统一搜索、库存概览、税退链路概览、最近事件 |
| AGENT-V2-IMP-04 | P0 | 30m | 1 | DONE | 落轻量内部路由：按消息内容判断 focused/cross-domain/broad/legacy-explicit，并据此裁剪工具域 |
| AGENT-V2-IMP-05 | P1 | 15m | 1 | DONE | 为 V2 起步实现补后端定向测试与 checkpoint 台账 |

## 2026-04-04 Universal Agent Runtime V2 方案定稿

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-PLAN-01 | P0 | 30m | 1 | DONE | 输出通用主 Agent 方案：统一对外入口、内部工具域/路由、tool-first 感知、确认门写操作 |
| AGENT-V2-PLAN-02 | P0 | 10m | 1 | DONE | 更新 `docs/README.md`、`PLAN.md`、`TASKS.md`，把 Universal Agent Runtime V2 纳入正式执行台账 |

## 2026-04-04 Agent 剩余扫尾：旧路径排查 + 权限口径对齐

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-DOC-04 | P0 | 10m | 1 | DONE | 全仓扫描旧 `/ai/chat-history` 运行时调用，确认残留仅在历史修复说明文档中 |
| AGENT-DOC-05 | P0 | 20m | 1 | DONE | 更新 About 页和 Agent 弹窗文案，统一为“固定能力集自动附加、暂不支持逐项勾选” |
| AGENT-DOC-06 | P1 | 15m | 1 | DONE | 更新 `docs/plans/2026-03-29-agent-cli-mcp-ready-design.md`，补当前实现状态说明并记录与目标架构的差异 |

## 2026-04-03 Agent 状态文档校正 + 历史接口修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-DOC-01 | P0 | 15m | 1 | DONE | 为 `aiService.getChatHistory` 增加失败测试并修正 `/ai/history` 路径，恢复前后端接口一致性 |
| AGENT-DOC-02 | P0 | 20m | 1 | DONE | 更新 `task_plan.md / progress.md / docs/README.md`，把 Agent 状态从“待接入”校正为“主体已落地、剩余待收口” |
| AGENT-DOC-03 | P1 | 10m | 1 | DONE | 同步 `PLAN.md / TASKS.md` checkpoint，记录本轮 Agent 文档校正与剩余风险 |

## 2026-04-02 本地 API 304 代理链修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| API-PROXY-304-01 | P0 | 10m | 1 | DONE | 在 backend 应用入口禁用 ETag，修复 Next dev rewrite 代理下 `/api/v1/purchases` 等 JSON API 返回 304 导致页面误判失败的问题 |

## 2026-04-02 采购合同页 FileText 图标回归修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| CONTRACTS-BUG-02 | P0 | 5m | 1 | DONE | 恢复采购合同页 `FileText` 图标 import，修复合同号列表项 `FileText is not defined` 运行时错误 |

## 2026-04-02 采购合同页图标回归修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| CONTRACTS-BUG-01 | P0 | 5m | 1 | DONE | 恢复采购合同页 `Store` 图标 import，修复“合作店铺”概览卡 `Store is not defined` 运行时错误 |

## 2026-04-02 采购合同页去故事流

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| CONTRACTS-UI-01 | P1 | 15m | 1 | DONE | 删除采购合同页顶部“采购故事流”引导卡片，保留列表区入口并同步更新页面测试断言 |

## 2026-04-02 Open Agent Runtime 融合

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-RUNTIME-01 | P0 | 90m | 1 | DONE | 接入 `open-agent-sdk` 后端运行时，新增三类预置业务 agent 与 `/ai/agents/prompt` 只读执行入口 |
| AGENT-RUNTIME-02 | P0 | 60m | 1 | DONE | AIAssistant 已集成 mode tabs + agent chips + runBusinessAgent 前端调用入口 |
| AGENT-RUNTIME-03 | P1 | 90m | 1 | DONE | 确认后执行写动作工作流：AllocatePayment / UpdateExportContractStatus / CreatePaymentRecord 三个受控写工具，pendingAction 两阶段确认 |
| AGENT-RUNTIME-04 | P1 | 90m | 1 | DONE | Agent 会话/用量/写执行沉淀到事件台账：AGENT_RUN + AGENT_WRITE_EXECUTE 事件，eventLedger AGENT 分类 |
| AGENT-RUNTIME-05 | P0 | 60m | 1 | DONE | 统一入口重构：去掉 chat/agent Tab 和 Agent 选择器，合并为 unified agent 单入口；新增 UpdateSystemConfig + GetSystemConfig 工具；前端二步确认卡片 UI |
| AGENT-RUNTIME-06 | P0 | 45m | 1 | DONE | 流式输出恢复（SSE via agent.query）+ 图片上传恢复 + 消息气泡溢出修复 |
| AGENT-RUNTIME-07 | P0 | 30m | 1 | DONE | 会话历史列表：历史对话回溯、新建对话、会话切换 |
| AGENT-RUNTIME-08 | P0 | 60m | 1 | DONE | 自进化巡检基础架构：PatrolService（业务+系统巡检规则）+ PatrolJob（每小时cron）+ 通知下发 + API 路由 |

## 2026-04-02 出口合同第三方来源展示收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FIN-P0-06 | P0 | 45m | 1 | DONE | 将 `hasThirdPartyCargo / sourceParties` 暴露到出口合同列表与详情，并补齐服务层/页面回归测试 |

## 2026-04-02 客户级收款池与部分分摊

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FIN-P0-05 | P0 | 90m | 1 | DONE | 落地客户级收款池：收入记录补客户名、支持原始收款到多合同的部分分摊、收款池展示已分配/剩余额 |

## 2026-04-02 自进化闭环规划

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| EVO-PLAN-01 | P0 | 45m | 1 | DONE | 输出“观察-追溯-修复-固化”L2 闭环方案，明确分阶段架构、风险边界与 DoD |
| EVO-FND-01 | P0 | 90m | 1 | TODO | 设计统一事件模型与分类法，收口 `OperationLog / ImportRecord / ChatHistory / TokenUsage` 到同一事件语义 |
| EVO-FND-02 | P0 | 90m | 1 | TODO | 新增 `case / trace` 主实体与状态机，支持问题聚合、根因归档、证据挂载与时间线回放 |
| EVO-OBS-01 | P1 | 60m | 1 | TODO | 升级系统日志页与项目驾驶舱，补 case 漏斗、事件时间线、失败热点和闭环看板 |
| EVO-RPR-01 | P1 | 90m | 1 | TODO | 新增 repair 工作流：从 case 生成待办/修复动作，并强制记录验证结果与回滚点 |
| EVO-LRN-01 | P1 | 90m | 1 | TODO | 新增规则注册表与经验固化流程，让验证通过的修复沉淀为规则、playbook 或 guardrail |
| EVO-GOV-01 | P1 | 60m | 1 | TODO | 建立闭环指标、自动化审批边界、灰度策略与 fail-closed 安全约束 |

## 2026-04-02 付款备注规范收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FIN-P0-03 | P0 | 60m | 1 | DONE | 收口导入脚本与手工收款录入的备注规范，让合同号稳定进入可机读备注 |

## 2026-04-01 收款池半自动挂账

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FIN-P0-02 | P0 | 60m | 1 | DONE | 落地收款池高置信度自动匹配：唯一合同号 + 全额待收命中自动挂账，并在收付款页提供显式触发入口 |

## 2026-04-01 财务 P0 历史流水兼容

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FIN-P0-01 | P0 | 45m | 1 | DONE | 在 `financeService` 兼容历史 `INCOME / EXPENSE`，打通待分配收款、分配动作与趋势统计闭环 |

## 2026-04-01 findings 剩余入口与频控收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FINDINGS-05 | P1 | 20m | 1 | DONE | 将 `/tax-refunds` 统一重定向到 `/dashboard/tax-refunds`，同步相关 CTA |
| FINDINGS-06 | P2 | 30m | 1 | DONE | 登录限流按 `IP + 用户名` 分桶，并补前端剩余等待时间提示 |

## 2026-03-31 findings 高优先级修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FINDINGS-01 | P0 | 20m | 1 | DONE | 修复 `/dashboard/purchase` 404，新增兼容重定向入口 |
| FINDINGS-02 | P1 | 20m | 1 | DONE | 新增自定义 404 页面，补返回工作台/登录页入口 |
| FINDINGS-03 | P1 | 30m | 1 | DONE | 修复出口创建页空提交无字段级提示，允许提交并展示明确校验错误 |
| FINDINGS-04 | P1 | 15m | 1 | DONE | 调整全局背景网格位置，消除页面顶部黄色细线 |

## 2026-03-30 故事化工作台与模块首页收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| STORY-FLOW-01 | P0 | 60m | 1 | DONE | 将首页工作台改成“采购主线 + 出口跟进 + 财务上报”的故事化入口 |
| STORY-FLOW-02 | P0 | 45m | 1 | DONE | 重排采购、出口、财务模块首页首屏，让每页先讲清“下一步动作” |
| STORY-FLOW-03 | P0 | 20m | 1 | DONE | 将模块 Tab Header 改成移动端可换行，减少横向滑动依赖 |

## 2026-03-30 移动端交互收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| MOBILE-UX-01 | P0 | 45m | 1 | DONE | 将共享 Dialog 收敛为移动端全屏弹层，保证关闭按钮可见可达 |
| MOBILE-UX-02 | P0 | 15m | 1 | DONE | 从一级导航移除重复的“项目驾驶舱”入口，仅保留系统管理内入口 |
| MOBILE-UX-03 | P0 | 45m | 1 | DONE | 让 AI 助手浮动按钮支持拖拽移动，避免遮挡底部 Tab |

## 2026-03-30 本地项目驾驶舱

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| COCKPIT-01 | P0 | 90m | 1 | DONE | 落地只读实时项目驾驶舱：本地 git / 任务 / 计划 / 指标状态自动采集、手机可视化页面、自动轮询刷新、系统管理入口与穿透脚本 |

## 2026-03-29 Agent Lifecycle & Ops

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-OPS-01 | P0 | 45m | 1 | DONE | 落地 Agent 账号与 credential 生命周期管理 API：list/get/create/update Agent、issue/revoke/rotate credential，并挂载 `/api/v1/agents` |
| AGENT-OPS-02 | P1 | 60m | 1 | DONE | 为 Agent 账号与 credential 提供前端管理界面、一次性 token 展示与安全提示 |
| AGENT-OPS-03 | P1 | 60m | 1 | DONE | 为 credential 管理补到期策略、活跃凭证上限、管理员通知与前端风险提醒 |
| AGENT-OPS-04 | P0 | 60m | 1 | DONE | 落地远程 HTTP MCP endpoint，并将 update 类能力扩展到 CLI / MCP / 路由授权 |
| AGENT-OPS-05 | P1 | 45m | 1 | DONE | 落地 Agent credential 到期巡检任务，支持每日通知管理员并在 app 启动时自动接入 |
| AGENT-OPS-06 | P1 | 30m | 1 | DONE | 在系统管理中新增“关于”模块，提供远程 Agent / 本机 CLI 的快速接入说明、一键安装命令与复制按钮，默认采用用户账号密码接入 |

## 2026-03-29 表单字段 id/name 统一修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| A11Y-FORM-01 | P0 | 45m | 1 | DONE | 为共享 `Input / Textarea / CommandInput` 下沉默认 `id` 兜底，补齐系统内绕过共享组件的原生字段 `id/name`，并新增源码级审计测试锁定回归 |

## 2026-03-29 Agent CLI + MCP-ready

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-ARCH-01 | P0 | 45m | 1 | DONE | 产出 Agent CLI + MCP-ready 架构设计：独立 Agent 账号、命令层、CLI 协议、审计与分阶段实施路径 |
| AGENT-ARCH-02 | P0 | 60m | 1 | DONE | 落地 Agent 账号数据模型与鉴权方案（`AgentAccount / AgentCredential / AgentGrant` + dual-actor audit） |
| AGENT-ARCH-03 | P0 | 45m | 1 | DONE | 落地 backend 统一搜索接口与命令层首批查询能力 |
| AGENT-ARCH-04 | P0 | 60m | 1 | DONE | 落地原子化采购创建（含 items）与首批 CLI 命令 |
| AGENT-ARCH-05 | P1 | 45m | 1 | DONE | 在 CLI 稳定后封装 MCP server，复用同一命令层与权限模型 |

## 2026-03-29 采购表单可访问性修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| A11Y-PUR-01 | P0 | 45m | 1 | DONE | 统一修复采购创建页表单无障碍问题：补齐 `Label/Input/Textarea/CommandInput` 的 `id/name/htmlFor`，移除误用 `FormLabel`，扩展 `DatePicker` 触发器属性透传并补采购页回归测试 |
| A11Y-PUR-02 | P0 | 20m | 1 | DONE | 收口剩余 2 个表单 issue：修复 `BatchImportDialog` 的文本输入/文件上传标签关联，并移除“匹配结果”对 `Label` 的误用 |

## 2026-03-28 CEO Review 重排（工作台优先）

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| ROADMAP-01 | P0 | 20m | 1 | DONE | 输出并归档 CEO 路线图升级计划，定义 30/90 天目标、取舍边界与执行顺序 |
| BASE-01 | P0 | 20m | 1 | DONE | 修复 `useMobile` 在 Vitest/jsdom 下因 `matchMedia` 缺失导致的崩溃，改用 `useSyncExternalStore` 并补回归测试 |
| OPS-ENTRY-01 | P0 | 45m | 1 | DONE | 抽出共享运维中心入口数据并升级运维中心总览页，统一 `system/page` 与 `settings > 运维中心` 的来源 |
| SH-01 | P0 | 45m | 1 | DONE | 收敛导航单一来源：让 `Sidebar` / `Header` / `ModuleTabHeader` 统一由一份 registry 派生，消除入口漂移 |
| SH-02 | P0 | 30m | 1 | DONE | 拆分 Header 过载职责：把全局搜索、移动导航、通知和用户菜单分离成独立子块 |
| SH-03 | P0 | 20m | 1 | TODO | 核对运维中心入口层级：确认 `dashboard/system` / `dashboard/system/logs` / `dashboard/system/import-records` 是否仍需要分散入口或应继续收敛 |
| WS-01 | P0 | 90m | 1 | TODO | 选一个代表性高频模块页做 workspace 改造，形成“经营工作台”示范页面 |

> 备注：`FE-COV-98` 仍保留在下方作为质量护栏子线推进，本节只列主线工作项。

## 2026-03-24 仓库瘦身与 Git 收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| REPO-HYGIENE-01 | P0 | 45m | 1 | DONE | 收紧 `.gitignore`、从 git 索引移除 `.pyc` 与 codepilot 产物、清掉本地 stale/build 报告目录，将仓库体积从 `6.6G` 压到 `1.7G` |

## 2026-03-24 VPS 首次上线

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| DEPLOY-VPS-01 | P0 | 90m | 1 | DONE | 将当前系统上线到 `23.81.118.51`：落 `pm2/nginx` 配置、修复前端生产构建红灯、启动前后端并验证公网首页与管理员登录可用 |

## 2026-03-23 提交前 E2E 稳定化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| E2E-03 | P0 | 60m | 1 | DONE | 修复前端全量 Playwright 红灯（hydration mismatch、mock 契约漂移、过期 IA 断言），完成 fresh 全门禁验证并收口提交前台账 |

## 2026-03-22 Frontend Audit To Iteration

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FE-AUDIT-01 | P0 | 20m | 1 | DONE | 产出 `docs/frontend-audit-2026-03.md`，固化审查结论、结构问题、frontend-skill 方向与分阶段改进计划 |
| FE-BASE-01 | P0 | 45m | 1 | DONE | 修复 `frontend` 当前 lint/build 红灯，清理明显 warning，恢复前端可演进基线 |
| FE-NAV-01 | P0 | 45m | 1 | DONE | 建立单一导航注册表，统一驱动 Sidebar/Header/ModuleTabHeader，消除多份导航配置漂移 |
| FE-CLEAN-01 | P1 | 20m | 1 | DONE | 清理陈旧或脱轨页面入口（如旧 `dashboard/logs`），统一壳层规范 |
| FE-DASH-01 | P0 | 90m | 1 | DONE | 重做工作台首屏结构：从卡片拼盘收敛为“当前焦点 + 高频动作 + 关键趋势 + 风险提醒”工作空间 |
| FE-NAV-02 | P0 | 45m | 2 | DONE | 将权限、默认落点、重定向规则进一步并入导航注册表，减少壳层条件分支 |
| FE-SPLIT-01 | P1 | 90m | 1 | DONE | 拆分 `finance/statements/page.tsx`，收口 route/data/view/dialog 结构 |
| FE-SPLIT-02 | P1 | 75m | 1 | DONE | 拆分 `store-recommend/page.tsx`，降低超长页面与重复卡片堆叠 |
| FE-SHELL-01 | P1 | 60m | 2 | DONE | 继续重构 `Header`，拆开移动导航、搜索、通知、用户菜单 |
| FE-SEARCH-01 | P1 | 60m | 2 | DONE | 将 Header 全局搜索改为聚合入口，避免输入时并发打 5 个接口 |
| FE-AI-01 | P2 | 60m | 3 | DONE | 降低 AI 助手对业务页面主交互的抢占，改成更克制的辅助入口 |
| FE-STATE-01 | P2 | 45m | 1 | DONE | 统一列表页和模块页 loading / empty / error 状态体系 |
| FE-MODULE-01 | P2 | 90m | 1 | DONE | 让采购/出口/财务模块首页形成差异化工作空间结构 |
| FE-QA-01 | P2 | 45m | 1 | DONE | 为登录页、工作台、采购合同、财务页、移动端首屏补截图回归门禁 |

## 2026-03-21 CEO/Eng/Design 三维评审迭代（基于 2026-03-20 review）

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| REV-01 | P0 | 15m | 1 | DONE | 修复导出路由权限缺失：GET /system/export/:type 与 /pdf 均无 roleAuth，加 ADMIN+业务角色限制 |
| REV-02 | P1 | 90m | 2 | DONE | 财务首页升级为经营驾驶舱：汇率显示、收付款完成率进度条、紧迫性预警 badge、快捷导航区 |
| REV-03 | P1 | 20m | 2 | DONE | AI 助手 z-index 提升至 z-[199]/z-[200]，防止被弹框/sticky header 覆盖 |
| REV-04 | P1 | 60m | 3 | DONE | 经营执行中台拆分：page.tsx(55行) 委托 UnshippedListTab + PurchaseChecklistTab 子组件 |
| REV-05 | P1 | 45m | 3 | DONE | 设置页 IA 优化：基础档案加港口/品类入口、数据导出改 shadcn Select、系统配置分域说明 |
| REV-06 | P1 | 30m | 1 | DONE | 导出路由加 withAuditLog 审计日志，可在 system/logs 追溯每次导出行为 |
| REV-07 | P0 | 45m | 2 | DONE | SystemConfig 分域分组：新增 GET /configs/domains 端点，CONFIG_DOMAIN_MAP 维护 params/dictionary/ai/other 四域 |
| REV-08 | P2 | 20m | 1 | DONE | vitest coverage 增加 services 层覆盖、reporter 加 lcov、阈值提升至 15/25%，test:coverage 命令已就绪 |
| REV-09 | P0 | 30m | 1 | DONE | authenticate() 加 LRU 内存缓存（TTL=60s, max=1000）：减少每请求 DB 查询，暴露 clearAuthCache() 供禁用即时踢出 |
| REV-10 | P0 | 15m | 1 | DONE | Settings 删除单位/报关公司失败时回滚本地状态并展示精确错误 toast（原来只有空 catch） |
| REV-11 | P1 | 20m | 1 | DONE | 财务页新增 loadError 状态：区分「无数据」与「加载失败」，失败时展示专属 ServerCrash 错误卡片+重试按钮 |
| REV-12 | P0 | 5m | 1 | DONE | ops-execution moduleName="财务"→"经营执行"，修复语义错误（FINANCE_TABS 跨页导航保留，aria-label 修正） |
| REV-13 | P0 | 15m | 1 | DONE | 旧导出路由旁路修复：/api/v1/export/:type 补 roleAuth，与 /system/export/:type 权限对齐，消除 RBAC 绕过漏洞 |
| REV-14 | P0 | — | 1 | N/A | PUT /system/notifications/:id/read 所有者校验：已通过 userId 过滤实现，无需额外修复 |
| REV-15 | P1 | 15m | 1 | DONE | 财务驾驶舱货币混用：应收全部标注 USD，应付保持 ¥/CNY，底部说明文字同步更新 |
| MOB-01 | P0 | 60m | 1 | DONE | 移动端汉堡菜单（R-019 18轮）：Header 加 Sheet 抽屉，md以下展示全量导航+用户信息+退出 |
| SPLIT-01 | P1 | 45m | 2 | DONE | SettingsPageContent.tsx 拆分为 5 个 Tab 子组件（MasterData/SystemConfig/DataImport/Ops/DataExport/Users） |
| FIN-TREND-01 | P2 | 90m | 3 | DONE | 财务趋势折线图：后端 /finance/payment-trends 按周聚合 + 前端 recharts 图表，支持 30/90 天切换 |
| FIN-OVERDUE-01 | P2 | 45m | 3 | DONE | 应收逾期预警：后端 /finance/overdue-receivables（发货30天未收视为逾期） + 前端驾驶舱预警卡片 |
| COV-01 | P1 | 30m | 1 | DONE | Coverage 扩围：include 新增 src/app/**，排除 layout/loading/error 等框架文件，阈值提升至 20/15% |
| MRD-01 | P1 | 60m | 4 | DONE | 智能比价 PriceGuard 组件：调用 /products/:id/price-history，实时显示涨/跌/持平红绿灯徽章 |
| MRD-02 | P1 | 30m | 4 | DONE | 合规性智能提示 ComplianceHint：关键词规则（鸟刺/烟花/刀具/食品）自动弹出美国法规提示 |
| MRD-03 | P1 | — | — | N/A | 合同Word/PDF导出：采购合同详情页已有完整实现（generateFromPurchase + exportPurchasePdf），无需新增 |
| MRD-04 | P1 | 45m | 1 | DONE | 合同附件归档：采购详情页增加「合同附件」卡片，支持上传/下载/删除，后端新增 downloadFile 端点 |
| PERF-01 | P1 | 20m | 1 | DONE | 财务模块 Tab 卡顿修复：statements/page.tsx 的 loading 改为骨架屏内联方式，ModuleTabHeader 始终渲染，消除切 Tab 时整页空白闪烁 |
| PERF-02 | P1 | 60m | 1 | DONE | 全模块 Tab 切换性能优化：新建 src/lib/api-cache.ts（30s 内存缓存），覆盖全部 10 个 Tab 页面，首次加载正常，30s 内重访秒开 |

## 2026-03-19 ClawPi Domain Sweep

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| OPS-DOMAIN-01 | P0 | 30m | 1 | DONE | 全仓清扫 ClawPi 旧域名残留，核查脚本/配置/定时任务入口，修复前端 API 基址环境变量不一致并完成无副作用验证 |

## 2026-03-15 Ops Execution Center

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| OPS-EXEC-01 | P0 | 60m | 1 | DONE | 经营执行中台首批交付：新增 `/dashboard/ops-execution` 入口、后端未发货聚合 API、负责人分发能力、前后端定向测试 |
| OPS-EXEC-02 | P0 | 90m | 2 | DONE | 门店采购清单模块初版：补店型/开店阶段模板、生成逻辑、模板保存、CSV 导出与中台页交互 |
| OPS-EXEC-03 | P0 | 120m | 3 | DONE | 任务提醒引擎初版：自然语言建任务、优先级/责任人/提醒时间/二次提醒、提醒处理器与轮询任务 |

## 任务清单
| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| UX-LAUNCH-01 | P0 | 30m | 1 | DONE | 登录成功后直达 `/dashboard`，工作台数据看板改为懒加载并提供骨架屏，缩短首开空白感 |
| HS-UX-01 | P0 | 20m | 1 | DONE | 查明本地登录/空库根因，补 HSCode 默认全量列表，再联通本地 backend+frontend 登录链路 |
| PERF-01 | P0 | 40m | 1 | DONE | 页面切换性能优化：实现全局 GET 缓存+并发去重+写后失效，并在侧边栏空闲预取常用路由，完成 lint/test/build 验证 |
| PERF-02 | P0 | 60m | 1 | DONE | 持续性能优化：后端列表接口新增 lite 轻量响应并移除冗余关联，前端高频页切换为 lite 请求，叠加 GET 缓存 TTL 提升至 180s，完成前后端回归与构建验证 |
| PERF-03 | P0 | 45m | 1 | DONE | 持续性能优化：侧边栏预取限流（优先级+上限+去重）、AI 助手业务页懒加载、后端开启 gzip 压缩并排除 SSE，完成前后端回归与构建验证 |
| PERF-04 | P0 | 45m | 1 | DONE | 持续性能优化：销售/货柜详情页首屏只加载主数据，商品/门店/库存改为弹窗或标签页按需加载，并补首屏不拉重数据的回归测试 |
| FP-01 | P0 | 20m | 1 | DONE | 全局视觉 token 与背景层次升级（`globals.css`） |
| FP-02 | P0 | 20m | 1 | DONE | dashboard 框架美化（`dashboard/layout` + `Header` + `Sidebar` + `PageHeader`） |
| FP-03 | P0 | 20m | 1 | DONE | 工作台核心模块美化（`dashboard/page` + `DataDashboard`） |
| FP-04 | P1 | 20m | 1 | DONE | 认证页（login/register/forgot）统一高端视觉 |
| FP-05 | P1 | 20m | 1 | DONE | 核心业务列表页（products/inventory/containers）统一卡片与筛选区 |
| FP-06 | P1 | 20m | 1 | DONE | 交易财务页（sales/purchase/payments/finance）统一交互层级 |
| FP-07 | P0 | 15m | 1 | DONE | 本阶段验收与文档同步（README/progress/metrics） |
| FP-08 | P0 | 20m | 1 | DONE | 下一批业务页（products/inventory/containers）统一卡片/筛选区/空态层级 |
| FP-09 | P1 | 20m | 1 | DONE | 交易财务域页面视觉统一（sales/purchase/payments/finance） |
| FP-10 | P2 | 20m | 1 | DONE | 基础档案尾页（users/suppliers/contracts）细节收口与终检 |
| FP-11 | P1 | 20m | 1 | DONE | 视觉统一终检与回归验证（全量前端单测 114/114） |
| SA-01 | P0 | 15m | 1 | DONE | 创建系统架构总控子代理（`system-architect-orchestrator`）并定义跨角色协同机制 |
| SA-02 | P0 | 15m | 1 | DONE | 创建后端系统工程师子代理（`backend-system-engineer`）并打通与架构师协同链路 |
| SA-03 | P0 | 15m | 1 | DONE | 创建接口契约协同子代理（`api-contract-coordinator`）并补齐联调治理能力 |
| SA-04 | P0 | 15m | 1 | DONE | 创建质量验收守门子代理（`quality-verification-guardian`）并补齐发布门禁闭环 |
| SA-05 | P0 | 15m | 1 | DONE | 创建数据库演进子代理（`database-migration-architect`）并补齐迁移与回滚治理能力 |
| SA-06 | P0 | 15m | 1 | DONE | 更新子代理使用手册为端到端执行剧本（架构->实现->迁移->验收） |
| SA-07 | P0 | 10m | 1 | DONE | 修正子代理手册文案一致性（“三类”改为“多角色”） |
| SA-08 | P0 | 10m | 1 | DONE | 清理测试产物与误放文件（`.gitignore` + 删除误放 `.code-workspace`） |
| SA-09 | P0 | 20m | 1 | DONE | 新增系统架构落地执行方案文档并定义 WU-F-01~WU-F-05 |
| SA-10 | P0 | 10m | 1 | DONE | 同步文档导航（`docs/README.md` + 根 `README.md`） |
| SA-11 | P0 | 20m | 1 | DONE | 产出《可执行里程碑计划（V1）》并明确 M1~M6 验证与回滚 |
| SA-12 | P0 | 10m | 1 | DONE | 按目录规范修正 `docs/README.md` 的“目的/边界/职责”格式 |
| SA-13 | P0 | 20m | 1 | DONE | 落地 M2：新增采购链路契约文档与联调面板（`docs/api-contracts/*`） |
| SA-14 | P0 | 10m | 1 | DONE | 修复采购列表参数契约偏差（前端 `query` -> `keyword`）并补测试 |
| SA-15 | P0 | 15m | 1 | DONE | 修复后端采购路由顺序（`/options/next-no` 在 `/:id` 前） |
| SA-16 | P0 | 15m | 1 | DONE | 新增后端路由顺序回归测试并通过后端全量测试（31/31） |
| SA-17 | P1 | 15m | 1 | DONE | 修复采购列表“查看”按钮缺失跳转（接入详情页路由） |
| SA-18 | P1 | 10m | 1 | DONE | 补齐采购列表查看跳转交互测试（`purchase/page.test.tsx`） |
| SA-19 | P0 | 20m | 1 | DONE | 执行 M5 质量门禁（backend 全量 + frontend 采购域 + e2e 冒烟） |
| SA-20 | P0 | 10m | 1 | DONE | 产出发布结论（`docs/quality/发布结论_M5_20260212.md`）并同步导航 |
| SA-21 | P1 | 15m | 1 | DONE | 产出周节奏指标看板（`docs/周节奏指标看板.md`） |
| SA-22 | P1 | 10m | 1 | DONE | 同步指标看板导航与台账（README/PLAN/TASKS/progress） |
| SA-23 | P1 | 15m | 1 | DONE | 复制采购修复模式到销售链路（路由顺序 + 查询参数契约） |
| SA-24 | P1 | 15m | 1 | DONE | 补齐销售链路回归测试与契约文档（`sales.test.js` + `销售链路契约.md`） |
| SA-25 | P1 | 10m | 1 | DONE | 新增销售链路联调面板（`docs/api-contracts/销售链路联调面板.md`） |
| SA-26 | P1 | 10m | 1 | DONE | 同步销售联调面板导航与台账（README/PLAN/TASKS/progress） |
| SA-27 | P1 | 10m | 1 | DONE | 补齐销售列表按钮可访问标签（查看/删除） |
| SA-28 | P1 | 15m | 1 | DONE | 补齐销售删除流程测试（成功/失败）并通过定向验证 |
| SA-29 | P1 | 20m | 1 | DONE | 补齐销售链路 E2E 场景（登录后销售页列表 Mock） |
| SA-30 | P1 | 15m | 1 | DONE | 修复鉴权 hydration 兜底逻辑并通过 E2E 3/3 验证 |
| SA-31 | P1 | 20m | 1 | DONE | 补齐采购链路 E2E 场景（登录后采购页列表 Mock） |
| SA-32 | P1 | 10m | 1 | DONE | 更新验收台账与计划状态（E2E 4/4） |
| SA-33 | P1 | 20m | 1 | DONE | 补齐销售详情页 E2E 场景（登录后详情 Mock） |
| SA-34 | P1 | 10m | 1 | DONE | 更新验收台账与计划状态（E2E 5/5） |
| SA-35 | P1 | 15m | 1 | DONE | 商品管理页搜索防抖优化（350ms）并通过定向单测（3/3） |
| SA-36 | P1 | 20m | 1 | DONE | 商品删除确认统一为 AlertDialog（替换 confirm）并通过定向单测（3/3） |
| SA-37 | P1 | 20m | 1 | DONE | 商品弹窗补齐 HS编码/申报要素字段并接通创建编辑回填路径 |
| SA-38 | P1 | 20m | 1 | DONE | 库存状态页新增商品/采购合同关键词筛选并保持状态更新流程可用 |
| SA-39 | P2 | 10m | 1 | DONE | 货柜管理表格容器样式统一为 surface-panel，完成视觉一致性收口 |
| SA-40 | P0 | 25m | 1 | DONE | 库存状态机后端强约束（单条更新接入校验 + 状态机单测） |
| SA-41 | P0 | 20m | 1 | DONE | 库存列表搜索后端化（keyword 参数）并完成前端接入 |
| SA-42 | P1 | 25m | 1 | DONE | 新增库存批量状态更新接口与前端批量操作入口 |
| SA-43 | P1 | 20m | 1 | DONE | 补齐库存链路契约/联调面板并同步文档导航 |
| SA-40 | P1 | 20m | 1 | DONE | 新增白天/夜间主题切换（next-themes）并接入 Header 全局入口 |
| SA-41 | P1 | 15m | 1 | DONE | 门店采购建议页移除 emoji，统一替换为 Lucide 图标风格 |
| SA-42 | P1 | 15m | 1 | DONE | 修复白天模式金色文字对比度不足（新增高对比强调色 token 并替换关键文本） |
| SA-43 | P0 | 15m | 1 | DONE | 修复 Dashboard 布局 hydration mismatch（移除渲染期 `window/localStorage` 分支，改为 hydration 后重定向） |
| SA-44 | P0 | 20m | 1 | DONE | 修复认证页 API 返回类型声明，打通 `next build` 的 TypeScript 阶段 |
| SA-45 | P0 | 20m | 1 | DONE | 修复货柜域类型兼容（Container/SalesContract 合并后字段回退与状态映射） |
| SA-46 | P0 | 20m | 1 | DONE | 为 `payments/products/contracts/settings` 补齐 `useSearchParams` Suspense 边界，恢复 Next16 构建通过 |
| SA-47 | P1 | 15m | 1 | DONE | 新增项目级技能 `product-gap-closure-pm`（缺口补齐+架构协同+合规审查）并同步 `.cursor/skills` 与根 README 导航 |
| SA-48 | P0 | 40m | 1 | DONE | 修复后端服务层残留的旧容器模型引用（export/import/ai/dashboard）并映射到 SalesContract/PackingItem |
| SA-49 | P0 | 40m | 1 | DONE | 修复历史数据导入脚本（importData/importIncremental）旧容器模型引用并改为 SalesContract 兼容写入 |
| SA-50 | P0 | 30m | 1 | DONE | 全量回归与代码评审：执行 `backend` 回归测试 + `container` 路由与关键页面回归验证 |
| SA-51 | P0 | 15m | 1 | DONE | 修复 `container` 装箱明细更新 totalPrice 回写逻辑，避免部分字段更新导致金额被误清空 |
| SA-52 | P0 | 30m | 1 | DONE | Excel 三 Sheet 标准出口模板：安装 exceljs、新增后端导出函数与路由、前端列表页+详情页导出按钮 |
| SA-53 | P0 | 30m | 1 | DONE | 修复 `frontend/e2e/smoke.spec.ts` 销售列表/详情 Mock 路由精确拦截（`/sales` vs `/sales/:id`），并完成登录页 UI 审查与测试复核 |
| SA-54 | P0 | 40m | 1 | DONE | 前端 lint 错误清零专项：修复 `no-explicit-any`、`set-state-in-effect`、`exhaustive-deps`、`alt-text`、`no-img-element`，并完成 lint/test 回归 |
| SYS-01 | P0 | 30m | 1 | DONE | 新增系统日志页（`/dashboard/system/logs`）列表与导入日志视图 |
| SYS-02 | P1 | 30m | 1 | DONE | 新增通知中心页（`/dashboard/system/notifications`）列表与已读标记 |
| SYS-03 | P1 | 30m | 1 | DONE | 新增导入记录页（`/dashboard/system/import-records`） |
| SYS-04 | P1 | 20m | 1 | DONE | 系统设置页集成导出入口（`/system/export/:type`） |
| SYS-05 | P0 | 20m | 1 | DONE | 修复通知已读越权风险（`markNotificationRead` 强制 userId 归属校验） |
| SYS-06 | P1 | 20m | 1 | DONE | 修复导入状态错误（失败记录标记为 `FAILED`）并补服务层状态推导函数 |
| SYS-07 | P1 | 20m | 1 | DONE | 补齐后端测试覆盖（`systemController` + `importService`）验证筛选参数与权限行为 |
| SYS-08 | P0 | 25m | 1 | DONE | 修复“系统管理”主入口 `/dashboard/system` 404：新增总览页、补单测并扩展导航 E2E 用例 |
| SYS-09 | P0 | 30m | 1 | DONE | 融合“基础设置”和“系统管理”：侧边栏整合为单一系统管理模块并保留原路由可访问性（含权限与回归测试） |
| SYS-10 | P0 | 35m | 1 | DONE | 按“功能归位”拆分系统管理：移除独立系统管理一级菜单，运维入口并入设置页并保留旧路由兼容跳转 |
| DB-01 | P0 | 20m | 1 | DONE | Prisma 数据源切回 Supabase PostgreSQL（恢复 `provider=postgresql` 与 `directUrl`） |
| OPS-01 | P0 | 15m | 1 | DONE | 统一本地端口与环境模板（backend 默认端口 3000，`env.example` 同步） |
| OPS-02 | P1 | 20m | 1 | DONE | 补齐启动/上线文档（根 README + backend README + Supabase 迁移文档）并移除 Vercel 占位 rewrite |
| AUTH-01 | P1 | 20m | 1 | DONE | 登录页支持记住账号密码与“快捷登录”按钮（本地恢复后可一键登录） |
| AUTH-02 | P0 | 25m | 1 | DONE | 登录页改为“快捷登录 + 一键登录（admin）后输入密码自动提交”，并将 admin 测试密码切换为 123456（含 seed 同步） |
| AUTH-03 | P0 | 25m | 1 | DONE | 登录页快捷登录收口：移除“记住用户名/测试账号提示/6位自动提交文案”，改为“首次成功登录后支持一键直接登录”并补齐回归测试 |
| E2E-01 | P0 | 30m | 1 | DONE | 前端 E2E 全量稳定性收口（修复 dashboard 认证竞态 + system logs hooks 错序 + 完成 14/14 回归） |
| E2E-02 | P0 | 45m | 1 | DONE | 按钮级 E2E 巡检扩展（新增 28 页按钮巡检 + 导入页 mock 补齐 + 全量 E2E 42/42） |
| S3-01 | P0 | 60m | 1 | DOING | 阶段3：AI 管理页面（`/dashboard/ai/sessions`、`/dashboard/ai/token-stats`、`/dashboard/ai/models`）+ 测试 + 侧边栏导航 |
| S4-01 | P0 | 60m | 2 | DOING | 阶段4：合同模板管理（`/dashboard/contracts/template`、`/dashboard/contracts/templates`）并集成到合同生成流程 + 测试 |
| S5-01 | P0 | 60m | 3 | DOING | 阶段5：数据域配置（`/dashboard/settings/ports`、`/dashboard/settings/categories` CRUD + 用户头像/最后登录展示）+ 测试 |
| TST-01 | P0 | 30m | 1 | DONE | 清理无关仓库文件（删除 `music_name_fetch/README.md`、`music_name_fetch/fetch_music.py`） |
| TST-02 | P0 | 40m | 1 | DONE | 补齐前端缺失页面测试 6 个并修复既有红灯（settings/template） |
| TST-03 | P0 | 40m | 2 | DONE | 补齐前端缺失 service 测试 6 个（config/container/contractDoc/dataImport/inventory/user） |
| TST-04 | P0 | 45m | 3 | DONE | 扩展按钮级 E2E 覆盖到缺失页面（新增 10 条页面巡检 + mock 补齐 + 稳定性增强） |
| TST-05 | P0 | 45m | 1 | DONE | 补齐后端缺失测试 37 个并修复 app 可测性（`require.main` 启动守卫 + `/health` 测试） |
| TST-06 | P0 | 25m | 1 | DONE | 执行回归验证（frontend 定向 Vitest + backend 全量 + frontend E2E 全量）并通过 |
| TST-07 | P0 | 25m | 1 | DONE | 修复前端全量单测遗留失败（users/token-stats/sidebar）并完成前后端+E2E全量绿灯回归 |
| TST-08 | P0 | 35m | 1 | DONE | 补齐数据库集成测试链路（schema/事务/seed 幂等）并接入 CI 后端门禁（`test:all`） |
| OPT-01 | P0 | 60m | 1 | DONE | 关键页面结构重构：5 个大页面改为 `page.tsx + components/*` 组件化 |
| OPT-02 | P0 | 40m | 1 | DONE | 统一公共 Hooks 抽离：`usePagination/useDataTable/useFormHandler/useApi` |
| OPT-03 | P0 | 30m | 1 | DONE | `systemController` 按域拆分为子控制器并更新聚合层 |
| OPT-04 | P0 | 40m | 1 | DONE | 抽取 `containerService` 与 `salesService`，重构控制器为服务委托 |
| OPT-05 | P0 | 20m | 1 | DONE | 受影响前端页面与后端控制器回归验证（全量前端用例） |
| OPT-06 | P2 | 30m | 1 | DONE | 统一销售/库存页面状态徽章与日期工具（`StatusBadge`、`formatDate`） |
| OPT-07 | P1 | 30m | 1 | DONE | 补齐 `dataImportService` 回归测试（`compareWithDatabase` / `importRecords`） |
| TST-09 | P0 | 35m | 1 | DONE | 补齐 AI 编排缺口测试（`streamHelpers`/`chatOrchestrator`）并修正 `needsVision` 布尔语义，后端门禁回归通过（`test:all`） |
| TST-10 | P0 | 40m | 1 | DONE | 补齐前端共享 hooks 测试（`usePagination/useDataTable/useFormHandler/useApi`）并完成前端单测+E2E全量回归 |
| TST-11 | P0 | 35m | 1 | DONE | 补齐前端公共工具与服务工厂测试（`date-format/auth-token/binPacking/fileDownload/crudService`）并完成前端单测全量回归 |
| TST-12 | P0 | 20m | 1 | DONE | 补齐认证状态仓库测试（`auth.store` 登录/登出）并完成前端单测全量回归（`80 files / 251 tests`） |
| TST-13 | P0 | 25m | 1 | DONE | 补齐布局与主题缺口测试（`dashboard/layout`、`ThemeToggle`、`ThemeProvider`、`status-badge`）并完成前后端+E2E 全量门禁回归 |
| SIM-01 | P1 | 60m | 1 | DONE | 简化 AI 与数据导入服务核心流程：拆分长函数、去重重复逻辑、补齐流式解析错误处理与无效引用清理 |
| OPS-03 | P2 | 15m | 1 | DONE | 统一导入导出路径到 `/api/v1/import/*` 与 `/api/v1/export/*`，移除 `/api/v1/system` 下别名路径，并同步前端调用与文档 |
| RBAC-01 | P0 | 20m | 1 | DONE | 数据库模型新增 `Role` 枚举并更新 `User.role` 字段 |
| RBAC-02 | P0 | 60m | 1 | DONE | 补齐 `roleAuth` 中间件并逐路由替换后端写操作角色鉴权 |
| RBAC-03 | P0 | 30m | 1 | DONE | 注册改为管理员邀请制：`/auth/register` 仅管理员可达，前端注册页改为说明页 |
| DEBT-01 | P0 | 20m | 1 | DONE | 清理 dashboard 测试中直接 `axios` mock 依赖，统一服务层 mock |
| DEBT-02 | P0 | 20m | 1 | DONE | 去除前端兼容参数/兼容逻辑（如 `query` 兼容链路）并回归接口调用断言 |
| DEBT-03 | P0 | 15m | 1 | DONE | 补齐 `finance.service` 幂等行为测试（重复请求只触发一次 `POST`） |
| DEBT-04 | P0 | 10m | 1 | DONE | 清理已下线 mock 标记文档项并同步 `docs/模拟数据汇总.md` |
| DEBT-05 | P0 | 10m | 1 | DONE | 更新计划与任务台账，记录本轮清理交付 |
| DEBT-06 | P0 | 60m | 1 | DONE | 运行态去除 `containerNo` 兼容链路 + 财务控制器服务化重构 + 后端付款幂等（`X-Idempotency-Key`）+ 文档同步 |
| INV-01 | P0 | 30m | 1 | DONE | 库存联动修复：创建 `inventorySnapshot.js`、销售 `out_stock` 自动扣减、财务金额按数量对齐并补齐后端定向测试 |
| AUDIT-01 | P0 | 90m | 1 | DONE | 审计日志全链路增强：新增 `withAuditLog` 中间件、核心控制器写路由接入、before/after 对比、系统日志过滤增强与 CSV 导出、前端导出接入与定向回归 | 

| RBAC-04 | P0 | 35m | 1 | DONE | 新增 FINANCE/WAREHOUSE 角色、抽离 roleAuth 中间件、补齐写路由鉴权并新增 RBAC 写路由覆盖测试 |
| API-01 | P0 | 35m | 1 | DONE | 新增货柜可视化接口 `GET /api/v1/containers/:id/visualization`，返回布局/重量体积汇总/ASCII 视图并补齐服务与路由回归测试 |
| INV-ALERT-01 | P0 | 40m | 1 | DONE | 库存预警系统：新增 `Product.lowStockThreshold`、每日库存巡检任务、低库存通知下发、接口 `GET /api/v1/inventory/alerts` 与定向回归测试 |
| PDF-01 | P1 | 35m | 1 | DONE | 前端 PDF 导出增强：合同详情页（采购/销售）+ 财务应收/应付报表导出，统一 blob 下载并补齐 loading/error 处理与定向测试 |
| CI-01 | P0 | 45m | 1 | DONE | 修复 CI 红灯：LLM 路由性能烟测稳定化（AI 本地降级+超时保护+Node `--test` 识别）与 Frontend E2E 稳定性加固（公开页/业务页分流、定位收敛、点击容错、CI 单 worker） |
| CI-02 | P0 | 25m | 1 | DONE | 修复前端 Vitest CI 假红灯：定位全量/coverage 下页面交互慢测超时，并将 `frontend/vitest.config.ts` 默认 `testTimeout` 提升到 `20000` 后完成全量 `test + coverage` 复核 |
| QA-01 | P0 | 35m | 1 | DONE | 执行前端交互验收（Playwright 冒烟 + 按钮巡检 + 补充桌面/移动端/键盘脚本）并产出 `前端交互验收_20260306.md` |
| A11Y-01 | P0 | 45m | 1 | TODO | 修复移动端 Dashboard 缺少全局导航入口（`layout.tsx`/`Header.tsx`）并补移动端验收 |
| A11Y-02 | P1 | 20m | 1 | DONE | 为登录页 rememberMe 复选框补齐可访问名称并补无障碍回归验证 |
| HSCODE-01 | P0 | 25m | 1 | DONE | 新增 Prisma `HsCode` 模型、生成 `add_hs_codes_table` migration，并以服务测试作为迁移前置约束 |
| HSCODE-02 | P0 | 30m | 1 | DONE | 新增 HSCode 种子脚本、服务层与 API 路由，并完成后端定向回归 |
| HSCODE-03 | P0 | 35m | 1 | DONE | 商品管理页接入“HSCode 智能匹配”，支持候选选择后回填 `hsCode` 并展示推荐 `taxRate` |
| HSCODE-04 | P1 | 15m | 1 | DONE | 更新风险/指标/任务产物（`logs`、`RESULTS`、`PATCHES`）并完成本轮验证收口 |
| HSCODE-RAW-01 | P0 | 90m | 1 | DONE | 新增可续跑的 HSCode 原始抓取脚本，完成 `hsbianma.com` 全量章节扫取、原始 JSON 快照与总 CSV 导出 |
| CD-FE-01 | P0 | 45m | 1 | DONE | 收口 `/customs-declarations` 前端 CRUD 台账，并修复其触发的 Next16 构建阻塞（Sentry、CRUD typing、finance/container/supplier/config hook 类型与 Suspense 边界） |
| HSCODE-LIVE-01 | P0 | 45m | 1 | DONE | 将 `backend/data/hscode-live/records/*.json` 清洗入 `hs_codes` 正式表，并保留关键字段与完整原始 payload |
| TAX-DRAFT-01 | P0 | 45m | 1 | DONE | 基于报关单明细 `hsCode + totalPrice` 自动生成退税草稿，并在退税列表页提供触发入口 |
| CUSTOMS-DRAFT-01 | P0 | 45m | 1 | DONE | 基于现有 `sales_contracts + packing_items + product` 自动生成报关单草稿，并在报关单列表页提供触发入口 |
| TAX-EXPORT-01 | P0 | 45m | 1 | DONE | 出口退税申报前校验 V1：新增 `relation_no/invoice_no/vat_rate_type/match_status`，实现导出前校验、告警、规范化与 passed-only 导出，并补齐后端单测 |
| TRM-CRUD-API-01 | P0 | 35m | 1 | DONE | 既有 `customsDeclaration/forexVerification/taxRefund/taxRate` 服务层与路由模式 | 4 组税退模块 CRUD 控制器 + 路由挂载 + 定向回归测试 | `cd backend && node --test src/services/customsDeclarationService.test.js src/services/forexVerificationService.test.js src/services/taxRateService.test.js src/services/taxRefundService.test.js src/routes/taxModules.test.js src/controllers/taxRefundController.test.js` | `/api/v1/customs-declarations`、`/api/v1/forex-verifications`、`/api/v1/tax-refunds`、`/api/v1/tax-rates` 已挂载且回归通过 |
| TRM-CRUD-FE-01 | P0 | 45m | 1 | DONE | 退税 API 契约 + 现有 dashboard 页面模式 | `/dashboard/tax-refunds` 列表/详情/创建/编辑 + 服务层/类型/导航入口 + 构建修复 | `cd frontend && npm test -- src/services/taxRefund.service.test.ts src/app/dashboard/tax-refunds/page.test.tsx src/app/dashboard/tax-refunds/create/page.test.tsx 'src/app/dashboard/tax-refunds/[id]/page.test.tsx' 'src/app/dashboard/tax-refunds/[id]/edit/page.test.tsx' src/components/layout/Sidebar.test.tsx && cd frontend && npm run lint -- src/services/taxRefund.service.ts src/services/taxRefund.service.test.ts src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx src/types/index.ts src/app/layout.tsx src/app/dashboard/tax-refunds/page.tsx src/app/dashboard/tax-refunds/page.test.tsx src/app/dashboard/tax-refunds/create/page.tsx src/app/dashboard/tax-refunds/create/page.test.tsx 'src/app/dashboard/tax-refunds/[id]/page.tsx' 'src/app/dashboard/tax-refunds/[id]/page.test.tsx' 'src/app/dashboard/tax-refunds/[id]/edit/page.tsx' 'src/app/dashboard/tax-refunds/[id]/edit/page.test.tsx' src/app/dashboard/tax-refunds/components/TaxRefundStatusBadge.tsx src/app/dashboard/tax-refunds/components/TaxRefundForm.tsx src/app/dashboard/tax-refunds/components/TaxRefundListPageContent.tsx src/app/dashboard/tax-refunds/components/TaxRefundDetailPageContent.tsx && cd frontend && npm run build` | 登录后退税模块可进入、可增改查、静态校验与生产构建通过 |
| OPS-CTI-01 | P0 | 30m | 1 | DONE | 安装并配置 `claude-to-im` 飞书桥接：收缩项目 skill 入口、修复 `doctor.sh` 缺配置崩溃、写入本地 `config.env`、完成凭据校验并启动守护进程 |
| FE-COV-98 | P0 | 90m | 1 | DOING | 前端全量 Vitest + 当前 coverage 配置 | 修复既有红灯、扩 `coverage.include` 到 `src/app`/`src/services` 并把四项指标拉到 `>=98%`，产出专项报告 | `cd frontend && npm run test && npm run test:coverage` | 全量前端单测通过，Statements/Branches/Functions/Lines 全部 `>=98%` |
| FE-COV-98-A | P0 | 20m | 1 | DONE | 提炼既有执行计划与当前 coverage 配置现状，产出 `docs/coverage-98-master-plan.md` 分阶段总纲 |
| FE-COV-98-B | P0 | 25m | 1 | TODO | 锁定最新 `frontend` 全量 test / coverage 基线，输出低覆盖热点清单与阶段优先级 |
| FE-COV-98-C | P0 | 45m | 1 | TODO | 修复当前前端失败测试与 coverage 下慢测不稳定项，恢复全量单测稳定绿灯 |
| FE-COV-98-D | P0 | 35m | 1 | TODO | 扩大 `frontend/vitest.config.ts` 的 `coverage.include` 到 `src/app`/`src/services`/`src/lib`/`src/components` 并收紧 threshold |
| FE-COV-98-E | P0 | 60m | 1 | TODO | 按热点顺序补 `services/lib/app/components` 测试并清理 branches/functions 长尾缺口 |
| FE-COV-98-F | P0 | 20m | 1 | TODO | 完成最终 `test + coverage` 验证，输出专项报告并更新结果台账 |
| FE-COV-98-CI | P0 | 20m | 1 | DONE | 现有 `test-and-acceptance.yml`、`frontend/vitest.config.ts`、2026-03-12 coverage 基线实测结果 | `docs/coverage-98-ci-plan.md` + 文档导航 + checkpoint 产物 | `cd frontend && npm run test:coverage`；`git diff --check -- docs/coverage-98-ci-plan.md docs/README.md PLAN.md TASKS.md logs/task-FE-COV-98-DOC.md RESULTS/FE-COV-98-DOC.md` | CI 门禁方案已落盘，后续可按该方案推进稳定性治理和 98% 硬门禁切换 |

## 2026-03-24 HSCode 低频分片补抓

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| HSCODE-BF-01 | P0 | 120m | 2 | DONE | 识别 `400` 截断章节并执行 4 位前缀补抓；确认 `55` 章为阈值误报而非真实缺口，随后完成 manifest / CSV / 正式库三层同步到 `14161` |
| HSCODE-DIAG-01 | P0 | 45m | 1 | DONE | 新增 `HSCode` 缺失诊断脚本，结合本地前缀分布与源站边界探测重新判断当前是否仍有缺失；确认 `55` 无缺失，其余可疑章继续保留人工复核结论 |
| HSCODE-BF-02 | P0 | 90m | 2 | DONE | 对 `28/29/44/62/84/85/90` 执行 98 个 4 位前缀定向补抓，重建 manifest / CSV / 正式库到 `14391`，并复核当前“是否仍缺失”的判断边界 |
| HSCODE-XVAL-01 | P0 | 45m | 1 | DONE | 引入中国海关官方 HS4 统计表作为二级来源做交叉验证，确认当前 `14391` 数据仍存在真实缺口，而不是仅有源站探针噪声 |
| HSCODE-BF-03 | P0 | 60m | 2 | DONE | 对 `4413/4414/4415/6205/6207/8418/8419/8431/8435/8442/8519/9027/9033` 做二级来源驱动的定向补抓，重建三层数据到 `14734`，并确认这批真实缺口前缀已经全部补齐 |
| HSCODE-BF-04 | P0 | 120m | 3 | DONE | 基于官方表对 `44/62/84/85/90` 做第二轮系统对账与残余缺口补抓，将三层数据推进到 `15273`，并把官方表范围内残余缺口压缩到 `84` 章 `5` 个、`85` 章 `7` 个 |
| HSCODE-BF-05 | P0 | 45m | 2 | DONE | 对 `84/85` 两章最后 `12` 个尾差前缀再补一轮，将三层数据推进到 `15346`，并把残余缺口进一步压缩到 `8` 个前缀 |
| HSCODE-BF-06 | P0 | 30m | 1 | DONE | 改用“搜索引擎反查详情页编码 -> 精确 10 位码抓详情”清掉最后 `8` 个尾差前缀，将三层数据对齐到 `15354` |

## 2026-03-24 VPS 线上热修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| VPS-HOTFIX-01 | P0 | 35m | 1 | DONE | 修复 VPS 线上模块页统一报错：定位生产 CORS 误拦截无 `Origin` 同源请求，补后端回归测试，重新发布并复验 `/dashboard`、`/dashboard/contracts`、`/dashboard/finance` 恢复 |

## 2026-03-24 Mobile UX 收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| MOBILE-UX-01 | P0 | 45m | 1 | DONE | 收口采购合同页手机端体验：移动端改为合同卡片流 + 底部筛选 Sheet + 压缩概览区，保留桌面表格，并同步部署到 VPS 复验 |
| MOBILE-UX-02 | P0 | 40m | 1 | DONE | 收口供应商页手机端体验：新增底部搜索 Sheet + 供应商卡片流，修正双布局测试断言，并同步部署到 VPS 复验 |
| MOBILE-UX-03 | P0 | 45m | 1 | DONE | 收口库存状态页手机端体验：新增底部搜索/批量操作 Sheet + 库存卡片流，修正双布局测试断言，并同步部署到 VPS 复验 |

## 2026-03-30 Git 仓库精简收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| REPO-HYGIENE-02 | P0 | 25m | 1 | DONE | 盘点当前未提交文件，补齐 `.gitignore` 对 `frontend/qa-artifacts` 与 `frontend/backend PATCHES/RESULTS` 的忽略规则，并用 `git rm --cached` 将已跟踪过程产物从索引移除 |

## 2026-03-12 Backend Coverage 98

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| BE-COV-98 | P0 | 120m | 1 | DOING | 后端覆盖率推进到 98%，第一阶段先完成测试门禁稳定化、全量基线盘点与专项报告，第二阶段进入 controller/service 分批补测 |

## 2026-03-21 导航重构与设置精简

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| NAV-01 | P1 | 10m | 1 | DONE | 将「经营执行」从财务模块 Tab 移至经营中台模块（ops-execution 改用 OPERATIONS_TABS） |
| NAV-02 | P1 | 10m | 1 | DONE | 将「商家管理」(suppliers) 接入采购模块 Tab，更新侧边栏 childPrefixes |
| NAV-03 | P1 | 10m | 1 | DONE | 将「HS 编码」(hs-codes) 接入出口模块 Tab，更新侧边栏 childPrefixes |
| NAV-04 | P1 | 15m | 1 | DONE | 精简系统设置页：移除「基础档案」和「小工具（Cloud费用计算器）」两个Tab，默认落地系统配置 |
| NAV-05 | P1 | 5m | 1 | DONE | 修复 finance/page.tsx 中 Recharts Tooltip formatter 类型错误并通过生产构建 |
| NAV-06 | P1 | 10m | 1 | DONE | ADMIN_TABS 重排序（系统配置→用户管理→通知中心→系统日志→导入记录→AI 管理→合同模板），删除数据导入 Tab |
| NAV-07 | P1 | 15m | 1 | DONE | 「数据导入」功能改为导入记录页右上角按钮，点击跳 /dashboard/import |
| BUG-01 | P0 | 5m | 1 | DONE | 修复导入记录 404：前端 service 调用改为 /import/history |
| FIX-05 | P1 | 30m | 1 | DONE | HS 编码模糊搜索：后端 Dice 系数算法 + 前端相似度 Badge 展示 |
| UX-01 | P1 | 20m | 1 | DONE | 统一分页：HS 编码页新增 20/50/100 条每页 Select，默认 20 条 |
| UX-02 | P1 | 25m | 1 | DONE | Tab 记忆：localStorage 持久化各模块最后访问路径，侧边栏点击模块自动跳回上次位置 |
| UX-03 | P1 | 20m | 1 | DONE | 筛选重置：退税列表、报关单列表筛选区新增「重置」按钮 |

## 2026-03-21 CEO三维评审 + 设计评审 → 迭代计划

> 来源：REDUCTION / HOLD SCOPE / SCOPE EXPANSION 三轮 CEO Review + Design Review。  
> 按优先级排序，P0 = 质量危机/影响上线，P1 = 可见体验缺陷，P2 = 扩展与优化。

### 🔴 P0 质量门禁

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| QG-01 | P0 | 60m | 1 | TODO | 修复 46 个前端失败测试：定位失败原因（mock 不同步、页面行为变更），逐文件修复直到 0 red（对应 FE-COV-98-C） |
| QG-02 | P0 | 15m | 1 | TODO | API 缓存内存泄漏修复：`api-cache.ts` 增加 `setInterval` 每 5 分钟清理过期条目，或引入 LRU 策略限制最大 200 条 |
| QG-03 | P0 | 20m | 1 | TODO | 全局 React Error Boundary：在 `app/layout.tsx` 外层加 `<GlobalErrorBoundary>`，catch 渲染崩溃并展示「页面异常，点击刷新」fallback UI |

### 🟡 P1 体验与架构

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| ARCH-01 | P1 | 45m | 1 | TODO | HS 编码 SQLite FTS5 索引：对 `hs_codes.product_name` 建 FTS5 虚拟表，fuzzySearch 改为 `MATCH` 语句，候选集压缩到 <100 条再做 Dice 排序，解决 12k 记录全扫性能问题 |
| ARCH-02 | P1 | 30m | 1 | TODO | 分页状态 URL 同步：HS 码、采购合同、销售合同、付款记录等列表页将 `page/pageSize/keyword` 写入 URL query string（`useSearchParams`+`router.replace`），支持浏览器回退与书签 |
| ARCH-03 | P1 | 20m | 1 | TODO | RBAC 写路由审计：盘查所有 POST/PUT/DELETE 路由，确认 `system-configs`、`users`、`roles` 等管理类端点已加 `requireAdmin` 中间件，消除普通员工越权风险 |
| DESIGN-01 | P1 | 20m | 1 | TODO | 采购列表空单元格修复：当采购单缺少供应商/金额/状态字段时，展示「—」占位符而非空白，避免表格参差不齐（Design Review P1） |
| DESIGN-02 | P1 | 15m | 1 | TODO | 图表坐标轴字号修复：财务趋势折线图 X/Y 轴 `tick` 字体从 10px 提升到 12px，图例文字同步放大，提升可读性（Design Review P1） |
| DESIGN-03 | P1 | 20m | 1 | TODO | 统一空态设计：产品/库存/合同等空列表页统一使用「插画 + 主操作按钮」的空态卡片（Design Review P1） |
| REDUCE-01 | P1 | 20m | 1 | TODO | 移除「门店推荐」页（`/dashboard/store-recommend`）：CEO REDUCTION 识别为低频且维护成本高，删除页面、路由、侧边栏入口，相关测试同步清理 |
| REDUCE-02 | P1 | 15m | 1 | TODO | 移除 `ComplianceHint` 悬浮合规提示组件：CEO REDUCTION 识别为打断用户流程的噪音，暂时下架，后续可改为「按需查询」模式集成到 HS 编码详情页 |

### 🟢 P2 扩展能力（SCOPE EXPANSION 近期可落地）

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| EXP-01 | P2 | 90m | 1 | TODO | AI HS 码推荐助手：在 HS 编码搜索区加「AI 辅助识别」按钮，用户输入产品描述，调用 Kimi/MiniMax API 返回推荐 HS 编码列表 + 税率，利用现有 AI 配置体系 |
| EXP-02 | P2 | 45m | 1 | TODO | 汇率自动同步：定时拉取央行/ExchangeRate-API 公开汇率，写入 `system_configs`，财务模块付款换算自动引用最新汇率而非手动填写 |
| EXP-03 | P2 | 60m | 1 | TODO | 合同 Word 模板导出：基于 `docxtemplater`，采购/销售合同详情页增加「导出 Word」选项，输出带公司抬头/盖章位置的标准合同格式 |
| EXP-04 | P2 | 120m | 2 | TODO | 供应商文件自服务门户 V1：生成带时效的供应商上传链接，供应商无需登录即可上传报价单/发票/合规文件，文件归入对应采购合同附件 |
