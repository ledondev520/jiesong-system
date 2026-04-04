# 捷淞系统 UI 交互测试报告

## 2026-04-04 回放级别显式化

- 已把 replay provenance 再推进一层：
  - 后端现在显式下发 `governanceReplayLevel`
  - 前端会直接显示 `回放级别：工具层 / 建议层 / 动作层`
- 这样现在这页不仅知道能回放什么，还知道系统给出的统一回放级别。
- 已完成验证：
  - `node --test backend/src/controllers/aiController.test.js` 通过（`5/5`）
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`17/17`）
  - `git diff --check -- backend/src/controllers/aiController.js backend/src/controllers/aiController.test.js frontend/src/services/ai.service.ts frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - 这层 level 还是 controller 基于 summary 现算的
  - 下一段如果继续推进，更适合把 replay level 沉到更稳定的服务端事件分类或独立持久字段

## 2026-04-04 回放能力摘要显式化

- 已把 replay provenance 再推进一层：
  - 后端现在显式下发 `governanceReplaySummary`
  - 前端列表会直接显示 `工具回放 / 建议回放 / 动作回放`
- 这样现在这页不只是知道“能回放”，而是知道“能回放哪一层”。
- 已完成验证：
  - `node --test backend/src/controllers/aiController.test.js` 通过（`5/5`）
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`17/17`）
  - `git diff --check -- backend/src/controllers/aiController.js backend/src/controllers/aiController.test.js frontend/src/services/ai.service.ts frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - 这层 summary 还是 controller 基于 metadata 现算的
  - 下一段如果继续推进，更适合把 replay 层级进一步沉到更稳定的服务端事件分类或独立字段

## 2026-04-04 审计回放状态显式化

- 已把前端治理语义再往数据层推进一层：
  - 页面会直接显示 `当前数据：已审计回放`
  - 明确告诉用户当前列表里的治理信号已经来自持久化会话元数据
  - 详情里可以继续回放工具、建议和动作轨迹
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`17/17`）
  - `node --test backend/src/controllers/aiController.test.js` 通过（`5/5`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - 这层 provenance 现在已经有后端显式字段支撑，但字段本身仍是 controller 基于 metadata 的计算结果
  - 下一段如果继续推进，更适合把它进一步下沉成更稳定的服务端审计标志或事件分类

## 2026-04-04 自动治理视角不写 URL

- 已把自动失败兜底进一步收口成真正的瞬时态：
  - 不再污染 localStorage
  - 现在也不再自动回写 URL query
- 这样当前页仍然能自动切到失败优先视角，但这个临时状态不会悄悄变成可分享链接或长期偏好。
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`16/16`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - 自动治理态现在已经彻底不持久化，但来源解释仍然只在前端
  - 下一段如果继续推进，更适合把 URL、本地偏好、默认视图三类来源说明也补齐

## 2026-04-04 治理视角来源提示

- 已把治理状态再往前解释一层：
  - 自动失败兜底时会直接显示 `来源：自动失败视角`
  - 用户手动切换后会显示 `来源：手动调整`
- 这样现在页面不只解释“怎么排”，也解释“为什么当前会落在这个视角”。
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`15/15`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - 现在先只解释了自动/手动两条核心路径
  - 下一段如果继续推进，最合理的是把 URL、本地偏好、默认视图三类来源也统一收口成同一套说明

## 2026-04-04 风险排序显式提示

- 已把默认排序规则从“只体现在结果里”推进到“页面可见”：
  - `risk` 模式下现在会直接显示 `当前：超时优先风险排序`
  - 并附一句简短顺序说明
- 这样现在用户不需要猜为什么某条会话排在最前面。
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`15/15`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - 现在解释的是排序规则，但还没解释“当前为什么落在 auto 失败视角”
  - 下一段如果继续推进，更适合补治理状态来源提示，而不是继续加新排序文案

## 2026-04-04 自动治理视角不污染偏好

- 已修复 AI sessions 页面一个状态持久化回归：
  - 页面在有失败动作时仍会自动切到失败优先视角
  - 但这个 `auto` 视角不再覆盖用户原本存下来的 localStorage 偏好
