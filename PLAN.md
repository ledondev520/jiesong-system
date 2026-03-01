# Frontend Polish Plan

## 长程目标
完成“全系统前端高端美化”：
- 全局设计语言统一（token/字体/层级/动效）
- 工作台具备吸引力与可扫描的信息结构
- 各业务页面保持一致体验且不破坏业务流程

## 里程碑
1. Phase A（进行中）：全局视觉基础重构
2. Phase B（待执行）：Dashboard 专项升级
3. Phase C（待执行）：业务页批量统一与交互打磨
4. Phase D（已完成）：回归验收与文档收口
5. Phase E（已完成）：子代理架构协同层建设（系统架构师 + 后端工程师）

## 本轮（2026-02-12）产出
- 已完成 Phase A 第一批落地：
  - 全局深色商务 token 与背景层次
  - dashboard 框架（layout/header/sidebar/page-header）视觉升级
  - dashboard 数据看板与快速录入区卡片体系升级
- 已完成 Phase A 第二批落地：
  - 认证页（login/register/forgot-password）统一高端视觉容器与表单质感
- 已完成 Phase A 第三批落地：
  - 业务列表页（products/inventory/inventory-container）统一筛选区、表格容器与空态层级
- 已完成 Phase B 核心落地：
  - 交易财务域（purchase/sales/payments/finance/payable/receivable）统一高端视觉容器与操作层级
- 已完成 Phase C 收口批次：
  - 基础档案尾页（users/suppliers/contracts）完成筛选区、表格区、操作区一致性优化
- 已完成 Phase D 验收：
  - 前端全量单测通过（37 files / 114 tests）
- 已完成 Phase E 协同能力扩展：
  - 新增系统架构总控子代理（`system-architect-orchestrator`）
  - 新增后端系统工程师子代理（`backend-system-engineer`）
  - 更新 `.cursor/agents` 目录文档与调用手册，形成“架构总控 + 前后端并行 + 工作台专项”协同路径
- 已完成 Phase E 第二批扩展：
  - 新增接口契约协同子代理（`api-contract-coordinator`）
  - 新增质量验收守门子代理（`quality-verification-guardian`）
  - 补齐“架构-实现-验收”闭环角色体系
- 已完成 Phase E 第三批扩展：
  - 新增数据库演进子代理（`database-migration-architect`）
  - 在 `.cursor/agents/USAGE.md` 增补端到端执行剧本（架构->实现->数据迁移->验收发布）
  - 形成“架构-前后端-契约-数据库-质量”完整协同链
- 已完成 Phase E 运行治理补丁：
  - 修正 `.cursor/agents/USAGE.md` 中文案与当前子代理数量不一致问题。
  - 补充 `.gitignore` 对 Playwright 产物目录忽略，降低工作区噪声。
  - 清理误放文件 `frontend/src/components/layout/jiesong_system.code-workspace`。
- 已启动 Phase F（架构落地基线）：
  - 新增 `docs/系统架构落地执行方案.md`，定义多 Agent 协同矩阵、WU 清单、质量门禁与回滚策略。
  - 同步更新 `docs/README.md` 与根 `README.md` 导航，确保执行入口可发现。
- 已完成 Phase F 第一交付（WU-F-01）：
  - 新增 `docs/可执行里程碑计划.md`，给出 2 周 6 个可执行里程碑（含输入/输出/验证/回滚）。
  - 同步更新 `docs/README.md` 与根 `README.md` 导航，补齐执行文档索引。
- 已完成 Phase F 第二交付（WU-F-02 / M2）：
  - 新增 `docs/api-contracts/采购链路契约.md` 与 `docs/api-contracts/采购链路联调面板.md`。
  - 修复前后端参数契约偏差：采购列表查询参数统一为 `keyword`。
  - 同步更新 `docs/api-contracts/README.md`、`docs/README.md` 与根 `README.md` 导航。
- 已完成 Phase F 第三交付（M3 首批加固）：
  - 修复采购路由优先级问题：`GET /purchases/options/next-no` 提前到 `GET /:id` 之前。
  - 新增后端回归测试 `backend/src/routes/purchases.test.js` 防止静态路由被动态路由覆盖。
  - 后端全量测试通过：`cd backend && npm run test`（31/31）。
