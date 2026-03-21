# 捷淞系统三维评审汇总报告（CEO / Eng / Design）- 2026-03-20

## 审查范围与方法
- 仓库：`/Users/helena/Cursor/jiesong_system`
- 方法：基于仓库静态代码 + 文档 + 最近提交记录
- 审查技能：
  - `plan-ceo-review`
  - `plan-eng-review`
  - `plan-design-review`

---

## 一句话结论
当前系统已具备可用业务骨架，但存在 **配置中心泛化、权限边界偏宽、模块复杂度过高、体验一致性不足** 四类结构性问题。建议按 **P0（先保命）→ P1（提效率）→ P2（提体验）** 三阶段推进。

---

## Top 10 修改建议（汇总优先级）

| # | 建议 | 来源 | 优先级 | 预估工作量 | 改造目标 |
|---|---|---|---|---:|---|
| 1 | 清理默认弱口令与种子策略 | CEO + Eng | P0 | 1.5 人天 | 消除高风险安全口子 |
| 2 | 重构 SystemConfig（从万能 KV 到分域配置） | CEO + Eng | P0 | 4 人天 | 防止配置腐化，提升可维护性 |
| 3 | 收紧系统路由权限边界（导入/导出/日志） | CEO + Eng | P0 | 2.5 人天 | 降低误操作与越权风险 |
| 4 | 拆分超大页面（经营执行中台） | Eng + Design | P1 | 3 人天 | 降低复杂度，提升迭代速度 |
| 5 | 统一前端服务层与缓存策略 | Eng | P1 | 3 人天 | 降低请求层重复与隐性 bug |
| 6 | 财务首页重做为“经营驾驶舱” | CEO + Design | P1 | 2 人天 | 提升管理层决策效率 |
| 7 | 设置页信息架构瘦身（由大面板改任务流） | Design | P1 | 2 人天 | 降低学习成本与误操作 |
| 8 | AI 助手悬浮层冲突治理（z-index 与可见策略） | Design + Eng | P1 | 1.5 人天 | 避免遮挡关键操作路径 |
| 9 | 导入/导出链路可观测性与审计增强 | CEO + Eng | P1 | 3 人天 | 可追责、可回放、可复盘 |
|10| 建立覆盖率门禁与分层测试计划 | CEO + Eng | P2 | 4 人天 | 让迭代变稳，减少回归事故 |

---

## 关键证据（代码路径）
- `backend/prisma/seed.js`
- `backend/src/routes/system.js`
- `backend/src/controllers/systemController.js`
- `backend/src/controllers/system/configController.js`
- `backend/src/utils/secretCrypto.js`
- `frontend/src/app/dashboard/ops-execution/page.tsx`
- `frontend/src/lib/axios.ts`
- `frontend/src/services/config.service.ts`
- `frontend/src/services/system.service.ts`
- `frontend/src/app/dashboard/finance/page.tsx`
- `frontend/src/app/dashboard/settings/components/SettingsPageContent.tsx`
- `frontend/src/components/ai/AIAssistant.tsx`
- `backend/src/controllers/dataImportController.js`
- `TASKS.md`

---

## 30 / 60 / 90 天路线图

### 0~30 天（止血期）
- 完成建议 1/2/3（安全、配置、权限）
- 输出权限矩阵与配置模型文档
- 建立导入/导出任务追踪最小闭环

### 31~60 天（提效期）
- 完成建议 4/5/9（页面拆分、服务层统一、可观测性）
- 财务首页第一版驾驶舱上线
- 设置页 IA 重构灰度发布

### 61~90 天（提质期）
- 完成建议 6/7/8/10
- 完成体验优化与测试门禁固化
- 建立月度“技术债与体验债”例行审查

---

## 原始审查输出（本地留档）
- `/tmp/ceo_review.txt`
- `/tmp/eng_review.txt`
- `/tmp/design_review.txt`

## 飞书文档版本
- https://www.feishu.cn/docx/KHQsdy6bzo2Wfexki6Hcyf9rnoh
