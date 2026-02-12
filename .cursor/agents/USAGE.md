若本文件夹结构或内容变化，请更新本文件。

## 目的/边界/职责
- 目的：提供项目级子代理的调用模板（含架构总控、前端、后端协同）。
- 边界：仅包含调用方式与执行建议，不包含业务实现代码。
- 职责：帮助团队快速触发“架构治理 + 前后端执行 + 工作台专项”流程。

## 文件清单
| 名字 | 地位 | 功能 |
|---|---|---|
| `USAGE.md` | 使用手册 | 给出多角色子代理的推荐调用指令与执行顺序。 |
| `frontend-polish-engineer.md` | 核心子代理 | 全系统视觉统一与高端美化执行。 |
| `dashboard-visual-director.md` | 专项子代理 | 工作台视觉吸引力与信息架构强化。 |
| `frontend-polish-orchestrator.md` | 总控子代理 | 分阶段推进、风险控制、验收汇总。 |
| `system-architect-orchestrator.md` | 架构总控子代理 | 负责全系统架构建模、任务编排与跨角色协同。 |
| `backend-system-engineer.md` | 后端执行子代理 | 负责 API/数据模型/服务稳定性工程落地。 |
| `api-contract-coordinator.md` | 契约协同子代理 | 负责前后端接口契约、版本兼容与联调节奏。 |
| `quality-verification-guardian.md` | 质量守门子代理 | 负责验收门禁、回归验证与发布建议。 |
| `database-migration-architect.md` | 数据库演进子代理 | 负责 Prisma schema 演进、迁移策略与回滚治理。 |

## 推荐调用顺序
1. 先调用 `system-architect-orchestrator`：定义目标、边界、依赖、里程碑。
2. 再调用 `frontend-polish-orchestrator`：拆解前端阶段任务与验收清单。
3. 并行调用 `backend-system-engineer`：对齐接口契约、数据模型与服务改造。
4. 调用 `frontend-polish-engineer` + `dashboard-visual-director`：落地全局页面与工作台专项。
5. 最后由 `system-architect-orchestrator` 汇总验收、处理风险与下一轮规划。
6. 发布前调用 `quality-verification-guardian` 执行最终质量门禁。
7. 若涉及数据结构变更，必须插入 `database-migration-architect` 进行迁移与回滚设计评审。

## 可直接复制的调用指令
```text
Use the frontend-polish-orchestrator subagent to create a full beautification execution plan for this repo frontend, split by phases, with validation commands and risk rollback points.
```

```text
Use the system-architect-orchestrator subagent to design an end-to-end architecture execution plan for this repo, then delegate parallel workstreams to frontend and backend agents with milestones and validation gates.
```

```text
Use the backend-system-engineer subagent to align with the architecture plan and implement backend API/data-model improvements with clear contracts, tests, and rollback notes.
```

```text
Use the api-contract-coordinator subagent to define and maintain API contracts across frontend and backend, including compatibility strategy, examples, and integration status tracking.
```

```text
Use the database-migration-architect subagent to design a safe schema migration plan with stepwise rollout, verification checks, and rollback procedures.
```

```text
Use the frontend-polish-engineer subagent to implement a high-end, cohesive UI polish across auth pages, dashboard shell, and core business pages in this project.
```

```text
Use the dashboard-visual-director subagent to redesign the dashboard into an attractive executive cockpit with clear KPI hierarchy and polished interactions.
```

```text
Use the quality-verification-guardian subagent to run release-gate verification on the latest changes and report pass/fail evidence, regression risks, and release recommendation.
```

## 标准执行剧本（端到端）
1. 架构启动：
- 由 `system-architect-orchestrator` 输出目标、边界、依赖、里程碑。

2. 方案拆解：
- 前端由 `frontend-polish-orchestrator` 拆阶段；
- 后端由 `backend-system-engineer` 输出接口与服务方案；
- 联调由 `api-contract-coordinator` 固化契约。

3. 数据变更（如有）：
- `database-migration-architect` 产出迁移/回滚方案并完成风险评审。

4. 实施与联调：
- `frontend-polish-engineer`、`dashboard-visual-director` 与后端并行落地。

5. 验收发布：
- `quality-verification-guardian` 执行门禁，输出发布建议；
- `system-architect-orchestrator` 汇总结果并规划下一轮。

## 验收建议
- 每阶段完成后运行对应 `lint/test/build`。
- 输出页面覆盖清单（`DONE / FOLLOW-UP`）。
- 若出现回归，优先回滚该阶段增量并记录风险项。
- 架构总控需额外输出“跨 agent 调度清单 + 阻塞解除策略”。
- 契约与质量角色需补充“可复现实例 + 证据链”。