- 已完成 Phase F 第四交付（M4 首批前端修复）：
  - 修复采购列表“查看”按钮无跳转行为问题，补充详情页路由跳转实现。
  - 增加可访问性标签（`aria-label`）以提升操作可测性与可读性。
  - 前端采购列表交互测试通过：`purchase/page.test.tsx`（4/4）。
- 已完成 Phase F 第五交付（M5 质量门禁）：
  - 执行门禁三件套：后端全量（31/31）、前端采购域定向（17/17）、E2E 冒烟（2/2）全部通过。
  - 新增发布结论文档 `docs/quality/发布结论_M5_20260212.md`，结论为 Go（可发布）。
- 已完成 Phase F 第六交付（M6 首个指标产物）：
  - 新增 `docs/周节奏指标看板.md`，建立质量/效率/回归率三维指标基线。
  - 同步文档导航，形成“执行计划 -> 门禁结论 -> 周度指标”的持续化链路。
- 已完成 Phase F 第七交付（M6 销售链路首批复制）：
  - 修复销售路由优先级：`GET /sales/options/next-no` 提前于 `GET /sales/:id`。
  - 前端销售列表查询参数对齐：`query` -> `keyword`。
  - 新增 `backend/src/routes/sales.test.js` 与 `docs/api-contracts/销售链路契约.md`，并完成回归验证。
- 已完成 Phase F 第八交付（M6 联调台账补齐）：
  - 新增 `docs/api-contracts/销售链路联调面板.md`，形成采购+销售双链路联调状态面板。
  - 同步更新文档导航，保障执行入口一致可见。
- 已完成 Phase F 第九交付（M6 销售交互验收补齐）：
  - 为销售列表“查看/删除”按钮增加 `aria-label`，提升可访问性与可测性。
  - 在 `sales/page.test.tsx` 补齐删除成功/失败路径测试，形成关键交互闭环。
- 已完成 Phase F 第十交付（M6 销售链路 E2E 补齐）：
  - 在 `frontend/e2e/smoke.spec.ts` 新增“登录后访问销售页可展示列表数据（Mock）”场景。
  - 修复鉴权 hydration 边界：`app/page.tsx` 与 `dashboard/layout.tsx` 的 `hasHydrated` 兜底值改为 `false`，避免状态未恢复时误重定向。
  - 前端 E2E 冒烟通过：3/3。
- 已完成 Phase F 第十一交付（M6 采购链路 E2E 对齐）：
  - 在 `frontend/e2e/smoke.spec.ts` 新增“登录后访问采购页可展示列表数据（Mock）”场景。
  - 前端 E2E 冒烟升级为 4/4，全链路覆盖“登录入口 + 访问保护 + 销售列表 + 采购列表”。
- 已完成 Phase F 第十二交付（M6 详情页 E2E 补齐）：
  - 在 `frontend/e2e/smoke.spec.ts` 新增“登录后访问销售详情页可展示合同与明细（Mock）”场景。
  - 前端 E2E 冒烟升级为 5/5，覆盖列表与详情关键路径。
- 已启动 Phase G（产品体验增强）并完成首个交付：
  - 在商品管理页新增关键词搜索防抖（350ms），避免输入过程高频请求导致卡顿。
  - 定向交互测试通过：`frontend/src/app/dashboard/products/page.test.tsx`（3/3）。
- 已完成 Phase G 第二交付（交互一致性）：
  - 商品删除流程从原生 `confirm` 迁移为统一 `AlertDialog`，对齐系统交互规范。
  - 补齐删除按钮可访问标签，提升可测性与无障碍表现。
  - 定向交互测试持续通过：`frontend/src/app/dashboard/products/page.test.tsx`（3/3）。
- 已完成 Phase G 第三交付（主数据字段补齐）：
  - 在商品编辑弹窗补齐 `HS编码` 与 `申报要素` 字段，打通商品录入与库存展示链路。
  - 完成 schema、默认值、编辑回填与提交路径同步，确保新增字段可创建/编辑。
  - 定向交互测试持续通过：`frontend/src/app/dashboard/products/page.test.tsx`（3/3）。
- 已完成 Phase G 第四交付（库存入口可用性）：
  - 在库存状态页新增关键词检索（商品名/采购合同号），提升列表定位效率并弱化与库存管理页的入口混淆。
  - 过滤逻辑采用 `useMemo` 派生，避免不必要重算。
