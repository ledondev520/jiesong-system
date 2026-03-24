# Frontend Polish Risks

## 2026-03-25 Round 58（HSCode 精确编码清尾差）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-054 | 团队继续把“前缀搜索页结果”当成唯一入口，忽略搜索引擎已索引的详情页 | 会误以为尾差前缀无数据，导致卡在低效重试 | 当前已验证“搜索引擎反查详情页编码 -> 精确 10 位码抓详情”有效，后续对尾差类问题优先使用这条策略 | 回退到 Round 57 的“剩余 8 个尾差前缀”状态 |

### 2026-03-25 Round 58 状态更新

- `R-054`：本轮已收敛。最后 `8` 个尾差前缀已通过精确编码策略补齐。
- 当前风险不再是尾差前缀本身，而是如果要继续扩围，需要更大范围的第三来源校验。

## 2026-03-24 Round 57（HSCode 尾差前缀继续压缩）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-053 | 仅剩的尾差前缀继续使用同一搜索入口批量重试，收益持续下降 | 可能长时间消耗查询与执行时间，但无法有效继续缩小剩余缺口 | 对剩余 `8` 个前缀切换成逐前缀精细策略；必要时改用第三来源或详情页链路 | 回退到 Round 56 的“仍有 12 个尾差前缀”状态 |

### 2026-03-24 Round 57 状态更新

- `R-053`：已激活。当前剩余尾差已经从 `12` 个前缀进一步压到 `8` 个。
- 当前阶段最重要的不是再扩大并发，而是更换策略。

## 2026-03-24 Round 56（HSCode 官方对账收敛与残余缺口补抓）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-052 | 官方表范围内仍有少量前缀持续返回 `0`，团队若继续按同一搜索入口机械重试，可能陷入低收益重复补抓 | 会消耗时间和站点查询额度，但无法有效缩小剩余尾差 | 对剩余 `12` 个前缀切换成逐个判定模式，必要时更换抓取入口或依赖更细粒度来源，而不是继续大批量重跑 | 回退到 Round 55 的“首批真实缺口已补齐”状态 |

### 2026-03-24 Round 56 状态更新

- `R-052`：已激活。当前缺口已经从“大片空白”收敛到 `84` 章和 `85` 章的少量尾差前缀。
- 当前阶段最忌讳的是继续把“尾差问题”当“大规模缺口”来处理；后续应更细粒度地逐前缀处理。

## 2026-03-24 Round 55（HSCode 真实缺口前缀定向补抓）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-051 | 已确认缺口前缀补齐后，如果团队直接把当前数据定义为“全量完成”，可能忽略同章节内尚未被二级来源点名的其他残余缺口 | 会把“已补齐首批真实缺口”误说成“全量无缺失”，导致后续数据质量判断过早收口 | 当前只宣告“13 个确认缺口前缀已补齐”；若要宣布全量完成，必须再跑一轮二级来源交叉验证 | 回退到 Round 54 的“已确认存在真实缺口，但尚未补抓”状态 |

### 2026-03-24 Round 55 状态更新

- `R-051`：已激活。当前最准确的结论是“13 个被官方确认的真实缺口前缀已补齐”，不是“整份 HSCode 数据已被证明全量无缺失”。
- 当前风险重心已经从“是否真的缺”转移到“是否还存在下一批未被点名的缺口前缀”。

## 2026-03-24 Round 54（HSCode 二级来源交叉验证）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-050 | 仅依赖单一搜索站点的结果页判断“是否缺失”，而不引入第二来源校验 | 会把“站点探针不稳定”和“本地数据完整性”混为一谈，导致团队无法判断该继续补抓还是该停止 | 已引入中国海关官方 HS4 统计表做二级来源；后续只要官方表明确存在、本地仍为 `0`，就直接认定为真实缺口 | 回退到 Round 53 的“仅确认三层同步，不确认真实缺口范围”状态 |

### 2026-03-24 Round 54 状态更新