- 根因是最近把“自动治理兜底”和“用户显式偏好”接到了同一条持久化链路上，导致一次自动失败分诊就能把历史筛选偏好改写成 `failed / risk`。
- 已补回归测试，覆盖：
  - 先在有失败动作场景触发自动失败视角
  - 再在无失败场景重新挂载页面
  - 验证原有 `completed` 偏好仍能恢复，而不是落到空列表
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`15/15`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - `auto` 状态现在不会污染 localStorage，但仍可能同步到 URL
  - 如果后续希望把自动分诊完全视为“瞬时态”，下一段再单独调整 query 回写策略

## 2026-04-04 超时优先风险排序

- 已把默认风险排序升级成真正会消费老化信号的排序：
  - `超时失败`
  - `超时待确认`
  - `普通失败`
  - `普通待确认`
  - 其余动作/无动作
- 这样现在 stale workload 不只是可见，而且会被默认顶到列表前面。
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`13/13`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - 这套优先级仍是前端值班排序规则，不是后端正式 SLA
  - 下一段如果继续推进，最合理的是给用户一个显式的“超时优先”排序标签或切换提示，避免默认规则过于隐性

## 2026-04-04 摘要条超时聚合徽标

- 已把顶部值班摘要里的老化信号再推进一层：
  - `超时失败 X`
  - `超时待确认 Y`
- 现在用户不需要读完整句子，也能一眼扫到当前超时积压。
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`12/12`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - 超时聚合已经更清晰了，但还没有真正进入排序逻辑
  - 下一段如果继续推进，更值得做的是把列表排序升级成“超时优先”

## 2026-04-04 摘要条老化升级提示

- 已把顶部值班摘要继续推进到“带老化判断”的状态：
  - 失败动作会话超过 4 小时时会直接提示超时数量
  - 待确认会话挂起超过 2 小时时也会直接提示
- 这样现在顶部不只告诉你“有问题”，还会告诉你“哪些问题已经拖久了”。
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`12/12`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - 老化阈值目前还是前端展示规则，不是正式 SLA 契约
  - 下一段如果继续推进，更合理的是把超时数量做成显式聚合，或者把排序进一步改成“超时优先”

## 2026-04-04 顶部值班摘要条

- 已把 AI 会话列表顶部再推进一层：
  - 页面现在会直接显示当前值班摘要
  - 存在失败动作时会提示“当前有 X 个失败动作会话需要优先处理”
  - 并提供一键切到对应治理视角的入口
- 这层摘要会根据当前会话集合自动切换为：
  - 失败优先
  - 待确认
  - 已收口
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`12/12`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - 摘要条目前还是静态规则提示，没有接超时/升级逻辑
  - 下一段如果继续推进，最值得做的是把摘要条和 SLA 升级条件或待处理老化时间绑定起来

## 2026-04-04 会话级 SLA 与值班提示

- 已把 AI 会话列表继续推进成更像值班台的形态：
  - 每条会话会显示 `SLA P1 / P2 / P3`
  - 同时会显示 `需立即处理 / 待人工确认 / 已闭环`
- 这层信号已经覆盖：
  - 桌面表格
  - 移动端卡片
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`12/12`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - 现在的严重度和处置状态还是展示层信号
  - 下一段如果继续推进，更值得做的是待处理摘要条或 SLA 超时/升级策略，而不是继续堆更多 badge

## 2026-04-04 治理预设 Sticky 控制条

- 已把顶部治理预设进一步收口成 sticky 控制条：
  - 滚动列表时仍可见
  - 当前激活态可直接辨认
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`12/12`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - sticky bar 还是轻量控制条，不是完整值班台
  - 下一段应补会话级严重度徽标或待处理入口强化

## 2026-04-04 排序/筛选 URL 持久化

- 已把 AI 会话列表的治理视角持久化到 URL：
  - `sort`
  - `actionFilter`
- 现在刷新后不会丢当前排序/筛选状态，复制链接也能保留当前视角。
- 默认值不会写回 URL，避免 query 变脏。
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`6/6`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - 还没有 local storage 偏好记忆
  - 下一段如果继续推进，就补 URL + local storage 双层恢复

## 2026-04-04 列表层可切换排序

- 已把 AI 会话列表从“固定风险排序”推进到“可切换排序”：
  - `风险优先`
  - `最近动作`
  - `最近消息`