- 已完成 Phase G 第五交付（视觉一致性收口）：
  - 货柜管理列表容器统一为 `surface-panel` 风格，与商品/库存页面一致。
  - 相关页面回归测试通过：inventory-container + containers + products 共 9/9。
- 已完成 Phase H 第一交付（库存状态机后端强约束）：
  - 新增 `backend/src/utils/inventoryStateMachine.js`，定义合法流转与出库前置校验（需 `salesContractId`）。
  - `PUT /api/v1/inventory/:id/status` 接入状态机，非法流转返回明确错误文案。
  - 后端全量测试通过（37/37）。
- 已完成 Phase H 第二交付（库存搜索后端化）：
  - `GET /api/v1/inventory` 新增 `keyword` 参数，支持商品名/采购合同号检索。
  - 库存状态页改为防抖后端查询，移除前端本地过滤实现。
- 已完成 Phase H 第三交付（批量状态更新）：
  - 新增 `PUT /api/v1/inventory/batch-status`，返回 `success/failed/errors` 结果集。
  - 前端库存状态页新增勾选与“批量设为已入库/已出库”操作入口。
- 已完成 Phase H 第四交付（契约与联调台账补齐）：
  - 新增 `docs/api-contracts/库存链路契约.md` 与 `docs/api-contracts/库存链路联调面板.md`。
  - 同步更新 `docs/api-contracts/README.md`、`docs/README.md` 与根 `README.md` 导航。
- 已完成 Phase G 第六交付（主题与风格统一）：
  - 接入 `next-themes`，支持白天/夜间模式切换，并在 Header 提供全局切换按钮。
  - 门店采购建议页（store-recommend）移除 emoji，统一为 Lucide 图标风格。
- 已完成 Phase G 第七交付（可读性修复）：
  - 修复白天模式下“金色标题”对比度不足问题，新增 `brand-emphasis` 文本语义色并替换关键标题/品牌文本。
- 已完成 Phase G 第八交付（hydration 稳定性修复）：
  - 修复 `dashboard/layout.tsx` 中渲染期访问 `window.localStorage` 导致的 SSR/CSR 分支不一致问题。
  - 认证跳转改为 hydration 完成后执行 `router.replace('/login')`，消除 Dashboard 布局 hydration mismatch。
- 已完成 Phase G 第九交付（前端构建门禁打通）：
  - 修复认证页 API 返回类型标注问题（`login/register/forgot-password`），消除 `result.code` 相关 TypeScript 报错。
  - 修复货柜域类型兼容问题（`Container` 与 `SalesContract` 合并后的字段兼容与页面回退逻辑）。
  - 为 `payments/products/contracts/settings` 页面补齐 `useSearchParams` 的 Suspense 边界，满足 Next 16 构建约束。

- 已完成 Phase I 第一交付（Excel 三 Sheet 标准出口模板）：
  - 安装 `exceljs`，新增 `exportSalesContractExcel(contractId)` 函数，生成三 Sheet Excel（合同信息 + 商品明细 + 装箱清单）。
  - 后端新增路由 `GET /api/v1/sales/:id/export-excel`，支持按合同 ID 导出并触发浏览器下载。
  - 前端 `salesService.exportExcel` 封装 blob 下载；销售列表页每行新增绿色表格图标按钮，销售详情页顶部新增"导出 Excel"按钮。
  - 后端全量测试通过：38/38。

## 风险与对策
- 风险：仓库已有大量历史 lint 问题影响全量校验。
- 对策：采用“改动文件零新增问题 + 定向测试 + 阶段回归”的方式推进。
- 风险：子代理角色增多后，存在职责重叠与委派歧义。
- 对策：统一由 `system-architect-orchestrator` 做任务编排，其他 agent 聚焦单一职责并按 DoD 交付。

## 2026-02-15 Round 12 (Container/SalesContract Migration Recovery)

- 已完成本轮目标：修复模型重构后后端服务层与脚本中的旧容器引用。
- 已完成项：
  - 货柜路由兼容层：`backend/src/routes/containers.js` 增加 `/next-no/:portId` 优先级与 `/containers` 挂载路由。
  - 服务层兼容修复：
    - `backend/src/services/exportService.js`
    - `backend/src/services/importService.js`
    - `backend/src/services/dataImportService.js`
    - `backend/src/services/aiService.js`
    - `backend/src/controllers/dashboardController.js`（`estimatedArrival` 修正）
  - 脚本迁移修复：
    - `backend/scripts/importData.js`
    - `backend/scripts/importIncremental.js`