- `R-050`：本轮已收敛。当前已经通过二级来源确认，`44 / 62 / 84 / 85 / 90` 这些章节里确实存在真实缺口，不再是单纯的探针噪声。
- 当前新的主风险不是“会不会误判有缺失”，而是“缺口前缀虽然已确认，但单个前缀下还缺多少个 `10` 位编码仍需要下一轮继续补抓”。

## 2026-03-24 Round 53（HSCode 定向增补与三层重建）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-049 | 源站搜索探针在本轮对“已知存在前缀”和“待核前缀”都返回 `0` | 会让“是否还缺失”的判断失去稳定外部证据，继续盲补可能再次把团队带回误报和无效查询 | 暂时把 `14391` 作为已同步完成的稳定基线；后续若继续追求完整性，优先更换验证方式（第二来源交叉对账、明细页探针），而不是继续扩大补抓范围 | 回退到本轮重建前的 `manifest / CSV / DB` 基线（`14161`） |

### 2026-03-24 Round 53 状态更新

- `R-049`：已激活。当前源站 live probe 不再足以证明“仍缺失”或“已全量”，因为它对 `2845 / 2853 / 2910 / 2920 / 2922` 这些本地已存在前缀也返回了 `0`。
- 当前最稳状态：`14391` 条数据已经完成 `raw / CSV / DB` 三层同步。
- 当前不再建议继续盲目对 `44 / 62 / 84 / 85 / 90` 做更大规模补抓；若继续推进，应先升级验证方法。

## 2026-03-24 Round 52（HSCode 400 截断章节低频分片补抓）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-048 | 仅凭“章节数恰好等于 400”来判定 HSCode 大章被搜索页截断，可能把本来就完整的章节误判成缺失 | 会把团队带进无效补抓，浪费站点查询额度和执行时间，还会让 dry-run 长期显示假缺口 | 在 `backfill_hscode_prefixes.py` 增加 `--verify-source` 能力，并用边界前缀实测确认 `55` 章真实止于 `5516` | 回退 `backend/scripts/backfill_hscode_prefixes.py`、`backend/scripts/test_backfill_hscode_prefixes.py`、`backend/scripts/scrape_hscode_raw.py`、`backend/scripts/test_scrape_hscode_raw.py` |

### 2026-03-24 Round 52 状态更新

- `R-048`：本轮已收敛。`55` 章被确认是旧阈值逻辑的假阳性，不再继续做无效补抓；raw / CSV / 正式库已经同步到 `14161`。
- 剩余监控点：`28 / 29 / 44 / 62 / 84 / 85 / 90` 七章经重点抽样后都已命中至少一个缺口前缀，当前风险从“可疑”升级为“需要继续增补”，其中 `28 / 62 / 90` 还显示边界外延仍有增量空间。

## 2026-03-23 Round 73（Frontend E2E Stabilization Before Commit）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-046 | dashboard 壳层在 server 首帧与 client 首帧渲染结构不同，production preview 下触发 hydration mismatch | Playwright 多页巡检在进入 dashboard 相关页面时直接抛 `React error #418`，导致提交前门禁失真 | 把 hydration 状态改成 `useSyncExternalStore` 驱动，确保 server snapshot 与 client 首帧快照一致，再用 fresh preview 重跑全量 E2E | 回退 `frontend/src/app/dashboard/layout.tsx`、`frontend/src/app/dashboard/layout.test.tsx`、`frontend/src/components/layout/Header.tsx` |
| R-047 | E2E mock 返回结构与真实前端服务契约漂移，或者 smoke/button 断言仍指向旧 IA/旧文案 | 导入页、采购建议页、设置页等页面出现假红灯，团队会误以为功能回归而不是测试资产过期 | 先补 mock 契约与服务兼容，再把断言同步到当前 IA，并用 full-suite `test:e2e` 验证不是局部侥幸通过 | 回退 `frontend/e2e/helpers.ts`、`frontend/e2e/smoke.spec.ts`、`frontend/e2e/button-coverage.spec.ts`、`frontend/src/services/dataImportService.ts` |