- 新排序方式已经和现有动作筛选兼容，可一起使用。
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`5/5`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - 排序模式还不会记忆用户偏好
  - 下一段如果继续推进，最合理的是把排序/筛选同步到 URL 或 local storage

## 2026-04-04 列表层动作排序与筛选

- 已把 AI 会话列表从“可分诊”推进到“可优先处理”：
  - 列表会优先把 `失败动作` 会话排前面
  - 其次是仍有 `待确认` 动作的会话
  - 其余会话再按最近动作时间排序
- 已新增动作筛选：
  - `全部`
  - `有失败`
  - `有待确认`
  - `已完成动作`
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`5/5`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx PLAN.md TASKS.md RISKS.md METRICS.md task_plan.md progress.md` 通过
- 当前剩余风险：
  - 排序规则仍是固定的
  - 如果继续推进，下一段最有价值的是补用户可切换的排序模式

## 2026-04-04 列表层失败高亮与最近动作时间

- 已把会话列表的动作治理再推进一层：
  - 失败动作会直接在列表层显示
  - 最近动作时间会直接在列表层显示
- 这样现在首页可以更快分诊“哪条会话先点开”。
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`4/4`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx` 通过
- 当前剩余风险：
  - 还没有排序/筛选
  - 下一轮直接做按失败优先与最近动作时间排序会更有价值

## 2026-04-04 列表层失败高亮与最近动作时间

- 已把 AI 会话列表的动作治理再往前推了一段：
  - 失败动作会在列表层直接露出 `失败动作`
  - 列表会显示 `最近动作 yyyy-MM-dd HH:mm:ss`
