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
| SYS-01 | P0 | 30m | 1 | DONE | 新增系统日志页（`/dashboard/system/logs`）列表与导入日志视图 |
| SYS-02 | P1 | 30m | 1 | DONE | 新增通知中心页（`/dashboard/system/notifications`）列表与已读标记 |
| SYS-03 | P1 | 30m | 1 | DONE | 新增导入记录页（`/dashboard/system/import-records`） |
| SYS-04 | P1 | 20m | 1 | DONE | 系统设置页集成导出入口（`/system/export/:type`） |
| SYS-05 | P0 | 20m | 1 | DONE | 修复通知已读越权风险（`markNotificationRead` 强制 userId 归属校验） |
| SYS-06 | P1 | 20m | 1 | DONE | 修复导入状态错误（失败记录标记为 `FAILED`）并补服务层状态推导函数 |
| SYS-07 | P1 | 20m | 1 | DONE | 补齐后端测试覆盖（`systemController` + `importService`）验证筛选参数与权限行为 |
| DB-01 | P0 | 20m | 1 | DONE | Prisma 数据源切回 Supabase PostgreSQL（恢复 `provider=postgresql` 与 `directUrl`） |
| OPS-01 | P0 | 15m | 1 | DONE | 统一本地端口与环境模板（backend 默认端口 3000，`env.example` 同步） |
| OPS-02 | P1 | 20m | 1 | DONE | 补齐启动/上线文档（根 README + backend README + Supabase 迁移文档）并移除 Vercel 占位 rewrite |
| AUTH-01 | P1 | 20m | 1 | DONE | 登录页支持记住账号密码与“快捷登录”按钮（本地恢复后可一键登录） |
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
