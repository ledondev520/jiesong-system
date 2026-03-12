# Frontend Polish Risks

## 风险台账
| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-001 | 全量 lint 失败（历史存量） | 阻塞“全绿”结论 | 按“改动文件零新增 + 定向测试”推进；后续单独治理存量 | 回滚到本阶段改造前的样式提交点 |
| R-002 | 视觉改动导致低配机器渲染压力上升 | 页面卡顿 | 控制 blur/阴影层级，优先 CSS 轻量动效 | 回退重动画与重阴影样式 |
| R-003 | 深色主题下对比度不足 | 可读性下降 | 逐页检查重点文本对比度，统一前景色 token | 回退异常页面到基础 token |
| R-004 | 鉴权 hydration 窗口与条件渲染导致 hooks 顺序/误跳登录 | E2E 随机回登录、页面运行时崩溃 | 在布局中增加持久化认证兜底；禁止在条件 return 之后新增 hook；新增对应页面定向回归 + E2E 回归 | 回滚 `dashboard/layout.tsx` 与问题页面到修复前提交点 |
| R-005 | 按钮巡检在浏览器环境触发非业务噪声（下载场景 sessionStorage、WebGL 初始化告警） | E2E 误报失败、阻塞回归 | 将已确认的环境噪声加入白名单过滤；保留业务异常（运行时 TypeError/ReferenceError）为阻断 | 回退 `button-coverage.spec.ts` 中噪声过滤策略到上一版本 |
| R-006 | 前端全量 Vitest 在当前仓库存在历史慢测/不稳定用例 | 影响“全量一次性绿灯”稳定性 | 本轮采用“缺口文件定向回归 + 后端全量 + 前端 E2E 全量”门禁；后续单独治理历史慢测（容器/销售/推荐/用户等） | 回滚本轮新增测试文件与 E2E 稳定化策略（`smoke.spec.ts`/`button-coverage.spec.ts`/`playwright.config.ts`） |
| R-007 | 大页面拆分期间遗漏共享逻辑导致状态初始化/副作用行为与历史行为偏差 | 列表/详情页显示异常、交互回退 | 分离动作后执行页面级定向测试；保留 wrapper 层仅负责入口，核心逻辑不改动 | 回滚到拆分前单文件版本（`contracts/page.tsx` 等） |
| R-008 | `salesService`/`containerService` 引入服务层后，可能遗漏字段映射与异常边界 | 导出数据/金额字段偏差、更新接口行为变更 | 服务层增加集中映射与数值回写保障，并通过 `backend` 全量测试与受影响接口回归 | 回退到控制器直写版本并复用旧控制器逻辑 |
| R-009 | 系统控制器按域拆分后，子控制器导出协定不一致导致路由 500 | 部分配置/通知/日志接口返回 500 | 启动期保持 `systemController` 聚合层完整映射旧对外 API；新增单测覆盖 `ports/categories/import/notifications` 关键入口 | 回退到单文件聚合控制器（`systemController.js`） |
| R-010 | `dataImportService` 测试采用深度 mock，可能掩盖 `prisma` 并发边界或查询链路异常 | 导入路径回归通过但真实数据库场景存在未覆盖缺陷 | 在每次发布前补充一条真实数据库集成回放测试（最小导入样例 + 重复容器映射） | 回退到仅 compare/import 单测，保守放宽缓存重构力度 |
| R-011 | 前端状态徽章替换导致文本映射与历史约定不一致 | 运营端状态语义展示与业务口径冲突 | 与后端枚举对齐并保留 override map；关键路径定向页面测试回归 | 回退到 `SemanticBadge` 原始本地映射（保留 `semantic-badge.tsx`） |
| R-012 | 角色授权中间件替换未同步到部分写接口 | 越权写入或部分功能误阻塞 | 在发布前逐文件核对 `post/put/delete` 路由与 `roleAuth`；保留现有 `authorize` 兼容入口 | 回退到逐路由 `authorize` + `adminOnly` 组合并补充灰度窗口 |
| R-013 | 财务幂等字段 `Payment.idempotencyKey` 未完成数据库同步（`db:push`） | 生产环境创建付款可能因字段缺失报错 | 发布前执行 `npm run db:generate && npm run db:push`，并验证 `POST /finance/payments` 重复请求仅写入一次 | 回退 `financeService` 幂等写入分支与 Prisma 字段变更 |
| R-014 | 审计中间件在高频写入路由全量启用后，可能引入额外 DB 查询开销（before/after 快照） | 写接口 RT 上升、高峰期资源压力增大 | 对高频但非关键路由可使用 `captureBefore/captureAfter: false` 精简快照；必要时对日志写入做异步队列化 | 回退各路由 `withAuditLog` 配置至仅关键实体（合同/库存/财务/系统配置） |
| R-015 | 使用 SQLite 数据源执行 Prisma 校验（provider=sqlite）且 schema 含 enum Role | prisma validate 失败，阻塞数据库层全量校验 | 统一到 PostgreSQL 或改为 SQLite 兼容字段类型后再执行 prisma validate/db push；当前先以应用层定向测试兜底 | 回退到旧角色字段定义或恢复上一次可验证的数据源配置 |
| R-016 | 多实例同时执行每日库存任务（无分布式锁） | 可能产生重复低库存通知 | 当前采用“同日+用户+商品”去重降低重复；若进入多实例部署，需引入任务锁（DB/Redis）或集中调度器 | 回退到仅保留 `GET /inventory/alerts` 查询，不自动下发通知 |
| R-017 | 前端构建依赖外网字体与既有页面语法健康；在网络受限或存量语法错误存在时执行 `next build` | 阻塞本轮功能的“全量 build 绿灯”验收 | 先执行定向 lint+test 验证功能正确性；并行跟进修复 `ClaudeCostCalculator.tsx` 语法错误与字体离线化策略 | 回退到不依赖构建产物的定向验证门禁（保留本轮 PDF 导出功能改动） |
| R-018 | CI 环境启用远程 LLM 时上游延迟抖动/限流 | `Performance Smoke (LLM Route)` 随机超时红灯 | 默认在 CI/test 走本地 AI 降级与超时保护（可通过 `AI_ALLOW_REMOTE=true` 显式开启远程） | 回退 `aiService.js` 的本地降级与超时参数逻辑 |
| R-019 | Dashboard 在 `md` 以下隐藏侧边栏，但 Header 无移动端导航补位 | 移动端用户进入工作台后无法切换主模块，阻断完整使用 | 增加移动端菜单入口（Sheet/Drawer/Hamburger）并补移动端 Playwright 验收 | 回退移动端导航新增入口，恢复桌面侧边栏模式 |
| R-020 | 登录页 rememberMe 复选框与可读标签未形成稳定可访问名称关联 | 屏幕阅读器和键盘用户无法确认控件语义，影响认证入口无障碍 | 2026-03-08 已通过 `frontend/src/app/(auth)/login/page.test.tsx` 的 `getByRole('checkbox', { name: '记住账号和密码' })` 断言复核，风险关闭 | 回退登录表单的 rememberMe 控件改动 |
| R-021 | Prisma 新增 `HsCode` 表后，本地 SQLite 迁移与既有 `dev.db` 状态不一致 | `prisma migrate dev` 失败，阻塞后续服务与前端开发 | 先用定向服务测试锁定模型行为，再执行 `npx prisma migrate dev --name add_hs_codes_table`；若本地数据库漂移，优先修复迁移状态而不回退业务代码 | 回退新增 migration 与 `schema.prisma` 中 `HsCode` 模型 |
| R-022 | HSCode 种子数据若直接 `createMany` 且重复执行无幂等策略 | 本地重复运行脚本报唯一键冲突，影响开发恢复 | 采用 `upsert` 或“先查后写”策略保证 100 条种子可重复执行 | 回退种子脚本到只在空表执行的保守版本 |
| R-023 | 商品页当前无 `taxRate` 持久字段，若直接扩展 `Product` 模型会放大改动面 | 牵连商品 CRUD、列表、类型与库存链路，增加回归面 | 本轮将 `taxRate` 作为 HSCode 匹配辅助展示值，不持久化到 `Product`；后续若业务确认需要持久化，再单独立项 | 回退商品弹窗中的税率展示逻辑，保留仅 HSCode 回填 |
| R-024 | HSCode 全量原始抓取耗时较长，当前交互会话或前台进程被打断 | 原始快照不完整，影响后续统一清洗与入库 | 使用“每编码单独 JSON + manifest + chapter page 快照”的断点续跑结构；随时可通过同一命令继续抓取未完成部分 | 回退到仅保留已抓取 `records/*.json` 的阶段性快照，不删除已有原始数据 |
| R-025 | 站点章节搜索结果存在源站侧限制/覆盖范围差异，并非 `01`-`99` 每章都返回可抓数据 | CSV 总量可能低于“理论全量 HS 编码”，影响对完整性的预期 | 以“源站当前可返回结果”为准保存快照，并在结果文档中明确当前仅抓到 `01/02/03/04/05/69` 前缀；若后续需要更高覆盖率，再补其他来源交叉抓取 | 保留本轮 CSV 作为可复用基线，后续增量合并而非重做 |
| R-026 | 退税模块当前存在并行中的“auto-drafts / HSCode live import”开发，与本轮 CRUD 收口交叉触达相同文件 | 若直接混合验收，容易把未完成的自动草稿链路误判为本轮回归范围 | 本轮只以 CRUD API、`/dashboard/tax-refunds` 工作台与生产构建为验收边界；自动草稿链路单独跟踪 | 回退本轮税退 CRUD 页面与路由挂载，保留并行草稿链路继续开发 |
| R-027 | 前端全量 Vitest/coverage 在 CI 下运行高交互页面测试时，默认 `5s` 超时不足 | 产生假红灯，阻塞前端单测与覆盖率门禁 | 提升 `frontend/vitest.config.ts` 中 `testTimeout` 到 `20000`，保留业务代码不变并用全量 `test + coverage` 复核 | 回退 `frontend/vitest.config.ts` 的 `testTimeout` 配置 |
| R-028 | FE-COV-98 扩大 coverage 统计口径到 `src/app` / `src/services` 后，四项指标可能较当前基线明显下跌 | 团队误以为“本轮变差”，导致为保数字而缩小统计范围或临时豁免文件 | 先冻结 master plan，明确“先接受真实缺口，再分阶段补齐”；默认不通过排除文件凑指标 | 回退 FE-COV-98 的 coverage 扩围配置，恢复到当前 `components/lib` 统计口径 |