- 这层信号已经覆盖：
  - 桌面表格
  - 移动端卡片
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`4/4`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx` 通过
- 当前剩余风险：
  - 仍然没有排序/筛选
  - 下一段如果继续推进，应该补“按失败优先/按最近动作时间排序”的治理交互，而不是继续加静态文案

## 2026-04-04 列表层动作状态汇总

- 已把动作治理信号从详情页推进到列表层：
  - 会话列表现在会显示 `动作 X · 待确认 Y · 已执行 Z ...`
  - 移动端卡片和桌面表格口径一致
- 这样现在在 AI 日志首页就能快速扫出：
  - 哪些会话还挂着待确认动作
  - 哪些会话动作已经执行完
  - 哪些会话有失败/取消动作
- 已完成验证：
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`4/4`）
  - `git diff --check -- frontend/src/app/dashboard/ai/sessions/page.tsx frontend/src/app/dashboard/ai/sessions/page.test.tsx` 通过
- 当前剩余风险：
  - 列表层只展示计数，不展示最近动作时间或失败高亮
  - 如果后面列表要更强治理，再补状态颜色或最近事件时间会更有效

## 2026-04-04 待确认动作生命周期时间线

- 已把待确认动作 replay 从“最终态覆盖”再推进到“生命周期时间线”：
  - metadata 里的 `createdAt` 作为创建事件
  - `OperationLog` 里的 execute/cancel/fail 作为后续事件
  - controller 会把它们拼成动作级 timeline
- AI sessions 详情现在能看到：
  - 当前状态
  - 结果说明
  - `created / executed / cancelled / failed` 的时间顺序
- 已完成验证：
  - `node --test backend/src/controllers/aiController.test.js` 通过（`5/5`）
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`4/4`）
  - `node -c backend/src/controllers/aiController.js` 通过
- 当前剩余风险：
  - 这仍是轻量 timeline，不是完整状态机
  - 如果以后一个动作支持重试、补偿或重开，会需要更正式的 action event model

## 2026-04-04 待确认动作最终态回放

- 已把待确认动作 replay 从“创建时快照”补到“最终状态可见”：
  - `executeAction` 会写入 `status=executed`
  - `cancelAction` 会写入 `AGENT_WRITE_CANCEL`
  - 失败路径会写入 `AGENT_WRITE_FAILED`
- `getSessions / getChatHistory` 现在会用 `OperationLog` 覆盖动作最终态：
  - `pending`
  - `executed`
  - `cancelled`
  - `failed`
  - 并会附带 `resultDetail`
- AI sessions 详情中的“待确认动作”现在不只是列动作描述，还会显示最终状态和执行/取消说明。
- 已完成验证：
  - `node --test backend/src/controllers/aiController.test.js` 通过（`5/5`）
  - `node --test backend/src/services/eventLedgerService.test.js` 通过（`3/3`）
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`4/4`）
  - `node -c backend/src/services/openAgentService.js && node -c backend/src/controllers/aiController.js` 通过
- 当前剩余风险：
  - 这还是“最新态覆盖”，不是完整时间线
  - 如果后面一个动作需要多次补偿/重试，就要升级成 action lifecycle timeline

## 2026-04-04 确认执行链治理回放补齐

- 已把“待确认动作”也接进 AI 会话治理回放：
  - `persistAgentRun` 现在会保存 `pendingActionSummary`
  - `getSessions / getChatHistory` 会把这层摘要返回给前端
  - AI sessions 详情弹窗现在能看到“待确认动作”列表
- 当前治理面已经能同时回答三层问题：
  - 这次用了哪些工具
  - 这次建议了哪些动作
  - 这次实际生成了哪些待确认动作
- 已完成验证：
  - `node --test backend/src/controllers/aiController.test.js` 通过（`5/5`）
  - `cd frontend && npx vitest run src/app/dashboard/ai/sessions/page.test.tsx` 通过（`4/4`）
  - `node -c backend/src/services/openAgentService.js` 通过
- 当前剩余风险：
  - 回放的 `pendingActionSummary` 还是 run 生成瞬间的快照，不会自动反映后续“已执行 / 已取消”
  - 如果要继续推进，下一段更有价值的是把动作执行结果也接成时间线，而不是只加更多摘要字段

## 2026-04-04 财务高置信挂账建议闭环

- 已把确认执行链从 tax-compliance 再推进一小段到财务侧：
  - `DiagnoseSalesContractFlow` 现在会检查待分配收款池
  - 若存在唯一高置信候选，会把“跟进合同回款”升级成 `AllocatePayment`
  - 若同时命中多笔收款，则继续保持 `manual`
- 当前高置信边界是：
  - 备注里只有一个合同号引用
  - 该合同只命中一笔待分配收款
  - 收款剩余金额与合同待收金额一致
- 已补行为护栏测试：
  - 唯一命中时升级为 `confirmable_write`
  - 多命中时不升级，避免误挂账
- 已完成验证：
  - `node --test backend/src/services/openAgentService.test.js` 通过（`18/18`）
  - `node -c backend/src/services/openAgentService.js` 通过
- 当前剩余风险：
  - 这条闭环只适用于备注质量高、单合同单笔回款的场景
  - 客户级汇总回款、多合同混合回款仍应保持人工分配

## 2026-04-04 诊断建议进入确认执行链

- 已把“建议对象化”继续推进成“建议可进入确认执行链”：
  - runtime 现在会自动识别 `confirmable_write` 的 `actionRecommendations`
  - 并把它们物化成现有 `pendingActions`
  - 用户不需要再等模型重复调用一次写工具
- 已新增 3 个 tax-compliance draft 类受控写动作：
  - `CreateCustomsDeclarationDraft`
  - `CreateForexVerificationDraft`
  - `CreateTaxRefundDraft`
- 已让两类组合诊断开始产出真正可执行的建议参数：
  - `DiagnoseSalesContractFlow`
  - `DiagnoseTradeComplianceReadiness`
  - 在条件充分时会返回 `executionMode=confirmable_write`，并附 `actionType / params`
- 已把实时助手补成“诊断建议 + 待确认动作”同屏：
  - 消息内可看到诊断建议标题、优先级、执行模式、原因
  - 若该建议已被物化，会同时显示确认执行卡片
- 已完成验证：
  - `node --test backend/src/services/openAgentService.test.js` 通过（`16/16`）
  - `cd frontend && npx vitest run src/components/ai/AIAssistant.test.tsx` 通过（`11/11`）
  - `node -c backend/src/services/openAgentService.js` 通过
- 当前剩余风险：
  - 这轮只把 tax-compliance draft 动作接入闭环，采购/库存/财务建议还未做同等级桥接
  - draft 单号目前由执行器即时生成，适合当前闭环验证，但还不是正式编号治理

## 2026-04-04 组合诊断建议闭环可见化

- 已把组合型诊断从“只给文本提示”推进到“给结构化建议动作”：
  - `DiagnoseSalesContractFlow`
  - `DiagnosePurchaseExecution`
  - `DiagnoseTradeComplianceReadiness`
  - 三者现在都会返回 `recommendedActions`
- 已把建议动作接进 runtime metadata：
  - 复合诊断工具输出会在执行层被提炼成 `actionRecommendations`
  - 会随 `toolTraceSummary` 一起进入 `ChatHistory` / `AGENT_RUN` 相关 metadata
- 已把 AI 会话治理面继续做深：
  - 会话列表可看到建议动作数量
  - 会话详情可直接回放“推荐动作”
  - 推荐动作会展示优先级、执行模式、所属域和原因
- 已完成验证：
  - `node --test backend/src/services/openAgentService.test.js backend/src/services/eventLedgerService.test.js backend/src/controllers/aiController.test.js backend/src/routes/ai.test.js` 通过（`24/24`）
  - `cd frontend && npx vitest run src/services/ai.service.test.ts src/app/dashboard/ai/sessions/page.test.tsx` 通过（`14/14`）
  - `node -c backend/src/services/openAgentService.js && node -c backend/src/controllers/aiController.js` 通过
- 当前剩余风险：
  - 建议动作还是以 `manual` 为主，尚未把少量安全写动作接成 `confirmable_write`
  - 下一段最值得推进的是：让部分建议真正能进入 pendingAction 确认流，而不是只停在治理回放层

## 2026-04-04 Universal Agent Runtime V2 实施起步

- 已开始把 runtime 从“统一入口 + 分散工具函数”收口成“统一主 Agent + tool registry”：
  - `unified` 明确为唯一主公开入口
  - `finance / export / executive` 标记为 legacy/internal 兼容态
  - runtime 已新增第一版 tool registry 导出能力
- 已新增首批更像“系统感知层”的跨域读工具：
  - `SearchEntities`
  - `GetPurchaseOverview`
  - `GetSupplierOverview`
  - `GetSalesContractDetail`
  - `GetPurchaseContractDetail`
  - `GetFinanceRiskOverview`
  - `GetInventoryOverview`
  - `GetLowStockAlerts`
  - `GetTaxComplianceOverview`
  - `GetCustomsDeclarationDetail`
  - `GetTaxRefundDetail`
  - `GetForexVerificationDetail`
  - `GetRecentEvents`
- 已落轻量内部路由：
  - 按消息关键字判断 `focused / cross-domain / broad / legacy-explicit`
  - 先裁剪本轮可见工具面，再交给统一主 Agent 推理
- 已补可观测性：
  - 会话列表返回 `routeMode / domainsTouched / toolsUsed`
  - 会话详情可展示 message 级 `routePlan / selectedToolNames`
  - Agent tool call 会汇总成 `toolTraceSummary` 并进入 `AGENT_RUN` 事件细节
- 已开始把“深写能力”接入统一主 Agent：
  - `CreateSupplierRecord`
  - `UpdateSupplierRecord`
  - `CreatePurchaseContract`
  - `UpdatePurchaseContract`
  - `UpdateInventoryStatus`
- 已为写工具补角色门控元数据：
  - 财务写：`ADMIN / FINANCE`
  - 销售写：`ADMIN / SALES`
  - 采购/供应商写：`ADMIN / PURCHASE`
  - 库存状态写：`ADMIN / WAREHOUSE`
  - 系统配置写：`ADMIN`
- 已把 tool registry 暴露成正式接口并接到 AI 会话页：
  - backend `GET /api/v1/ai/agents/tools`
  - frontend AI 会话页展示主入口、读工具数、写工具数、覆盖域数
- 已把会话级 replay 再推进一层：
  - AI 会话详情可显示 `toolTraceSummary.items`
  - 能看到工具名、状态、耗时和失败原因
- 已把治理面推进到“按当前角色看工具域”：
  - tool registry payload 支持 `viewerRole`
  - domain 统计支持 `availableCount / availableWriteCount`
  - AI 会话页可显示当前角色和按域工具数量
- 已把工具域再推进到“组合型任务工具”：
  - `DiagnoseSalesContractFlow`
  - `DiagnosePurchaseExecution`
  - `DiagnoseTradeComplianceReadiness`
  - 这三类工具不再只是概览查询，而是直接聚合跨域事实并输出 blocker / nextActions
- 已把治理面区分“普通工具”与“复合工具”：
  - registry tool payload 新增 `isComposite`
  - domain 摘要新增 `compositeToolCount`
  - AI 会话页可显示按域复合工具数量和域描述
- 当前方向是先扩工具面和统一 prompt，不急着上多 sub-agent 编排
- 已完成验证：
  - `node --test backend/src/services/openAgentService.test.js` 通过（`11/11`）
  - `node --test backend/src/services/openAgentService.test.js backend/src/services/eventLedgerService.test.js backend/src/controllers/aiController.test.js backend/src/routes/ai.test.js` 通过（`18/18`）
  - `node --test backend/src/services/openAgentService.test.js backend/src/services/eventLedgerService.test.js backend/src/controllers/aiController.test.js backend/src/routes/ai.test.js` 通过（`24/24`）
  - `cd frontend && npx vitest run src/services/ai.service.test.ts src/app/dashboard/ai/sessions/page.test.tsx` 通过（`14/14`）
  - `node -c backend/src/services/openAgentService.js` 通过

---

## 2026-04-03 Agent Runtime 状态校正

- 已确认 Agent 主链不是“待接入”，而是已经落地到可运行状态：
  - backend in-process runtime
  - `unified / finance / export / executive` 预置 Agent
  - `/api/v1/ai/agents/prompt` 与 `/prompt-stream`
  - `pendingAction` 二阶段确认写操作
  - Agent 账号 / 凭证 / CLI / HTTP MCP
- 已确认当前前端真实断点：
  - `frontend/src/services/ai.service.ts` 曾请求 `/ai/chat-history`
  - backend 实际暴露的是 `GET /api/v1/ai/history`
  - 本轮已按 TDD 修正为 `/ai/history`
- 已确认文档漂移：
  - `task_plan.md`、`docs/README.md` 仍把 runtime / CLI / MCP 描述为“待落地”
  - 现已同步更新为“主体已落地，剩余是收口与校正”
- 当前剩余风险：
  - Agent 权限口径与早期设计文档仍有漂移，设计文档强调显式 grant + 默认 read/create，而当前实现是创建 Agent 自动给固定能力集并包含 update
  - 深度集成验证仍偏少，现有测试更多覆盖接口/服务/前端调用链的定向校验，而不是完整 runtime happy-path

---

## 2026-04-02 Agent Runtime 融合进度

- 已完成外部仓库 `.tmp/open-agent-sdk-typescript` 的本地源码拉取与结构审阅。
- 已确认当前系统里最适合承接融合的模块：
  - backend `/ai` 路由与 `aiService`
  - backend `agentAccountService`
  - Prisma 模型 `ChatHistory / TokenUsage / OperationLog / ImportRecord / AgentAccount / AgentCredential`
- 已确认阶段目标：
  - Phase 1 做 read-only Agent Runtime
  - 三个预置 agent：财务、出口单证、老板驾驶舱
  - 不直接使用 SDK 默认文件系统 session 作为主存储
- 当前下一步：
  - 已完成，当前转为收口文档、权限口径与集成验证

---

# 捷淞系统 UI 交互测试报告

## 2026-04-02 客户级收款池与部分分摊进度

- 已为 `Payment` 增加 `customerName` 与 `sourcePaymentId`。
- 已实现部分分摊：原始收款只有在全部分完后才退出池子。
- 已将历史 `INCOME` 默认补齐客户名 `Sp food trading LLC`。
- 已完成验证：
  - `node --test backend/src/services/financeService.test.js backend/prisma/import-payments.test.js backend/src/routes/finance.test.js` 通过
  - `cd frontend && npm test -- src/services/finance.service.test.ts src/app/dashboard/payments/page.test.tsx` 通过
  - 真实库抽查：收款池 `25` 笔，全部带客户名与 `remainingAmount`

## 2026-04-02 付款备注规范收口进度

- 已为导入脚本增加结构化备注输出与模块导出测试。
- 已为收款录入增加 `合同号（选填）` 字段，并统一通过 `finance-note` helper 生成备注。
- 已完成验证：
  - `node --test backend/prisma/import-payments.test.js backend/src/services/financeService.test.js backend/src/routes/finance.test.js` 通过
  - `cd frontend && npm test -- src/lib/finance-note.test.ts src/services/finance.service.test.ts src/app/dashboard/payments/page.test.tsx` 通过
- 当前 blocker：
  - 已收口：已定位并切换到稳定原始文件 `/Users/helena/Documents/捷淞/4-财务部/合同明细、美元交易.xlsx`
  - 已用该文件重导成功，本地 `payments` 恢复为 `60` 条

## 2026-04-01 收款池半自动挂账进度

- 已新增后端自动匹配入口：对收款池执行高置信度规则扫描。
- 已新增前端“自动匹配”按钮，用户可在 `/dashboard/payments` 显式触发。
- 已完成验证：
  - `node --test backend/src/services/financeService.test.js backend/src/routes/finance.test.js` 通过
  - `cd frontend && npm test -- src/services/finance.service.test.ts src/app/dashboard/payments/page.test.tsx` 通过
- 已做真实库只读抽查：当前池内 `25` 笔中，高置信度候选 `0` 笔；短期瓶颈已转向备注/导入质量，而不是匹配逻辑本身。

## 2026-04-01 财务 P0 修复进度

- 已确认根因：真实库 payment 类型为 `INCOME / EXPENSE`，与 `financeService` 当前识别集合不一致。
- 已按 TDD 补充 `financeService` 红灯测试：待分配池兼容、历史收款可分配、趋势统计兼容。
- 已在服务层落地兼容映射，并在分配后把原始到账记录标记为 `RECEIVABLE_RECEIPT_ALLOCATED`。
- 已完成验证：
  - `node --test backend/src/services/financeService.test.js` 通过
  - 真实库 `listUnallocatedPayments()` 返回 `25` 笔
  - 真实库 `getPaymentTrends(90)` 返回 `2` 个非空趋势点

**测试时间**: 2026-03-31 08:46:00
**测试工具**: gstack browse
**测试目标**: localhost:3000 (Next.js 前端)
**总测试页面**: 16 个

---

## 测试摘要

| 功能模块 | 状态 | 说明 |
|---------|------|------|
| 登录页面 | ✅ | 正常加载，快捷登录功能正常 |
| 登录功能 | ✅ | admin/123456 可正常登录 |
| 仪表盘 | ✅ | 数据加载正常，工作台卡片显示正确 |
| 销售管理 | ✅ | 出口合同列表显示正常 (42条记录) |
| 采购管理 | ❌ | `/dashboard/purchase` 返回 404 |
| 报关管理 | ✅ | 报关单管理页面正常 (4条记录) |
| 退税管理 | ✅ | `/dashboard/tax-refunds` 和 `/tax-refunds` 均可访问 |
| 财务管理 | ✅ | 财务报表页面正常 |
| 合同管理 | ✅ | 采购合同页面正常 |
| 商品管理 | ✅ | HS编码管理页面正常 |
| 供应商管理 | ✅ | 供应商列表正常 |
| 用户管理 | ✅ | 用户列表正常 |
| 系统设置 | ✅ | 设置页面正常 |
| 系统管理 | ✅ | 系统日志等页面正常 |
| 外汇核销 | ✅ | 外汇核销页面正常 |

**健康度评分**: 15/16 页面正常 (93.75%)

---

## 发现的问题

### 1. 严重问题

#### P1: 采购管理页面 404
- **路径**: `/dashboard/purchase`
- **现象**: 页面返回 404 Not Found
- **影响**: 用户无法访问采购管理功能
- **建议**: 检查路由配置或文件是否存在

### 2. 中等问题

#### P2: 控制台 404 错误
- **现象**: 控制台记录多个 404 错误
- **原因**: 测试过程中访问了已移除的路由（如 `/sales`, `/purchases` 等根路径）
- **建议**:
  - 确认旧路由是否需要重定向到新路径
  - 添加 404 页面友好提示

#### P3: 路由不一致
- **现象**:
  - 退税管理有两个入口: `/tax-refunds` 和 `/dashboard/tax-refunds`
  - 报关管理: `/customs-declarations` (不在 dashboard 下)
  - 外汇核销: `/forex-verifications` (不在 dashboard 下)
- **建议**: 统一路由结构，所有功能模块放在 `/dashboard/*` 下，或统一放在根路径

### 3. 轻微问题

#### P4: 登录页面顶部黄色边框
- **现象**: 登录页面顶部有一条橙色/黄色边框
- **建议**: 可能是浏览器滚动条或调试标记，确认是否为预期样式

---

## 改进建议

### 1. 路由架构优化

```
建议统一为以下结构:
/dashboard                    # 工作台首页
├── sales                    # 出口合同管理
├── purchase                 # 采购管理 (需修复)
├── contracts                # 合同模板
├── customs-declarations     # 报关管理
├── tax-refunds             # 退税管理
├── finance                 # 财务管理
│   ├── statements
│   ├── payable
│   └── receivable
├── products                # 商品/HS编码管理
├── suppliers               # 供应商管理
├── customers               # 客户管理
├── users                   # 用户管理
├── settings                # 系统设置
└── system                  # 系统管理
```

### 2. 404 页面优化

建议添加友好的 404 页面，包含：
- 返回首页按钮
- 导航菜单
- 错误提示信息

### 3. 性能优化

从测试结果看页面加载性能：
- TTFB: 816ms (可优化)
- DOM Ready: 1914ms
- 总加载时间: 1926ms

建议：
- 启用 Next.js 图片优化
- 添加页面加载骨架屏
- 考虑数据分页加载

### 4. 交互体验优化

#### 快捷登录
- ✅ 已支持一键登录功能
- ⚠️ 建议增加"清除快捷登录"按钮，方便多用户环境

#### 表单交互
- 检查所有表单是否有 loading 状态
- 添加操作成功/失败的 toast 提示

---

## 截图记录

| 序号 | 截图 | 描述 |
|-----|------|------|
| 01 | `01_login_page.png` | 登录页面 - 快捷登录已开启 |
| 02 | `02_after_login.png` | 登录后页面 |
| 03 | `03_dashboard.png` | 工作台首页 - 数据看板 |
| 04 | `04_dashboard_sales.png` | 出口合同管理 - 42条记录 |
| 05 | `05_purchases.png` | 404 页面 |
| 06 | `06_customs-declarations.png` | 报关单管理 - 4条记录 |
| 07 | `07_dashboard_tax-refunds.png` | 退税管理 |
| 08 | `08_dashboard_finance.png` | 财务报表 |
| 09 | `09_dashboard_contracts.png` | 合同管理 |
| 10 | `10_dashboard_products.png` | 商品管理 |
| 11 | `11_dashboard_suppliers.png` | 供应商管理 |
| 12 | `12_dashboard_users.png` | 用户管理 |
| 13 | `13_dashboard_settings.png` | 系统设置 |
| 14 | `14_dashboard_system.png` | 系统管理 |
| 15 | `15_tax-refunds.png` | 退税独立页面 |
| 16 | `16_forex-verifications.png` | 外汇核销 |

---

## 修复优先级

| 优先级 | 问题 | 预估工作量 |
|-------|------|-----------|
| P0 | 修复采购管理 404 | 1小时 |
| P1 | 统一路由结构 | 2-4小时 |
| P2 | 添加友好 404 页面 | 1小时 |
| P3 | 性能优化 | 4-8小时 |
| P4 | 交互细节优化 | 2-4小时 |

---

## 历史记录

- 2026-03-30: Confirmed the correct repo is `jiesong_system` and exposed the login page through Cloudflare for phone review.
- 2026-03-30: Fixed mobile dialog fullscreen behavior, removed duplicate dev cockpit top-level tab, and made AI assistant FAB draggable.
- 2026-03-30: Began story-driven dashboard restructuring research for procurement/export/finance mobile flows.
- 2026-03-30: Reworked the dashboard into story-driven lanes and updated procurement/export/finance module landing pages for clearer next-step actions on mobile.
- 2026-03-31: 完成全面 UI 交互测试，生成改进报告

---

*报告由 gstack QA 工具自动生成*