### 2026-03-23 Round 73 状态更新

- `R-046`：本轮已收敛。dashboard 壳层和 Header 时间展示都已切到 hydration-safe 方案，`React error #418` 不再复现。
- `R-047`：本轮已收敛。导入页/采购建议页/设置页相关 mock 与断言均已同步，前端全量 E2E `57/57` 通过。

## 2026-03-23 Round 72（Frontend Next Iterations Round 7）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-044 | 模块首页差异化这轮直接在采购/出口首页插入概览卡，若统计口径只顾 UI 不顾业务状态，会让“模块首页差异化”变成新的误导信息 | 首页看起来更像模块工作台，但卡片数字不可信，会削弱运营对首页的依赖 | 只使用现有合同状态和箱数等可验证字段做派生，并用页面级回归测试锁住采购/出口首页首屏结构 | 回退 `frontend/src/app/dashboard/contracts/components/ContractsPageContent.tsx`、`frontend/src/app/dashboard/contracts/page.test.tsx`、`frontend/src/app/dashboard/sales/page.tsx`、`frontend/src/app/dashboard/sales/page.test.tsx` |
| R-045 | Playwright 截图门禁若继续复用已有 dev server 端口，或 mock 不完整，截图回归会被环境噪声而不是真实 UI 漂移阻断 | QA 门禁不稳定，后续团队会选择绕过截图回归，而不是依赖它发现结构漂移 | 改用 production preview 端口独立运行，补齐财务页依赖的 mock，并先单页跑通再复跑全量 `5` 张截图 | 回退 `frontend/playwright.config.ts`、`frontend/e2e/helpers.ts`、`frontend/e2e/visual.spec.ts` |

### 2026-03-23 Round 72 状态更新

- `R-044`：本轮已收敛。采购/出口首页概览都只基于既有合同状态与箱数字段派生，页面级回归测试已覆盖首屏概览结构。
- `R-045`：本轮已收敛。截图门禁已改为 production preview 运行，财务页 mock 缺口已补齐，`5` 张截图回归全部通过。

## 2026-03-23 Round 71（Frontend Next Iterations Round 6）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-043 | AI 助手入口位置和挂载策略同时调整，若只改样式不改边界，AI 模块页仍会出现重复入口；若只改边界不改形态，业务页噪音仍旧过高 | 用户仍会觉得 AI 助手“总在抢焦点”，或者在 AI 模块里看到重复助手入口 | 同时给 `LazyAIAssistantMount` 和 `AIAssistant` 加回归测试：一个锁挂载边界，一个锁“低存在感触发器 + 侧边面板” | 回退 `frontend/src/components/ai/LazyAIAssistantMount.*` 与 `frontend/src/components/ai/AIAssistant.*` |

### 2026-03-23 Round 71 状态更新

- `R-043`：本轮已收敛。AI 模块页不再重复挂全局助手，默认入口与展开形态也已切成更克制的侧边面板。

## 2026-03-23 Round 70（Frontend Next Iterations Round 5）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-042 | `Header` 壳层拆分与全局搜索收口在同一轮同时发生，搜索交互、移动导航、用户菜单都改到同一批文件 | 若测试边界不够清晰，容易把“结构更干净”换成“搜索/跳转/退出回归” | 先写 `Header` 与搜索服务的 red tests，`Header` 只做壳层编排，搜索策略下沉到单独服务并由定向测试锁住 | 回退 `frontend/src/components/layout/Header*.tsx` 和 `frontend/src/services/dashboardSearch.service.*` |

### 2026-03-23 Round 70 状态更新

- `R-042`：本轮已收敛。`Header` 已拆成子组件，搜索 fanout 已收口到服务层，且 `Header` / `dashboardSearch.service` 定向测试和 `build` 均通过。