## 2026-03-08 Round 43 状态更新

- `R-021`：已完成验证，迁移执行成功。
- `R-022`：已降低风险，种子脚本改为“先清空后写入固定 100 条”。
- `R-023`：继续保留监控，本轮未扩展 `Product` 持久字段。
- `R-024`：已收敛；断点续跑方案已支撑完成本轮全量章节扫取。
- `R-025`：已激活并记录；当前 CSV 反映的是源站当前可返回的章节覆盖范围。

## 2026-03-08 Round 44 状态更新

- `R-017`：已缓解，`cd frontend && npm run build` 当前通过；前端构建不再被本轮发现的存量类型/Suspense 问题阻断。

## 2026-03-08 Round 45 状态更新

- 新增残余风险：自动退税草稿仍依赖报关单明细上的 `hsCode + totalPrice` 完整度；缺失时系统会跳过而不是自动猜测金额。
- live HSCode 主查询源已切换完成，示例 seed 不再混入当前正式 `hs_codes` 数据。

## 2026-03-08 Round 46 状态更新

- 上游报关单草稿已从现有销售/装箱数据补齐一轮，当前自动化链路的主要剩余阻塞转为 live HSCode 覆盖不足导致的 `no_rate_data`。

## 2026-03-08 Round 46 状态更新