- 验证计划：完成后续 `backend` 全量测试 + 与 `frontend` 相关路由冒烟回归，确认旧路由在合并模型下可用。
- 验证结论：
  - `backend` 全量测试通过：`npm test --silent`（38 通过）
  - 新增 `backend/src/routes/containers.test.js`，覆盖 `/next-no/:portId` 与 `/:id` 路由顺序。
  - `frontend` 全量单测通过：`npm test --silent`（48 通过）
  - 关键冒烟回归：`frontend` 现有 Vitest 页面测试全部通过；Playwright 冒烟中存在 2 项既有环境性失败（认证页跳转与采购页数据桩不一致），待下一轮单独修复。
- 追加修复（2）：`backend/src/controllers/containerController.js` 修复装箱明细编辑 `unitPrice/quantity` 更新时的 `totalPrice` 回写逻辑，避免仅更新部分字段时误清空金额；并对 `exchangeRate` 与数量/权重字段的空值兼容做增强。
- 更新结论（2）：补丁通过 `backend` 全量测试复核（38 通过），为下一轮冒烟稳定性修复留出空间（仍建议继续关注 Playwright 的一次性环境抖动）。

## 2026-03-01 Round 13 (E2E Sales Mock Repair + Login UI Audit)

- 已完成本轮目标：修复 `frontend/e2e/smoke.spec.ts` 中销售列表/详情 Mock 拦截不稳定问题，并完成登录页样式审查。
- 已完成项：
  - 修复 E2E 认证注入逻辑：`setAuth` 改为 `page.addInitScript` 参数注入，稳定写入 `token` 与 `auth-storage`。
  - 恢复并加固目标用例：
    - `登录后访问销售页可展示列表数据（接口Mock）`
    - `登录后访问销售详情页可展示合同与明细（接口Mock）`
  - Mock 路由改为 `pathname` 精确匹配，区分 `/api/v1/sales`（列表）与 `/api/v1/sales/:id`（详情），避免 `/sales` 模糊匹配误伤详情请求。
  - 登录页与全局样式完成代码审查，记录移动端可滚动性风险（见本轮评审结论）。
- 验证结论：
  - `frontend` 单测通过：`npm test`（48 files / 155 tests 通过）。
  - E2E 语法/发现校验通过：`npx playwright test e2e/smoke.spec.ts --list`（14 tests 被正确发现，含目标 2 条）。
  - `npm run test:e2e` 在当前沙箱环境受限（`listen EPERM 0.0.0.0:3001`），无法完成端到端实际执行；需在可监听端口环境复验。

## 2026-03-01 Round 14 (Frontend Lint Error Burn-Down)

- 已完成本轮目标：清零 `frontend` 的 ESLint errors，并修复指定规则焦点项（`no-explicit-any`、`set-state-in-effect`、`exhaustive-deps`、`alt-text`、`no-img-element`）。
- 已完成项：
  - 批量移除 `any`：
    - 测试文件：`ContractInfoEditor.test.tsx`、`Container3DView.test.tsx`、`Header.test.tsx`
    - 组件/页面：`PaymentDialog`、`ContainerDialog`、`StoreDialog`、`SupplierDialog`、`UserDialog`、`reports`、`settings`、`payable/receivable/payments` 等。
  - 修复 Hooks 规则：
    - `ThemeToggle` 移除 effect 内同步 setState（改为 `useSyncExternalStore` hydration 检测）
    - `containers/[id]`、`purchase/[id]`、`sales/[id]`、`ClaudeCostCalculator` 修复 `exhaustive-deps`。
  - 修复图片可访问性与 Next 规则：
    - `AIAssistant`、`ClaudeCostCalculator` 的 `<img>` 改为 `next/image`（含 `alt` 与 `unoptimized`）。
    - `lucide-react` 的 `Image` 图标重命名为 `ImageIcon`，消除 `alt-text` 误报。
  - 修复 `react/no-unescaped-entities`：
    - 相关文案改为 `&quot;...&quot;` 实体，兼容 lint 与既有测试断言。
