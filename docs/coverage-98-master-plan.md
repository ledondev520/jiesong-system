# Frontend Coverage 98 Master Plan

## 1. 目标与边界

- 目标：将 `frontend` 的 Vitest 覆盖率从“局部统计 + 低阈值”推进到“关键前端代码纳入统计且四项指标全部 `>=98%`”。
- 目标口径：`Statements`、`Branches`、`Functions`、`Lines` 四项都必须达标。
- 验收命令：
  - `cd frontend && npm run test`
  - `cd frontend && npm run test:coverage`
- 最终交付：
  - 覆盖率门禁配置生效
  - 全量测试稳定通过
  - 专项结果文档与仓库台账完成更新

## 2. 当前基线

### 已确认现状

- 当前覆盖率配置仅统计：
  - `src/components/**/*.ts(x)`
  - `src/lib/**/*.ts`
- 当前阈值仍是占位值：
  - `statements: 10`
  - `lines: 10`
  - `functions: 20`
  - `branches: 20`
- 已记录的最近一次全量 coverage 基线（2026-03-08）：
  - `73.28%` statements
  - `80.2%` branches
  - `67.45%` functions
  - `73.28%` lines
- `TASKS.md` 已存在进行中的主任务：`FE-COV-98`

### 关键判断

- 目前离 98% 的差距不只是“补几个测试”，而是“统计口径扩围 + 红灯治理 + 长尾分支补齐”的组合任务。
- 真正的难点大概率不在 `components`，而在 `src/app` 页面包装层、`src/services` 错误路径，以及低可测分支。

## 3. 分阶段推进计划

### Phase 0：冻结真实基线

目标：先拿到当前真实缺口，避免在错误假设上补测。

工作项：
- 运行全量 `npm run test`
- 运行当前口径 `npm run test:coverage`
- 记录失败测试、慢测、低覆盖文件和目录分布
- 输出首版缺口清单：哪些是“红灯问题”，哪些是“统计口径问题”

完成定义：
- 有一份可排序的缺口表，而不是只有总覆盖率数字
- 明确本轮 98% 目标涉及的目录范围

### Phase 1：先恢复稳定绿灯

目标：把既有失败测试和不稳定测试先收敛到可持续回归状态。

工作项：
- 逐个定位失败测试根因：断言过期、mock 漏配、异步等待不足、真实逻辑回归
- 对慢测做最小稳定性修复，避免 coverage 插桩下再次假红
- 固化“先定向复现，再最小修复，再回归”的处理节奏

完成定义：
- `cd frontend && npm run test` 全绿
- 红灯原因已清空或被转成明确阻塞项

### Phase 2：扩大全量 coverage 统计口径

目标：让 98% 约束覆盖真正重要的前端代码，而不是只约束局部目录。

建议纳入口径：
- `src/app/**/*.ts`
- `src/app/**/*.tsx`
- `src/components/**/*.ts`
- `src/components/**/*.tsx`
- `src/lib/**/*.ts`
- `src/lib/**/*.tsx`
- `src/services/**/*.ts`

工作项：
- 更新 `frontend/vitest.config.ts` 的 `coverage.include`
- 将 threshold 最终收紧到四项 `98`
- 跑一次扩围后的 coverage，拿到新的真实缺口榜单

完成定义：
- coverage 报告能反映 `app/services/components/lib` 的真实质量
- 新口径下的低覆盖热点已被识别并排优先级

### Phase 3：优先清理高性价比覆盖缺口

目标：先解决最容易拉升覆盖率、同时对质量最有价值的部分。

优先级顺序：
1. `src/services`
2. `src/lib`
3. `src/app` 页面包装层
4. `src/components` 分支路径

工作项：
- 为 service 层补成功 / 失败 / 空数据 / 边界参数路径
- 为 lib 层补纯函数与分支测试
- 为页面 wrapper 补渲染、跳转、空态、权限和错误态
- 每完成一批就回跑 coverage，避免堆积后难以定位收益

完成定义：
- 覆盖率从“70 段位”进入“90+ 段位”
- 低覆盖清单收缩到少量长尾文件

### Phase 4：攻坚 branches / functions 长尾

目标：补齐最难抬升的分支覆盖与函数覆盖，冲刺 98%。

典型对象：
- 错误处理分支
- 提前 return 的保护逻辑
- loading / empty / denied / fallback 分支
- 条件渲染较多的组件
- 间接依赖浏览器环境或 router 的页面逻辑

工作项：
- 优先用测试覆盖行为，不靠删除逻辑换指标
- 对确实难测的文件做最小可测性重构：
  - 提炼纯函数
  - 收紧副作用边界
  - 拆出可独立断言的小组件/小 helper

完成定义：
- 四项指标逼近并达到 `>=98%`
- 不存在“靠排除文件”硬凑出的门禁

### Phase 5：锁门禁并完成交付

目标：把 98% 从一次性冲刺变成可持续门禁。

工作项：
- 再次执行：
  - `cd frontend && npm run test`
  - `cd frontend && npm run test:coverage`
- 更新专项结果文档、`PLAN.md`、`TASKS.md`、`RISKS.md`、`METRICS.md`
- 记录：
  - 统计口径变化
  - 各阶段覆盖率提升
  - 剩余维护注意事项

完成定义：
- 全量测试与 coverage 双绿
- 文档、台账、结果归档齐全

## 4. 推荐执行顺序

1. 先清红灯，再扩口径。
2. 扩口径后先打 `services/lib`，再打 `app/components`。
3. 每批只处理一组低覆盖热点，做完立即回归。
4. 最后才把 `threshold` 锁死到 `98` 并作为硬门禁验收。

## 5. 风险与应对

| 风险 | 说明 | 应对 |
|---|---|---|
| 统计口径扩围后覆盖率断崖式下降 | `src/app` 与 `src/services` 进入统计后，短期数字会更差 | 先接受真实数据，不在扩围前追求“好看数字” |
| 高交互页面在 coverage 下变慢 | 历史已有 timeout 假红灯案例 | 保持 `testTimeout: 20000`，先处理慢测再冲门禁 |
| 为冲 98% 出现过度重构 | 指标驱动容易把任务做偏 | 只允许最小可测性重构，不做无关整理 |
| 通过排除文件硬凑指标 | 会损害门禁可信度 | 排除项必须有明确理由，默认不新增豁免 |

## 6. 里程碑定义

| 里程碑 | 标志 |
|---|---|
| M1 | 当前 `test` / `coverage` 基线与缺口清单完成 |
| M2 | 既有失败测试全部修复，前端全量单测恢复稳定 |
| M3 | `coverage.include` 扩到 `app/services/components/lib` |
| M4 | 覆盖率进入 `90%+`，仅剩长尾低覆盖文件 |
| M5 | 四项覆盖率全部 `>=98%` |
| M6 | 结果报告、风险、指标、任务台账全部收口 |

## 7. 本文档用途

- 本文档用于“阶段推进、排期沟通、断点续跑”。
- 具体实现步骤参考已有执行型计划：`docs/plans/2026-03-12-frontend-coverage-98.md`。
