# 项目文档目录

> 若本文件夹结构或内容变化，请更新本文件。

## 目的/边界/职责
- 目的：集中维护进销存系统需求、方案、验收与执行类文档。
- 边界：仅存放项目文档与索引，不承载业务实现代码。
- 职责：提供可追溯文档入口，并在文件增删时同步更新清单。

## 文件清单

| 文件名 | 地位 | 功能 |
|--------|------|------|
| 需求总结_v2.0.md | 核心文档 | 完整的需求规格说明，作为PRD和技术方案的输入 |
| PRD.md | 核心文档 | 产品需求文档，包含功能清单、用户故事、业务流程 |
| 技术方案.md | 核心文档 | 技术架构设计、目录结构、API设计、AI集成方案 |
| 数据库设计.md | 核心文档 | 数据库Schema设计、Prisma模型、实体关系图 |
| 数据导入与清洗方案.md | 核心文档 | CSV历史数据导入方案、清洗规则、异常处理 |
| 测试样例.md | 开发基线 | 测试先行样例与用例清单 |
| 模拟数据汇总.md | 追踪清单 | 标记并汇总模拟数据位置 |
| 前端统一重构验收清单.md | 验收台账 | 记录前端 shadcn/ui 统一重构的验收项与复核命令 |
| 2026-03-28-ceo-roadmap-upgrade.md | 路线图 | CEO 视角的产品升级路线、30/90 天目标、取舍边界与检查点 |
| plans/2026-03-29-agent-cli-mcp-ready-design.md | 架构设计 | 定义 Agent 独立账号、命令层、CLI 协议与 MCP-ready 演进路径 |
| plans/2026-04-04-universal-agent-runtime-v2-design.md | 架构设计 | 将 Agent 下一阶段收口为“一个对外通用主 Agent + 内部路由/工具域”的统一智能体方案 |
| coverage-98-master-plan.md | 专项总纲 | 定义前端覆盖率提升到 98% 的分阶段路径、门禁与里程碑 |
| coverage-98-ci-plan.md | CI 方案 | 定义 Coverage `>=98%` 的 CI 门禁切换顺序、前置条件、风险与回退 |
| 系统架构落地执行方案.md | 执行总纲 | 定义多 Agent 协同的系统架构落地路径、WU清单与门禁 |
| 可执行里程碑计划.md | 调度清单 | 未来2周按批次可执行的6个里程碑、角色、验证与回滚 |
| api-contracts/README.md | 子目录索引 | 维护 API 契约子目录导航与职责说明 |
| api-contracts/采购链路契约.md | 领域契约 | 定义采购链路请求/响应/错误码与示例 |
| api-contracts/采购链路联调面板.md | 联调台账 | 跟踪采购链路 READY/BLOCKED/DONE 与阻塞解除 |
| api-contracts/销售链路契约.md | 领域契约 | 定义销售链路请求/响应与装箱接口契约 |
| api-contracts/销售链路联调面板.md | 联调台账 | 跟踪销售链路 READY/BLOCKED/DONE 与阻塞解除 |
| api-contracts/库存链路契约.md | 领域契约 | 定义库存查询、状态机与批量状态更新接口契约 |
| api-contracts/库存链路联调面板.md | 联调台账 | 跟踪库存链路 READY/BLOCKED/DONE 与阻塞解除 |
| quality/README.md | 子目录索引 | 维护质量门禁与发布结论文档导航 |
| wps-import/README.md | 子目录索引 | WPS 增量导入源文件归档（按月），供幂等导入脚本在本地/VPS 使用 |
| quality/发布结论_M5_20260212.md | 发布报告 | 记录 M5 门禁证据、风险评估与 Go/No-Go 结论 |
| 周节奏指标看板.md | 指标看板 | 追踪每周质量/效率/回归率并给出迭代建议 |

## 文档状态
- ✅ 需求总结 - 已完成
- ✅ PRD文档 - 已完成（待审核）
- ✅ 技术方案 - 已完成（待审核）
- ✅ 数据库设计 - 已完成（待审核）
- ✅ 数据导入与清洗方案 - 已完成（待审核）
- ✅ 测试样例 - 已完成（待审核）
- ✅ 模拟数据汇总 - 已完成（待审核）
- ✅ 前端统一重构验收清单 - 已完成
- ✅ CEO 路线图升级计划 - 已完成
- ✅ Agent CLI + MCP-ready 架构设计 - 已完成
- ✅ Frontend Coverage 98 Master Plan - 已完成
- ✅ Frontend Coverage 98 CI Gate Plan - 已完成
- ✅ 系统架构落地执行方案 - 已完成
- ✅ 可执行里程碑计划（V1） - 已完成
- ✅ 采购链路 API 契约与联调面板 - 已完成（M2）
- ✅ 库存链路 API 契约与联调面板 - 已完成（M7）
- ✅ 发布结论（M5）- 已完成（Go）
- ✅ 周节奏指标看板（V1）- 已完成
- ✅ Agent Runtime 主链实现 - 已落地代码，当前主要缺口转为文档校正与收口
- ✅ Universal Agent Runtime V2 方案 - 已完成设计稿，待进入实施拆解

## 下一步
- 用户审核确认文档
- Agent 相关文档改为以“实现状态校正”为主：收口 runtime/CLI/MCP 已落地事实、补当前剩余缺口与风险说明
- 继续收口 Agent 实现与设计文档漂移，重点核对 grant 模型、默认权限口径与深度集成验证
- 以 `plans/2026-04-04-universal-agent-runtime-v2-design.md` 为下一阶段 Agent 主线：统一到一个对外通用主 Agent，并扩工具面与内部路由
- 先按 `2026-03-28-ceo-roadmap-upgrade.md` 推进路线图整理与 shell/workspace 升级，再把 `FE-COV-98` 作为护栏继续收口
- 先按 `coverage-98-ci-plan.md` 处理 coverage 稳定性与门禁切换，再按 `coverage-98-master-plan.md` 执行 FE-COV-98 的 M1-M6