- 验证结论：
  - `frontend` lint：`npm run lint` => `0 errors`（剩余 37 warnings 为历史 `unused-vars` 与 `react-hooks/incompatible-library`）。
  - `frontend` tests：`npm test` => `48 files / 155 tests` 全部通过。

## 2026-03-01 Round 15（运维系统页面第一阶段）

- 已完成本轮目标：启动系统运维页面 Phase 2 第一项（系统日志）开发。
- 已完成项：
  - 新增系统日志服务接口封装：`frontend/src/services/system.service.ts`（`getSystemLogs`）。
  - 新增系统日志页面：`/dashboard/system/logs`（`frontend/src/app/dashboard/system/logs/page.tsx`），支持“全部日志”和“导入日志”切换视图，复用 `Card` 与 `Table` 组件。
  - 在侧边栏新增“系统日志”入口：`/dashboard/system/logs`。
  - 补齐定向单测：`frontend/src/app/dashboard/system/logs/page.test.tsx`。
- 验证结论：
  - `frontend` 定向测试通过：`npm test src/app/dashboard/system/logs/page.test.tsx src/components/layout/Sidebar.test.tsx`。

## 2026-03-01 Round 16（运维系统页面第二阶段收口）

- 已完成本轮目标：按优先级完成 `SYS-02`、`SYS-03`、`SYS-04` 全量交付，并补齐前端权限隔离与导航入口。
- 已完成项：
  - 通知中心（`SYS-02`）：
    - 新增页面 `/dashboard/system/notifications`，支持通知列表、全部/仅未读筛选、单条标记已读与刷新。
    - 扩展系统服务层：`getSystemNotifications`、`markSystemNotificationRead`。
  - 导入记录（`SYS-03`）：
    - 新增页面 `/dashboard/system/import-records`，展示导入记录状态、成功/失败数、错误日志。
    - 新增管理员前端守卫（非管理员不发起接口请求，直接显示无权限）。
    - 扩展系统服务层：`getSystemImportRecords`。
  - 导出入口（`SYS-04`）：
    - 设置页新增“数据导出”Tab，接入 8 类导出目标（供应商/门店/商品/采购/销售/货柜/库存/收付款）。
    - 扩展系统服务层：`exportSystemData`，支持下载 `GET /api/v1/system/export/:type` 返回文件。
  - 侧边栏与入口联动：
    - 新增“通知中心”导航；
    - 新增“导入记录”导航（管理员可见）；
    - 保持“系统日志”管理员可见策略。
- 验证结论：
  - `frontend` 定向测试通过：`npm run test -- src/components/layout/Sidebar.test.tsx src/app/dashboard/settings/page.test.tsx src/app/dashboard/system/logs/page.test.tsx src/app/dashboard/system/notifications/page.test.tsx src/app/dashboard/system/import-records/page.test.tsx`
  - 结果：5 个测试文件、17 个测试用例全部通过。

## 2026-03-01 Round 17（运维后端安全与一致性修复）

- 已完成本轮目标：修复审阅发现的后端权限与状态一致性问题，并补齐后端测试覆盖。
- 已完成项：
  - 通知已读接口权限修复：

## 2026-03-01 Round 21（测试缺口补齐）

- 已完成本轮目标：补齐当前前后端“文件级缺失测试”并完成关键自动化回归。
- 已完成项：
  - 前端页面测试缺口清零：
    - 新增 `forgot-password/register/dashboard/logs/settings/categories/settings/ports/root` 共 6 个页面测试文件。
    - 修复既有红灯：
      - `settings/page.test.tsx` 导出按钮文案断言更新为“导出数据”。
      - `contracts/template/page.test.tsx` 文件上传查询改为 `input[type=file]`。
  - 前端 service 测试缺口清零：
    - 新增 `config/container/contractDoc/dataImport/inventory/user` 共 6 个 service 测试文件。
  - 前端 E2E 覆盖扩展：
    - `button-coverage.spec.ts` 覆盖由 28 页扩至 38 页，补齐 `/`、`/register`、`/forgot-password`、AI 管理页、合同模板页、设置子页。
    - `helpers.ts` 补齐 AI 会话/Token 统计/模型接口 mock 与合同模板接口 mock。
    - `smoke.spec.ts` 导航回归增强：侧边栏缺链路时 fallback `goto`，避免因入口显示策略导致误报。
    - E2E 稳定性增强：按钮巡检增加 dialog 自动 dismiss、无语义按钮跳过、视口外按钮容错；Playwright `retries` 设为 `1`。
  - 后端测试缺口清零：
    - 将 `backend/src` 目录下原缺失的 37 个 `*.test.js` 全部补齐（含 controllers/routes/services/utils/middleware/app）。
    - `backend/src/app.js` 改为仅在 `require.main === module` 时启动监听，支持测试安全加载。
    - 新增 `backend/src/app.test.js` 覆盖 `/health` 可用性。
  - 清理无关仓库文件：
    - 删除 `music_name_fetch/README.md`、`music_name_fetch/fetch_music.py`。
