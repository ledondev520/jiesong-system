# Frontend Coverage 98% CI Gate Plan

## 1. 目的

- 将 `docs/coverage-98-master-plan.md` 的总体目标，收敛为可执行的 CI 门禁切换方案。
- 明确前端 coverage 从“当前低阈值占位配置”切换到“真实口径 + 98% 硬门禁”的顺序、前置条件与回退策略。

## 2. 当前 CI 基线

### 2.1 已有工作流

`.github/workflows/test-and-acceptance.yml` 当前前端门禁顺序为：

1. `npm ci`
2. `npm run test`
3. `npm run test:coverage`

`frontend-e2e` 依赖 `frontend-unit`，因此 coverage 红灯会直接阻断后续 E2E。

### 2.2 当前 coverage 配置

`frontend/vitest.config.ts` 当前仍是占位型低门槛：

- `coverage.include`
  - `src/components/**/*.ts`
  - `src/components/**/*.tsx`
  - `src/lib/**/*.ts`
- `coverage.thresholds`
  - `statements: 10`
  - `lines: 10`
  - `functions: 20`
  - `branches: 20`

结论：
- CI 已经“执行 coverage”，但还没有“执行 98% 的真实 coverage 门禁”。

## 3. 2026-03-12 实测发现

本轮执行 `cd frontend && npm run test:coverage` 后，先暴露的是稳定性问题，而不是覆盖率阈值问题：

- `src/components/tools/ClaudeCostCalculator.test.tsx`
  - 5 个用例耗时约 `53.6s`
- `src/app/customs-declarations/page.test.tsx`
  - 4 个用例耗时约 `83.2s`
  - 其中 `修改关键词后重新查询并可跳转详情页` 在 coverage 模式下触发 `20000ms` 超时

结论：
- 当前若直接将 threshold 改到 `98`，CI 首先会因为 coverage 下的慢测超时红灯，而不是因为真实低覆盖文件红灯。
- 因此必须把“coverage 稳定执行”视为 98% 门禁切换前置条件。

## 4. 最终目标门禁

### 4.1 统计口径

最终建议纳入：

- `src/app/**/*.ts`
- `src/app/**/*.tsx`
- `src/components/**/*.ts`
- `src/components/**/*.tsx`
- `src/lib/**/*.ts`
- `src/lib/**/*.tsx`
- `src/services/**/*.ts`

建议排除：

- `src/**/*.test.ts`
- `src/**/*.test.tsx`
- `src/test/**`
- `src/**/*.d.ts`
- 明确属于测试支撑、框架生成物、纯类型出口的文件

### 4.2 门禁阈值

最终目标：

- `statements >= 98`
- `lines >= 98`
- `functions >= 98`
- `branches >= 98`

### 4.3 CI 行为

最终 CI 行为应为：

1. `npm run test`
2. `npm run test:coverage`
3. coverage 低于 98% 直接阻断 `frontend-e2e`
4. 失败时上传 coverage 报告工件，便于定位缺口文件

## 5. 分阶段切换方案

### Phase A：先恢复 coverage 绿灯

目标：
- 让 `npm run test:coverage` 在当前 CI 等价环境下稳定执行完成。

动作：
- 优先处理 coverage 下的超时/慢测，不直接把所有问题解释成“覆盖率不够”。
- 对大而慢的页面交互测试拆分动作链，减少单条用例同时承担查询、跳转、提示、刷新等多个职责。
- 对 AI、上传、复杂页面交互场景补更轻量的 mock，降低 coverage 插桩放大的耗时。

通过标准：
- `cd frontend && npm run test:coverage` 能稳定跑完。

### Phase B：扩大真实统计口径

目标：
- 把 coverage 从局部目录统计，扩到前端关键运行时代码。

动作：
- 更新 `frontend/vitest.config.ts` 的 `coverage.include`
- 补齐 `coverage.exclude`
- 增加 `json-summary` reporter，便于 CI 输出 summary 和失败定位

通过标准：
- coverage 报告能真实反映 `app/components/lib/services` 的缺口。

### Phase C：补齐缺口到 98%

目标：
- 将四项指标全部推进到 `>=98%`

优先级：
1. `src/services`
2. `src/lib`
3. `src/app`
4. `src/components`

动作：
- 优先补 service 错误路径、空数据路径、边界参数路径
- 补页面 wrapper 的查询参数、跳转、空态、错误态和权限分支
- 对难测逻辑仅做最小可测性重构，不做无关整理

通过标准：
- 四项 coverage 全部 `>=98%`

### Phase D：切换硬门禁

目标：
- 让 98% 成为正式阻断规则，而不是人工约定。

动作：
- 在 `frontend/vitest.config.ts` 中将四项 threshold 调整为 `98`
- 在 CI 里保留 `test -> coverage` 顺序，不把 coverage 与普通单测混成一个失败原因
- 上传 `frontend/coverage/` 工件

通过标准：
- 任何 PR/Push 只要低于 98% 就直接红灯
- 失败时能在工件或 summary 中快速定位低覆盖文件

## 6. 需要落地的文件

- `frontend/vitest.config.ts`
  - 扩统计口径
  - 增加 exclude
  - 增加 `json-summary`
  - 最终设置四项 threshold 为 `98`
- `.github/workflows/test-and-acceptance.yml`
  - 保留 `test -> coverage` 顺序
  - coverage 失败时上传工件
- `frontend/package.json`
  - 如需要，可增加 `test:coverage:ci` 区分本地与 CI 参数
- `docs/coverage-98-frontend-report.md`
  - 持续记录每轮 coverage 缺口、修复批次和达标证据
- `METRICS.md`
  - 记录 coverage 基线、CI 时长、达标轮次

## 7. 风险与回退

| 风险 | 说明 | 应对 | 回退 |
|---|---|---|---|
| coverage 下慢测持续超时 | 门禁先死在稳定性，不是真实缺口 | 优先拆测试、补 mock、缩小单条用例职责 | 暂不启用 98% threshold，只保留真实口径扩围 |
| 扩口径后数字断崖下降 | `app/services` 纳入后短期会很低 | 接受真实缺口，按目录批次补测 | 先扩口径、后提阈值，不一步切硬门禁 |
| CI 时长显著上升 | coverage 插桩放大高交互测试成本 | 把重交互场景拆细，避免把慢集成行为全堆给 Vitest | 暂缓 98% 切换，先做稳定性治理 |
| 通过排除文件硬凑 98 | 损害门禁可信度 | 排除项必须有明确理由，默认不新增豁免 | 回退新增豁免项，恢复真实口径 |

## 8. 建议结论

最合理的切换顺序不是“今天直接把阈值改成 98”，而是：

1. 先修 coverage 红灯稳定性
2. 再扩真实统计口径
3. 然后补齐缺口
4. 最后切 98% 硬门禁

在这个顺序下，`98%` 仍然是最终阻断标准，但不会被当前慢测和超时问题掩盖。
