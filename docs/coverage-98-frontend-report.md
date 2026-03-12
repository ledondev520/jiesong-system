# 前端覆盖率 98% 推进报告

## 第一阶段结果

- 日期：2026-03-12
- 阶段目标：先建立真实基线，确认当前红灯和统计口径缺口，再进入修复与扩围。
- 当前结论：第一阶段已完成；本阶段不宣称已提升到 98%，只提交可执行的基线与阻塞清单。

## 基线快照

### 现有 coverage 门禁

`frontend/vitest.config.ts` 当前仍是旧口径：

- `coverage.include`
  - `src/components/**/*.ts`
  - `src/components/**/*.tsx`
  - `src/lib/**/*.ts`
- `coverage.thresholds`
  - `statements: 10`
  - `lines: 10`
  - `functions: 20`
  - `branches: 20`

这意味着当前门禁还没有覆盖 `src/app` 与 `src/services`，也没有真正约束到 98%。

### 统计口径缺口

按源码文件数统计：

| 口径 | 文件数 |
| --- | ---: |
| 当前配置实际覆盖口径（`components + lib.ts`） | 79 |
| 98% 目标口径（`app + components + lib + services`） | 243 |
| 待扩围增量 | 164 |

结论：覆盖率推进的第一步不是“补几个测试”，而是先把红灯清掉，再把 coverage 口径从 79 个文件扩到 243 个文件。

## 已确认的阻塞

### 1. 全量单测当前为红灯

已执行：

```bash
cd frontend && npm run test
```

在 fresh run 中已观察到以下失败类型：

- `src/app/(auth)/login/page.test.tsx`
  - 断言仍按旧行为编写，和当前页面实现不一致。
  - 现状已经改为“只记住用户名”，但测试仍期待 `jiesong_saved_credentials` 和“快捷登录（用户名）”一类旧行为。
  - `密码` 字段当前包在带显隐切换按钮的容器里，测试用 `getByLabelText('密码')` 直接找输入框会失败。
  - 复选框文案现为“记住用户名”，测试仍在找“记住账号和密码”。

- `src/app/customs-declarations/page.test.tsx`
  - 在全量运行下出现超时。

- `src/app/customs-declarations/create/page.test.tsx`
  - 两个用例都在全量 coverage 压力下超时。

- `src/app/dashboard/inventory-container/page.test.tsx`
  - 状态流转和批量更新用例超时。

- `src/app/dashboard/sales/[id]/page.test.tsx`
  - 明细页关键交互用例超时。

结论：当前不适合直接把 coverage 阈值拉到 98；先修红灯，否则后续 coverage 结果会被测试稳定性问题污染。

### 2. 旧基线只能说明“旧口径下的历史水平”

`frontend/METRICS.md` 最近一次完整绿灯记录是 2026-03-08 Round 6：

- `npm run test`: 101 files / 313 tests 通过
- `npm run test:coverage`: 73.28% statements / 80.2% branches / 67.45% functions / 73.28% lines

这组数字只对应旧 coverage 口径，不能当成 98% 目标的真实剩余差距。

### 3. 本轮 `npm run test:coverage` 已启动，但第一阶段不以未收敛的最终百分比作为结论

已执行：

```bash
cd frontend && npm run test:coverage
```

这轮运行在旧口径下启动，并在全量 red suite 上持续暴露超时问题。第一阶段报告仅把它作为“红灯与压力验证”的证据，不把尚未收敛的新 summary 当作里程碑结果。

## 第一阶段产出

- 已锁定当前 coverage 配置和目标口径差值。
- 已确认两类核心阻塞：
  - 认证页测试与当前安全实现不一致。
  - 多个页面级交互测试在 full-suite / coverage 压力下超时。
- 已同步更新前端侧 `PLAN.md`、`TASKS.md`、`METRICS.md`、`RISKS.md`。

## 下一阶段执行顺序

1. 先修 `login` 相关测试，使其和当前安全行为对齐。
2. 再逐个稳定 `customs-declarations`、`inventory-container`、`sales/[id]` 的超时测试。
3. 确认 `npm run test` 全绿后，再扩大 `coverage.include` 到 `src/app`、`src/services`。
4. 最后补低覆盖文件并把四项阈值抬到 `>=98%`。