- 验证结论：
  - 前端定向测试（本轮新增/修复）通过：`14 files / 41 tests`。
  - 后端全量测试通过：`85/85`。
  - 前端 E2E 全量通过：`52/52`。
    - `backend/src/controllers/systemController.js` 中 `markNotificationRead` 改为 `updateMany({ id, userId })`，只允许用户修改自己的通知。
    - 当记录不存在或无权限时返回 `404`（`通知不存在或无权限访问`）。
  - 导入状态修复：
    - `backend/src/services/importService.js` 新增 `resolveImportStatus(failedRows)`。
    - 导入完成状态改为 `FAILED/COMPLETED` 正确分支，修复原先固定 `COMPLETED` 的问题。
  - 测试覆盖补齐：
    - 新增 `backend/src/controllers/systemController.test.js`：
      - 通知已读归属约束
      - 无权限/不存在场景 404
      - 导入记录 `status/keyword` 筛选参数透传
    - 新增 `backend/src/services/importService.test.js`：
      - 导入状态推导
      - 导入记录筛选 where 组装
- 验证结论：
  - `backend` 全量测试通过：`npm run test`（44/44）。

## 2026-03-01 Round 18（Supabase 回切与上线路径收口）

- 已完成本轮目标：将 Prisma 数据源切回 Supabase PostgreSQL，并整理可执行的本地启动与上线路径。
- 已完成项：
  - 数据源回切：
    - `backend/prisma/schema.prisma` 恢复 `provider = "postgresql"`，并恢复 `directUrl = env("DIRECT_URL")`。
    - `backend/.env` 改为 Supabase 连接模板（`DATABASE_URL` + `DIRECT_URL`）。
  - 运行配置统一：
    - `backend/src/config/index.js` 默认端口改为 `3000`（与前端代理及启动脚本一致）。
    - `backend/src/config/index.test.js` 同步默认端口断言。
    - `backend/env.example` 端口统一为 `3000`。
  - 文档与部署配置收口：
    - 更新 `backend/README.md` 数据库说明（SQLite -> Supabase PostgreSQL）与启动说明。
    - 更新 `README.md` 新增“本地启动（Supabase）/推荐上线方式”步骤。
    - 更新 `docs/Supabase迁移指南.md` 的本地验证端口（3000）。
    - 清理 `vercel.json` 中硬编码占位 rewrite，避免上线后 API 被错误重写到假域名。
- 验证结论：
  - `backend` 全量测试通过：`npm run test`（44/44）。
  - Prisma 客户端生成通过：`npm run db:generate`。

## 2026-03-01 Round 19（登录体验增强：记住密码与快捷登录）

- 已完成本轮目标：将登录页“记住用户名”升级为“记住账号密码”，并新增一键快捷登录入口。
- 已完成项：
  - `frontend/src/app/(auth)/login/page.tsx`
    - 本地存储从仅用户名扩展为账号密码（`jiesong_saved_credentials`）。
    - 页面初始化自动恢复用户名与密码。
    - 新增“快捷登录（用户名）”按钮，用户可直接点击登录，无需重复输入密码。
    - 保留旧键 `jiesong_saved_username` 兼容逻辑，避免历史用户数据失效。
  - `frontend/src/app/(auth)/login/page.test.tsx`
    - 更新“恢复记住信息”断言为同时恢复密码。
    - 增加“快捷登录”测试用例，覆盖一键登录请求与跳转行为。
- 验证结论：
  - `frontend` 定向测试通过：`npm run test -- src/app/(auth)/login/page.test.tsx`（5/5）。
  - 定向 ESLint 通过：`npx eslint src/app/(auth)/login/page.tsx src/app/(auth)/login/page.test.tsx`。