- `R-026`：已激活并纳入边界说明；本轮验收不包含自动草稿生成链路。
- `R-017`：已进一步收敛；`frontend/src/app/layout.tsx` 改为本地字体栈后，`cd frontend && npm run build` 在当前环境通过。

## 2026-03-08 Round 47 状态更新

- `R-027`：已收敛；`cd frontend && npm run test` 与 `cd frontend && npm run test:coverage` 均在新超时上限下通过。

## 2026-03-08 Round 48 状态更新

- 新增残余风险：`TaxRefund` Prisma 模型已扩字段，但当前沙箱未执行 `prisma generate/db push`；若本地运行真实写链路，需要先同步 Prisma Client 与数据库结构。
- V1 导出校验当前通过 `relation_no -> purchaseContract.contractNo` 做规范化比对；若后续业务确认“关联号”语义不同，需要单独调整映射规则。
## 2026-03-12 Round 50 状态更新

- `R-028`：已激活；FE-COV-98 后续执行阶段必须接受扩口径后的短期指标回落，禁止通过临时排除 `app/services` 文件来制造“达标”假象。
- `R-027`：继续保留监控；Coverage 冲刺阶段仍需防止高交互页面在插桩下重新出现超时假红。

## 2026-03-12 Round 51（Backend Coverage 98 Phase 1）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-029 | backend coverage 冲刺直接从高耦合模块开始（AI/导入/文档） | 工时高、提分慢，可能把专项推进拖成重构工程 | 先冻结第一阶段真实基线，第二阶段优先补 controller 薄层与高 ROI service 测试 | 回退新增补测与最小可测性重构，保留第一阶段报告与基线 |