## 2026-03-23 Round 68（Frontend Next Iterations Round 3）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-039 | 统一状态体系时同时改动多个高频页，若页面仍保留各自手写文案和分支，容易出现 loading / empty / error 再次漂移 | 不同模块会继续给用户不同反馈，后续扩面成本更高 | 先抽共享 `data-state` 组件，再只接入 5 个高频页，并用页面级回归测试锁住错误态和空态接线 | 回退 `frontend/src/components/ui/data-state.tsx` 与这 5 个页面的状态层接线 |
| R-040 | 并行子任务长时间运行后再次返回 `not_found` | checkpoint 会误把失联任务记成 `DOING`，导致下次续跑判断失真 | 只按可验证证据更新状态；失联任务恢复为 `TODO`，重新分发而不口头沿用旧进度 | 回退 `TASKS.md` 中错误的状态标记，重新按证据分配队列 |

### 2026-03-23 Round 68 状态更新

- `R-039`：本轮已按“共享组件 + 页面级回归”执行，当前 5 个高频页已进入统一状态层。
- `R-040`：本轮已激活。并行 worker 再次返回 `not_found`，因此相关任务已恢复为真实待执行状态。

## 2026-03-23 Round 69（Frontend Next Iterations Round 4）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-041 | `store-recommend` 页面在拆分时同时包含模板视图、AI 建议、统计视图和 CSV 导出逻辑 | 若 state / props 边界处理不清，容易在门店切换、模板导出或 tab 渲染上引入回归 | 保持单一 `StoreRecommendPageContent` 持有状态，只抽展示分区；补门店切换页面级回归测试后再搬代码 | 回退 `frontend/src/app/dashboard/store-recommend/components/*` 和 `page.tsx` 的拆分改动 |

### 2026-03-23 Round 69 状态更新

- `R-041`：本轮已收敛。`store-recommend` 现在由薄入口 + 单一 container + 三个展示分区组成，门店切换测试已覆盖核心路径。

## 2026-03-22 Round 66（Frontend Next Iterations Round 1）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-036 | 工作台首屏使用现有 analytics 数据硬做“当前焦点/风险提醒”分区时，字段语义不够直接 | 首页层级会更好，但个别提醒可能只是推导值，业务感不够强 | 第一轮先接受“前端推导 + 文案收口”，不引入新 API；若验证后仍弱，再单开 dashboard contract 升级任务 | 回退 `frontend/src/app/dashboard/page.tsx` 与 `frontend/src/components/dashboard/DataDashboard.tsx` 到旧布局 |
| R-037 | 导航注册表继续承载默认落点和重定向规则后，与现有 tab-memory/历史深链接产生冲突 | 模块入口、默认跳转或壳层首跳出现偏差，影响熟悉路径的用户 | registry helper 保持兼容旧记忆逻辑，并以 `layout/sidebar` 定向测试锁住关键路由；若发现冲突，先收窄到只管理默认落点 | 回退 `frontend/src/components/layout/navigation.config.ts` 与 `frontend/src/app/dashboard/layout.tsx` 的新增落点逻辑 |

### 2026-03-22 Round 66 状态更新

- `R-036`：本轮已按“前端推导 + 不扩后端合同”落地，焦点/风险首版已经可用。
- `R-037`：本轮已通过 `navigation.config` / `layout` / `sidebar` 定向测试收敛，但未来新增更深路由时仍需继续扩覆盖。

## 2026-03-23 Round 67（Frontend Next Iterations Round 2）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-038 | 财务报表页同时拆出 container、图表分区和上传对话框时，原本集中在单文件里的状态依赖被拆散 | 账期切换、导入后刷新、新账期选中、detail loading 提示等细节可能回归 | 本轮只保留一个 stateful container，route 和子组件尽量无状态；先用页面级回归测试锁住导入/空态/详情行为，再搬代码 | 回退 `frontend/src/app/dashboard/finance/statements/components/*` 与 `page.tsx` 的拆分改动 |

### 2026-03-23 Round 67 状态更新

- `R-038`：本轮已按“单一 container + 页面级回归测试”落地，测试覆盖了账期切换、扫描导入和上传导入。后续剩余风险主要在继续细拆子区块时的 props 漂移，而不是当前结构切换本身。