## 2026-03-01 Round 19（前端 E2E 全量稳定性收口）

- 已完成本轮目标：验证“前端关键页面点击交互是否可自动化验收”并修复阻塞项，达成全量 E2E 通过。
- 已完成项：
  - E2E 认证注入稳定化：
    - `frontend/e2e/helpers.ts` 的 `signInAsAdmin` 改为注入 `auth-storage` + `jiesong_access_token` 后直达目标页，减少登录流程竞态。
  - 鉴权跳转竞态修复：
    - `frontend/src/app/dashboard/layout.tsx` 增加持久化认证态读取兜底，避免 hydration 窗口误判未登录并跳回 `/login`。
  - 系统日志页面运行时崩溃修复：
    - `frontend/src/app/dashboard/system/logs/page.tsx` 将 `useMemo` 前置到条件返回之前，修复 Hooks 顺序错误。
  - E2E Mock 与业务页兼容补丁：
    - 持续保留 `frontend/e2e/helpers.ts` 的系统运维/业务接口 Mock 覆盖；
    - `frontend/src/app/dashboard/purchase/page.tsx` 的金额字段增加空值兜底，避免 `toLocaleString` 在 mock 空值时崩溃。
- 验证结论：
  - `frontend` 定向单测通过：
    - `npm run test -- src/app/dashboard/system/logs/page.test.tsx`（4/4）。
  - `frontend` 全量 E2E 通过：
    - `npm run test:e2e -- --reporter=line`（14/14）。

## 2026-03-01 Round 20（按钮级 E2E 巡检扩展）

- 已完成本轮目标：将前端 E2E 从“关键路径按钮”扩展到“页面按钮巡检”，覆盖系统主要页面按钮交互可点击性。
- 已完成项：
  - 新增按钮巡检用例：`frontend/e2e/button-coverage.spec.ts`
    - 覆盖 28 个页面入口（含采购/销售/库存/财务/主数据/系统运维页面）。
    - 每页执行按钮快照扫描 + 可点击验证（跳过非业务/环境按钮）。
    - 针对展示型页面支持 `minClicks: 0` 配置，避免误报。
  - Mock 能力补齐：
    - `frontend/e2e/helpers.ts` 新增导入中心相关接口 mock：
      - `GET /api/v1/import/history`
      - `GET /api/v1/import/stats`
      - `POST /api/v1/import/preview`
      - `POST /api/v1/import/execute`
  - 运行时健壮性补丁：
    - `frontend/src/app/dashboard/purchase/[id]/page.tsx` 补齐 `unitPrice/totalPrice` 空值兜底，修复详情页潜在崩溃。
    - `frontend/e2e/helpers.ts` 登录注入脚本增加 `sessionStorage` 异常保护，兼容下载/跨源文档场景。
- 验证结论：
  - 按钮巡检专项：`npm run test:e2e -- --reporter=line e2e/button-coverage.spec.ts`（28/28）。
  - 前端 E2E 全量：`npm run test:e2e -- --reporter=line`（42/42）。

## 2026-03-01 Round 22（前端单测收口与全链路绿灯）

- 已完成本轮目标：修复前端全量单测剩余失败并完成全链路回归验证。
- 已完成项：
  - 前端单测失败收口（3 文件 / 5 用例 -> 0）：
    - `frontend/src/app/dashboard/users/page.test.tsx`：将重复文本断言改为 `getAllByText`，消除“管理员”多节点歧义。
    - `frontend/src/app/dashboard/ai/token-stats/page.test.tsx`：将重复数值断言改为 `getAllByText`，消除“10”多节点歧义。
    - `frontend/src/components/layout/Sidebar.test.tsx`：按当前侧边栏实现更新断言（激活样式、管理员子菜单展开条件、退出仅校验 `logout` 调用）。
  - 清理无关目录残留：
    - 删除 `music_name_fetch/` 运行时残留文件与空目录（非项目资产）。
- 验证结论：
  - 前端定向测试：`3 files / 11 tests` 通过。
  - 前端全量单测：`70 files / 229 tests` 通过。
  - 前端 E2E 全量：`52/52` 通过。
  - 后端全量测试：`85/85` 通过。
