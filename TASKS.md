# Frontend Polish Tasks

## 任务清单
| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
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