## 2026-03-22 Round 65（Frontend Audit To Iteration）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-034 | 导航配置从三处收口到单一注册表后，若个别页面依赖历史硬编码顺序/路径，可能出现高亮、预取或模块记忆偏差 | 页面仍可访问，但模块激活态、移动端菜单或记忆跳转可能不准确 | 先以 `Header` / `Sidebar` / `dashboard/layout` / `ai/sessions` 的定向测试兜底；后续继续补采购、出口、系统管理三个模块的导航回归 | 回退 `frontend/src/components/layout/navigation.config.ts` 与壳层 3 个组件的接线改动 |
| R-035 | 删除旧 `dashboard/logs` 页面后，若存在仓库外旧书签或未扫描到的内部跳转引用 | 用户命中旧路径时看到 404 或错误跳转 | 当前系统管理实际日志页已是 `/dashboard/system/logs`；后续若发现真实入口仍引用旧路径，再追加 redirect，而不是恢复旧页 | 回退删除 `frontend/src/app/dashboard/logs/page.tsx` 的改动 |

### 2026-03-22 Round 65 状态更新

- `R-034`：已激活。第一轮已通过壳层与 AI 会话页定向测试，后续仍需补更多模块级导航回归。
- `R-035`：低风险激活。当前仓库内未找到 `/dashboard/logs` 引用，先保留观察。

## 2026-03-19 Round 62（ClawPi Domain Sweep）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-033 | 旧 ClawPi 域名实际保存在部署平台环境变量、系统 `crontab` / `launchd`、CI Secret 或网关层，不在仓库工作树内 | 仓库已清理但运行时仍可能继续访问旧地址 | 仓库内先统一前端 API 基址解析逻辑，并在结果文档中明确要求复核外部环境变量与系统级定时任务 | 回退 `frontend/src/lib/api-base-url.ts`、`frontend/src/lib/axios.ts`、`frontend/src/components/ai/AIAssistant.tsx` 与对应测试改动 |

### 2026-03-19 Round 62 状态更新

- `R-033`：已激活。本轮已确认仓库内无 `clawpi-v2.vercel.app` 明文字面量，但外部部署环境仍需人工复核。

## 2026-03-15 Round 61（Ops Execution Center Kickoff）

| 风险ID | 触发条件 | 影响 | 预案 | 回滚点 |
|---|---|---|---|---|
| R-030 | 未发货清单首版若直接新增 Prisma 模型与数据库迁移 | 拉长首批反馈周期，阻塞前端入口和聚合逻辑上线 | 首版用 `SystemConfig` JSON 保存负责人映射，先完成真实列表与分发闭环；数据库专模放到 `OPS-EXEC-03` 之后 | 回退 `opsExecution` 新增路由与前端页面，保留计划台账 |
| R-031 | 未发货聚合直接依赖 `/users` 列表来选择负责人 | 非管理员角色无法获取候选人，导致中台页对多数业务角色不可用 | 首版支持自由文本负责人分发（如“小周”），不依赖 admin-only 用户接口 | 回退负责人筛选与分发 UI 为只读展示 |
| R-032 | 采购清单模板和任务提醒引擎同时落地，跨前后端与数据库改动面过大 | 单轮回归面过大，难以快速验证 | 按 `OPS-EXEC-01 -> OPS-EXEC-02 -> OPS-EXEC-03` 顺序推进，每轮只放行一个真实可验证切片 | 回滚到仅保留中台入口页与 roadmap 状态 |

### 2026-03-15 Round 61 状态更新

- `R-030`：已按预案执行，`OPS-EXEC-01` 未引入 Prisma 新模型，首版用 `SystemConfig` 完成负责人映射闭环。
- `R-031`：已规避，当前中台页负责人分发使用自由文本输入，不依赖管理员专属用户列表。
- `R-032`：已阶段性收敛；三块能力都已有初版实现，但模板与任务仍使用 `SystemConfig` 存储，后续需评估数据量与并发写入成本。

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
