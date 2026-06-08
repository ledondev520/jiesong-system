# Frontend Polish Tasks

## 2026-06-08 CI-05 GitHub Unit Tests 退税/报关测试修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| CI-05A | P0 | 5m | 1 | DONE | 恢复 Codex/ByteRover 项目记忆，并用当前 Chrome 登录态确认 `ledondev520/jiesong-system` Actions 状态 |
| CI-05B | P0 | 10m | 1 | DONE | 复查 GitHub `CI #46`，确认 `Code Quality` 已绿、当前红灯来自 `Unit Tests`，`Deploy` 为独立失败 |
| CI-05C | P0 | 10m | 1 | DONE | 本地复跑 GitHub 标注的销售/财务失败测试，确认本地超前提交已修复旧断言 |
| CI-05D | P0 | 10m | 1 | DONE | 为退税创建、详情、编辑测试补齐 `usePathname` mock，匹配当前导航 Module Interface |
| CI-05E | P0 | 10m | 1 | DONE | 优化报关创建页失败分支测试输入方式，避免 CI 中逐字符输入超时 |
| CI-05F | P0 | 10m | 1 | DONE | 复查 GitHub `CI #47`，确认前端测试已过，新的红灯来自后端测试缺 `DATABASE_URL` |
| CI-05G | P0 | 10m | 1 | DONE | 为主 CI 与 Test And Acceptance 后端测试显式设置 SQLite `DATABASE_URL=file:./dev.db` |
| CI-05H | P0 | 10m | 1 | DONE | 为可选 replay summary 持久化/读取补充缺库地址降级保护与服务测试 |
| CI-05I | P0 | 15m | 1 | DONE | 运行前端目标测试、完整 coverage、lint、TypeScript、后端 `test:all` 和前端生产构建 |
| CI-05J | P1 | 5m | 1 | DONE | 更新 PLAN/TASKS，并隔离非本轮 backend 差异和未跟踪财务报表测试文件 |

## 2026-06-07 NAV-FE-11 业务模块导航收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| NAV-FE-11A | P0 | 5m | 1 | DONE | 恢复 Codex/ByteRover 项目记忆，确认当前未提交基线包含财务三入口和 AI 独立入口改动 |
| NAV-FE-11B | P0 | 10m | 1 | DONE | 收敛顶层导航为经营中台、采购、出口、财务、AI 助手、系统管理，移除仓储物流 Module |
| NAV-FE-11C | P0 | 15m | 1 | DONE | 新增采购库存状态页，旧仓储物流和货柜装箱入口改为兼容跳转 |
| NAV-FE-11D | P0 | 15m | 1 | DONE | 将出口退税页改为报关单/退税记录合并工作区，旧报关单列表入口跳到合并页 |
| NAV-FE-11E | P1 | 10m | 1 | DONE | 精简经营中台工作台，统一出口合同、财务概览、经营执行等页面文案 |
| NAV-FE-11F | P1 | 15m | 1 | DONE | 更新导航、工作台、退税、报关、财务和出口合同测试并跑目标测试 |
| NAV-FE-11G | P1 | 10m | 1 | DONE | 运行目标 lint、TypeScript、diff 检查和独立浏览器验收截图 |

## 2026-06-07 PERF-FE-10 销售详情点击无响应诊断与首屏瘦身

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| PERF-FE-10A | P0 | 5m | 1 | DONE | 恢复 Codex/ByteRover 上下文，确认当前问题是销售详情点击慢而非单纯接口 SLA 失败 |
| PERF-FE-10B | P0 | 10m | 1 | DONE | 分层测量页面 HTML、Next dev rewrite、后端直连接口和真实浏览器点击耗时 |
| PERF-FE-10C | P0 | 10m | 1 | DONE | 修复 `MobileListCard` 重复导出造成的销售页编译 `500` |
| PERF-FE-10D | P0 | 10m | 1 | DONE | 设置本机前端 axios 直连 `3001`，同时保留 `/api/v1` rewrite 给上传下载路径 |
| PERF-FE-10E | P0 | 10m | 1 | DONE | 将销售详情截图保存和三表生成对话框改为按需加载，减少详情首屏 bundle |
| PERF-FE-10F | P1 | 10m | 1 | DONE | 运行详情页测试、目标 lint、TypeScript 和真实浏览器点击测速 |
| PERF-FE-10G | P1 | 5m | 1 | DONE | 更新 PLAN/TASKS，记录 dev 冷编译与生产构建口径差异 |

## 2026-06-07 CI-04 GitHub Code Quality Node 版本固定

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| CI-04A | P0 | 5m | 1 | DONE | 恢复 Codex/ByteRover 项目记忆，确认 `gh` 未登录且公开 GitHub API 返回私有仓库 404 |
| CI-04B | P0 | 10m | 1 | DONE | 复现当前 Code Quality 本地等价命令，确认 lint 和 TypeScript 均通过 |
| CI-04C | P0 | 10m | 1 | DONE | 核对前端 lockfile 引擎要求，确认依赖树要求 `Node >=20.19.0` |
| CI-04D | P0 | 10m | 1 | DONE | 固定所有前端依赖安装相关 GitHub Actions 的 Node 版本为 `20.19.0` |
| CI-04E | P1 | 10m | 1 | DONE | 运行安装 dry-run、lint、workflow diff 检查，并记录 `gh` 认证和既有工作区删除限制 |

## 2026-06-07 FINANCE-NAV-01 财务模块顶层 Tab 收敛

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FINANCE-NAV-01A | P0 | 5m | 1 | DONE | 恢复 Codex/ByteRover 项目记忆，确认线上截图是三入口财务导航，本地源码为七入口 |
| FINANCE-NAV-01B | P0 | 10m | 1 | DONE | 对比部署规则、git 状态与本地导航配置，确认本地 `main` 超前 `origin/main` 且财务 Tab 被后续改动重新拆散 |
| FINANCE-NAV-01C | P0 | 10m | 1 | DONE | 将 `FINANCE_TABS` 收敛为财务概览、财务报表、收付管理，并把明细页归入收付管理激活态 |
| FINANCE-NAV-01D | P0 | 10m | 1 | DONE | 恢复财务报表路由为独立页面，旧应收/应付路由改为收付管理兼容跳转 |
| FINANCE-NAV-01E | P1 | 10m | 1 | DONE | 更新财务概览入口文案、面包屑、旧路由测试和导航配置测试 |
| FINANCE-NAV-01F | P1 | 10m | 1 | DONE | 运行目标测试、目标 lint、diff 检查和本地 dev chunk 文案验证 |
| FINANCE-NAV-01G | P1 | 5m | 1 | DONE | 复跑 TypeScript 检查通过，并记录供应商页并行改动未混入本轮判断 |

## 2026-06-07 LOGIN-08 会话过期收敛跳转

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| LOGIN-08A | P0 | 5m | 1 | DONE | 恢复 Codex/ByteRover 项目记忆，确认当前问题不是旧快捷登录，而是 dashboard 401 处理没有统一收敛 |
| LOGIN-08B | P0 | 10m | 1 | DONE | 新增会话过期 Module，统一清理 token 与 `auth-storage`，并识别认证页不跳转 |
| LOGIN-08C | P0 | 10m | 1 | DONE | 将 axios 401 响应处理改为调用统一入口，多个并发 401 只处理一次 |
| LOGIN-08D | P1 | 10m | 1 | DONE | 补充会话过期测试，覆盖单次提示、单次跳转、认证页跳转豁免与状态清理 |
| LOGIN-08E | P1 | 10m | 1 | DONE | 运行目标测试、目标 lint 和全量 TypeScript 检查 |
| LOGIN-08F | P1 | 5m | 1 | DONE | 用本地浏览器确认 `/login?expired=1` 登录页提示可见 |

## 2026-06-07 PERF-API-09 接口性能全覆盖收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| PERF-API-09A | P0 | 5m | 1 | DONE | 恢复 Codex/ByteRover 项目记忆，确认上一轮覆盖为 `246/265`，剩余 `19` 条未测 |
| PERF-API-09B | P0 | 10m | 1 | DONE | 阅读合同文档、附件、导入导出、AI、HS 申报填写、巡检和汇率同步实现，确定可本地验证路径 |
| PERF-API-09C | P0 | 15m | 1 | DONE | 扩展写成功路径巡检到 `122` 个样本，补齐剩余文件、导入导出、AI/HS 和系统任务路径 |
| PERF-API-09D | P0 | 10m | 1 | DONE | 修复 HS 申报填写 `rawElements` 未定义和汇率同步 `domain` 字段写入不兼容问题 |
| PERF-API-09E | P0 | 10m | 1 | DONE | 为合同模板、财务报表目录和汇率同步降级补充目标单元测试 |
| PERF-API-09F | P0 | 15m | 1 | DONE | 复制 SQLite 库并在 `3014` 启动临时后端，运行 `122` 个写成功路径样本 |
| PERF-API-09G | P1 | 10m | 1 | DONE | 刷新路由覆盖清单，确认 `265/265` 全覆盖且 `0` 个接口超过 `2s` |
| PERF-API-09H | P1 | 5m | 1 | DONE | 检查临时上传残留、更新结果/指标/风险/patch，并停止临时后端 |

## 2026-06-07 PERF-API-07 库存/财务/运营写成功路径临时库 SLA

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| PERF-API-07A | P0 | 5m | 1 | DONE | 恢复覆盖清单，确认当前覆盖为 `232/265`，剩余 `33` 条未测 |
| PERF-API-07B | P0 | 10m | 1 | DONE | 阅读外汇核销、财务自动匹配、库存状态、运营清单、门店推荐实现 |
| PERF-API-07C | P0 | 15m | 1 | DONE | 扩展写成功路径巡检到 `100` 个样本，新增库存/财务/运营/外汇/门店推荐路径 |
| PERF-API-07D | P0 | 10m | 1 | DONE | 调整写巡检默认请求间隔到 `700ms`，避免样本数增加后触发全局限流 |
| PERF-API-07E | P0 | 15m | 1 | DONE | 复制 SQLite 库并在 `3014` 启动临时后端，运行 `100` 个写成功路径样本 |
| PERF-API-07F | P1 | 10m | 1 | DONE | 刷新路由覆盖清单，确认覆盖提升到 `246/265`、write 覆盖到 `93/104` |
| PERF-API-07G | P1 | 20m | 1 | DONE | 剩余 `19` 条路由已由 `PERF-API-09` 分层补齐，当前覆盖 `265/265` |

## 2026-06-07 PERF-API-06 Agent/税退/通知写成功路径临时库 SLA

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| PERF-API-06A | P0 | 5m | 1 | DONE | 恢复性能目标上下文，确认当前覆盖为 `215/265`，剩余 `50` 条未测 |
| PERF-API-06B | P0 | 10m | 1 | DONE | 阅读 Agent、通知、报关、退税、退税率、库存剩余路由与服务实现 |
| PERF-API-06C | P0 | 10m | 1 | DONE | 修复 `Notification` schema 缺少 `metadata` 的真实写路径问题，并新增迁移 |
| PERF-API-06D | P0 | 15m | 1 | DONE | 扩展写成功路径巡检到 `78` 个样本，新增 Agent/通知/报关/退税/退税率路径 |
| PERF-API-06E | P0 | 10m | 1 | DONE | 复制 SQLite 库并在 `3014` 启动临时后端，运行 `78` 个写成功路径样本 |
| PERF-API-06F | P1 | 10m | 1 | DONE | 刷新路由覆盖清单，确认覆盖提升到 `232/265`、write 覆盖到 `80/104` |
| PERF-API-06G | P1 | 15m | 1 | TODO | 继续处理剩余 `24` 条 write 路由，文件/财务/库存/运维任务与 AI/导入导出分层推进 |

## 2026-06-07 LOGIN-07 认证页旧快捷登录提前清理

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| LOGIN-07A | P0 | 5m | 1 | DONE | 恢复 Codex/ByteRover 项目记忆，确认历史问题集中在旧快捷登录缓存与认证页提示 |
| LOGIN-07B | P0 | 10m | 1 | DONE | 检查当前登录页、注册页、认证页组布局与旧清理模块，确认源码没有可见快捷登录按钮 |
| LOGIN-07C | P0 | 10m | 1 | DONE | 扩展旧快捷登录清理 Interface，同时清理 `localStorage` 与 `sessionStorage` 中的拆分 key 与命名变体 |
| LOGIN-07D | P0 | 10m | 1 | DONE | 在认证页组渲染提前清理脚本，避免旧状态在 React effect 前影响页面 |
| LOGIN-07E | P1 | 10m | 1 | DONE | 补充登录/认证页组测试，覆盖更宽的旧快捷登录残留与提前脚本渲染 |
| LOGIN-07F | P1 | 10m | 1 | DONE | 运行目标测试、目标 lint、TypeScript 检查与本地页面文案回归 |

## 2026-06-07 PERF-API-05 合同/货柜写成功路径临时库 SLA

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| PERF-API-05A | P0 | 5m | 1 | DONE | 恢复性能目标上下文，确认当前覆盖为 `197/265`，剩余 `68` 条未测 |
| PERF-API-05B | P0 | 10m | 1 | DONE | 阅读采购、销售、货柜路由、控制器、服务和状态机，确定不触发库存出入库的成功路径 |
| PERF-API-05C | P0 | 15m | 1 | DONE | 扩展 `scripts/audit_api_write_success_times.js`，新增采购/销售/货柜写成功路径和清理夹具 |
| PERF-API-05D | P0 | 10m | 1 | DONE | 复制 SQLite 库并在 `3014` 启动临时后端，运行 `58` 个写成功路径样本 |
| PERF-API-05E | P1 | 10m | 1 | DONE | 刷新路由覆盖清单，确认覆盖提升到 `215/265`、write 覆盖到 `63/104` |
| PERF-API-05F | P1 | 10m | 1 | TODO | 继续为剩余 `41` 条 write 路由设计成功路径夹具，导入/导出/AI 单独分层 |

## 2026-06-07 LOGIN-06 快捷登录旧状态清理与认证页防缓存

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| LOGIN-06A | P0 | 5m | 1 | DONE | 恢复 Codex/ByteRover 项目记忆，确认 3000 是前端、3001 是后端，当前源码与实时 HTML 无快捷登录 UI |
| LOGIN-06B | P0 | 5m | 1 | DONE | 验证本地 `admin/123456` 能通过后端登录，排除后端账号密码失效 |
| LOGIN-06C | P0 | 10m | 1 | DONE | 新增共享旧快捷登录清理模块，清理历史 key 和 quick-login 命名变体 |
| LOGIN-06D | P1 | 10m | 1 | DONE | 登录页和认证页组布局统一调用清理模块，注册页进入时也清理旧状态 |
| LOGIN-06E | P1 | 10m | 1 | DONE | 为登录、注册、忘记密码认证页增加 no-store 缓存头配置 |
| LOGIN-06F | P1 | 10m | 1 | DONE | 运行认证页目标测试、目标 lint、浏览器页面验证和后端登录验证 |

## 2026-06-07 PERF-API-04 写接口成功路径临时库 SLA

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| PERF-API-04A | P0 | 5m | 1 | DONE | 恢复性能目标上下文，确认当前覆盖为 `173/265`，剩余 `92` 条未测 |
| PERF-API-04B | P0 | 15m | 1 | DONE | 设计必须显式允许写入且只能指向临时端口的写成功路径巡检脚本 |
| PERF-API-04C | P0 | 15m | 1 | DONE | 新增 `scripts/audit_api_write_success_times.js`，覆盖 29 个小写入成功路径 |
| PERF-API-04D | P1 | 10m | 1 | DONE | 将 `api-write-success-times` 接入路由覆盖清单 |
| PERF-API-04E | P0 | 10m | 1 | DONE | 复制 SQLite 库并在 `3014` 启动临时后端，运行写成功路径巡检 |
| PERF-API-04F | P1 | 10m | 1 | DONE | 复跑路由清单，确认覆盖提升到 `197/265`，剩余 `68` 条 |
| PERF-API-04G | P1 | 10m | 1 | TODO | 继续为剩余 `59` 条 write 路由设计可回滚成功路径夹具，文件/AI/导入导出单独分层 |

## 2026-06-07 LOGIN-05 认证页组旧登录资料清理

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| LOGIN-05A | P0 | 5m | 1 | DONE | 恢复 Codex/ByteRover 项目记忆，确认当前源码与 3000 运行页已无快捷登录 UI，但旧构建缓存仍残留历史实现 |
| LOGIN-05B | P0 | 10m | 1 | DONE | 新增认证页组布局，统一清理旧 `jiesong_quick_login_profile`，且不新增任何登录入口 |
| LOGIN-05C | P1 | 10m | 1 | DONE | 增加认证页组清理测试，并复跑登录页、注册页目标测试与目标 lint |
| LOGIN-05D | P1 | 10m | 1 | DONE | 清理前端编译缓存，确认 3000 端口重新编译到新认证页组布局且无 3002 临时实例 |
| LOGIN-05E | P1 | 10m | 1 | DONE | 用浏览器预置旧缓存验证登录页和注册页均清空旧资料，旧文案/旧按钮可见命中数为 0 |

## 2026-06-07 PERF-API-03 非读接口守卫路径 SLA

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| PERF-API-03A | P0 | 5m | 1 | DONE | 恢复性能目标上下文，读取剩余非读路由清单和当前工作区状态 |
| PERF-API-03B | P0 | 15m | 1 | DONE | 设计非破坏性 guard-path allowlist，覆盖缺字段、缺文件、缺资源、未授权等本地守卫路径 |
| PERF-API-03C | P0 | 15m | 1 | DONE | 新增 `scripts/audit_api_non_read_guard_times.js` 并输出 JSON/Markdown 证据 |
| PERF-API-03D | P1 | 10m | 1 | DONE | 将 guard-path 结果接入 `scripts/audit_api_route_inventory.js` 的覆盖来源 |
| PERF-API-03E | P0 | 10m | 1 | DONE | 修复三表导出查询不存在 `currency` 字段导致的 500，并补服务测试 |
| PERF-API-03F | P1 | 10m | 1 | DONE | 在当前代码临时后端 `3012` 复跑 guard 巡检和路由覆盖清单，确认覆盖提升到 `173/265` |
| PERF-API-03G | P1 | 20m | 1 | TODO | 为剩余 `92` 条成功路径设计测试库夹具，优先处理写接口中有强验证和可回滚的模块 |

## 2026-06-07 PERF-API-02 读接口覆盖闭环与附件列表修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| PERF-API-02A | P0 | 5m | 1 | DONE | 恢复性能目标上下文，确认当前未提交改动集中在巡检脚本和附件列表后端修复 |
| PERF-API-02B | P0 | 10m | 1 | DONE | 修复路由覆盖清单的动态路由匹配，避免 `:id` 路由被误判未覆盖 |
| PERF-API-02C | P0 | 15m | 1 | DONE | 扩展读接口巡检样本，补齐 dashboard track、finance statement、bank reconciliation、HS detail、合同附件等读取路径 |
| PERF-API-02D | P0 | 10m | 1 | DONE | 修复 `/api/v1/contracts/:contractId/files` 的参数校验和 Prisma client 导入错误 |
| PERF-API-02E | P1 | 10m | 1 | DONE | 为 `fileService.listFiles` 增加采购/销售附件列表单元测试 |
| PERF-API-02F | P1 | 15m | 1 | DONE | 复跑 123 个接口响应样本和 265 条路由覆盖清单，确认普通读接口 `114/114` 全覆盖且 0 个超过 2 秒 |
| PERF-API-02G | P1 | 10m | 1 | TODO | 设计写接口、导入/导出、AI 外部调用的测试库夹具和分层 SLA，不污染当前业务库 |

## 2026-06-07 LOGIN-04 移除硬编码快捷登录入口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| LOGIN-04A | P0 | 5m | 1 | DONE | 恢复 Codex/ByteRover 项目记忆，确认当前工作区存在未提交性能巡检改动，需要隔离本轮登录修复 |
| LOGIN-04B | P0 | 10m | 1 | DONE | 定位登录页开发快捷入口仍会提交硬编码 `admin / 123456` 的实现，以及注册页目标文案当前来源 |
| LOGIN-04C | P0 | 10m | 1 | DONE | 移除登录页硬编码一键登录 UI 与 quick-login 提交流程，只保留旧缓存清理 |
| LOGIN-04D | P1 | 10m | 1 | DONE | 补充登录页和注册页反向测试，防止“快捷登录 / 一键登录 / 你已开启快捷登录”回到认证 UI |
| LOGIN-04E | P1 | 10m | 1 | DONE | 运行目标测试、目标 lint、本地页面文本检查、diff check，并记录全量类型检查既有阻断 |

## 2026-06-07 LOGIN-03 快捷登录不再复用缓存密码

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| LOGIN-03A | P0 | 5m | 1 | DONE | 恢复 Codex/ByteRover 项目记忆，并确认现有工作区里已有未提交性能基线和合同页改动 |
| LOGIN-03B | P0 | 10m | 1 | DONE | 定位登录页快捷登录读取缓存密码的 Interface，以及注册页目标文案来源 |
| LOGIN-03C | P0 | 10m | 1 | DONE | 改为进入登录页即清理旧快捷登录缓存，手动登录后不再保存密码 |
| LOGIN-03D | P0 | 10m | 1 | DONE | 更新登录页测试，覆盖旧缓存清理、手动登录不写缓存、旧快捷资料不触发自动登录 |
| LOGIN-03E | P1 | 10m | 1 | DONE | 跑认证页目标测试、目标 lint、全量类型检查和目标文案搜索 |

## 2026-06-07 PERF-API-01 接口响应基线与启动巡检降噪

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| PERF-API-01A | P0 | 10m | 1 | DONE | 恢复 Codex/ByteRover 上下文，读取路由、服务和历史性能线索 |
| PERF-API-01B | P0 | 15m | 1 | DONE | 新增只读 API 响应时间巡检脚本，覆盖 110 个页面切换常用读接口样本 |
| PERF-API-01C | P0 | 10m | 1 | DONE | 复跑旧进程和新代码临时后端基线，确认读接口当前均低于 2 秒 |
| PERF-API-01D | P1 | 10m | 1 | DONE | 将登录密码校验切换到原生 bcrypt，并验证认证相关测试 |
| PERF-API-01E | P1 | 10m | 1 | DONE | 修复开发启动巡检抢资源与 patrol 通知 metadata 写库错误 |
| PERF-API-01F | P0 | 15m | 1 | DONE | 用 Playwright 测页面导航耗时，区分 Next dev 编译、接口等待和渲染成本 |
| PERF-API-01G | P0 | 10m | 1 | DONE | 从 Express Router 生成 265 条后端路由清单，并对齐当前实测覆盖 |
| PERF-API-01H | P1 | 20m | 1 | TODO | 扩展写接口/导入导出/AI 外部调用的 SLA 分类和安全压测样本 |

## 2026-06-07 LOGIN-02 本地快捷登录缓存失效与文案修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| LOGIN-02A | P0 | 10m | 1 | DONE | 恢复 Codex/ByteRover 项目记忆，定位登录页快捷登录缓存读取和注册入口文案来源 |
| LOGIN-02B | P0 | 10m | 1 | DONE | 将快捷登录资料改为版本化读取，清理旧缓存，并为本地开发提供 `admin` 快捷入口 |
| LOGIN-02C | P0 | 10m | 1 | DONE | 去掉“你已开启快捷登录”状态文案，改为固定登录说明 |
| LOGIN-02D | P1 | 10m | 1 | DONE | 修复全量 TypeScript 中暴露的采购导出缓存配置类型阻断 |
| LOGIN-02E | P1 | 10m | 1 | DONE | 运行登录页测试、类型检查、lint、build 和本地 Playwright 页面验证 |

## 2026-06-07 WPS-IMPORT-127 瓷砖价格与剩余裁决收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-127A | P0 | 10m | 1 | DONE | 复核历史瓷砖销售价格和 `EXP2500002` 合同销售价，确认 `3.0` 不是销售价 |
| WPS-IMPORT-127B | P0 | 10m | 1 | DONE | 备份数据库后修正 Burbank 771.84 平方米瓷砖销售价，并清理同数量重复归属 |
| WPS-IMPORT-127C | P0 | 10m | 1 | DONE | 标记 `EXP2400006` 不创建报关单，标记 `PENDING-威斯敏` 为战略占位 |
| WPS-IMPORT-127D | P1 | 10m | 1 | DONE | 更新完成度审计、裁决执行计划和总关闭台账，确认 `decision_items=0` |
| WPS-IMPORT-127E | P1 | 10m | 1 | DONE | 更新 checkpoint、指标、风险、结果日志和 patch |

## 2026-06-06 LOGIN-01 域名登录点击无效修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| LOGIN-01A | P0 | 10m | 1 | DONE | 用 `xuminjie` 账号复现域名登录接口成功但页面点击未进入系统的问题 |
| LOGIN-01B | P0 | 10m | 1 | DONE | 修复登录按钮 hydration 前触发原生 GET 表单提交的问题 |
| LOGIN-01C | P1 | 10m | 1 | DONE | 部署到 VPS 并用真实域名页面验证跳转与快捷登录 |

## 2026-06-06 CI-03 GitHub 自动构建与验收修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| CI-03A | P0 | 10m | 1 | DONE | 恢复 Codex/ByteRover 项目记忆，确认 GitHub 远端日志受认证限制，并转入本地 CI 等价复现 |
| CI-03B | P0 | 20m | 1 | DONE | 修复前端单元测试中过期的搜索、导航、登录态、空状态和推荐点击断言 |
| CI-03C | P0 | 20m | 1 | DONE | 对齐 smoke/button E2E 与当前页面 Interface，并把视觉快照改为显式 opt-in |
| CI-03D | P1 | 10m | 1 | DONE | 收紧 Dependabot 分组、PR 上限、semver-major 策略和 CI Node 版本 |
| CI-03E | P1 | 15m | 1 | DONE | 完成 frontend/backend 全量验证、更新 checkpoint、沉淀结果和 patch |

## 2026-06-05 WPS-IMPORT-126 收件扫描内容级识别与候选分层

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-126A | P0 | 10m | 1 | DONE | 将收件扫描从路径命中扩展为路径加内容命中，支持常见表格和文档内容抽取 |
| WPS-IMPORT-126B | P0 | 10m | 1 | DONE | 对重叠目录去重，并把正式报关候选分为强候选、参考汇总线索和弱关键词候选 |
| WPS-IMPORT-126C | P1 | 10m | 1 | DONE | 复跑本机扫描，确认当前 0 个强正式候选、0 个 cloud 精确原件、0 个可 apply 项 |
| WPS-IMPORT-126D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-05 WPS-IMPORT-125 缺失材料本机收件扫描

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-125A | P0 | 10m | 1 | DONE | 读取收件校验包，提取 `exact_cloud_original` 与 `formal_customs_document` 扫描规则 |
| WPS-IMPORT-125B | P0 | 15m | 1 | DONE | 新增只读本机收件扫描器，识别 SHA1 精确 cloud 原件和正式报关候选 |
| WPS-IMPORT-125C | P1 | 10m | 1 | DONE | 建立默认项目收件目录并扫描 Downloads，确认当前无 ready 项 |
| WPS-IMPORT-125D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-05 WPS-IMPORT-124 缺失材料收件校验包

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-124A | P0 | 10m | 1 | DONE | 读取行动矩阵、cloud-only 探测和正式报关材料阻断报告，确认收件字段来源 |
| WPS-IMPORT-124B | P0 | 15m | 1 | DONE | 新增只读收件校验脚本，输出缺失材料验收标准、严格字段、校验命令和禁止动作 |
| WPS-IMPORT-124C | P1 | 10m | 1 | DONE | 生成 `wps_missing_evidence_intake_package.{json,csv,md}`，确认覆盖 174 行且 `ready_for_apply=0` |
| WPS-IMPORT-124D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-05 WPS-IMPORT-123 缺失项解决路径刷新

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-123A | P0 | 10m | 1 | DONE | 复跑 cloud-only 窄探测和广域本机搜索，确认 2 个目标是否已有 SHA1 精确本机副本 |
| WPS-IMPORT-123B | P0 | 10m | 1 | DONE | 复跑 PENDING-威斯敏 正式报关材料缺口复核，确认正式报关候选和完整装箱源集合 |
| WPS-IMPORT-123C | P0 | 10m | 1 | DONE | 重建完成度审计、总关闭台账和行动矩阵，确认自动可写项仍为 0 |
| WPS-IMPORT-123D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、结果日志和 patch |

## 2026-06-05 WPS-IMPORT-122 PENDING 正式化阻断报告

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-122A | P0 | 10m | 1 | DONE | 读取现库剩余 `PENDING-*` 销售、装箱和报关链路 |
| WPS-IMPORT-122B | P0 | 10m | 1 | DONE | 新增只读分类脚本，区分正式 owner 缺失、0 数量、报关引用和正式报关原件缺失 |
| WPS-IMPORT-122C | P1 | 10m | 1 | DONE | 输出 `wps_pending_formalization_blockers.{json,csv,md}`，确认 `auto_writable=0` |
| WPS-IMPORT-122D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-05 WPS-IMPORT-121 PENDING 装箱占位被正式来源覆盖清理

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-121A | P0 | 10m | 1 | DONE | 结构化比对 `PENDING-*` 装箱占位与现库正式 `EXP*` WPS 装箱来源行 |
| WPS-IMPORT-121B | P0 | 10m | 1 | DONE | 新增 dry-run/apply 脚本，只允许唯一正式来源覆盖无报关引用 PENDING 装箱占位 |
| WPS-IMPORT-121C | P0 | 10m | 1 | DONE | 备份数据库后 apply，删除 1 条 PENDING 装箱占位并把历史备注追加到正式装箱行 |
| WPS-IMPORT-121D | P1 | 10m | 1 | DONE | 重建来源覆盖、缺口明细、分层、执行计划、no-candidate blocker、总台账、行动矩阵和完成度审计 |
| WPS-IMPORT-121E | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-05 WPS-IMPORT-120 PENDING 销售占位被正式来源覆盖清理

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-120A | P0 | 10m | 1 | DONE | 结构化比对 `PENDING-*` 销售占位与现库正式 `EXP*` WPS 来源销售行 |
| WPS-IMPORT-120B | P0 | 10m | 1 | DONE | 新增 dry-run/apply 脚本，只允许唯一正式来源覆盖零价无引用 PENDING 销售占位 |
| WPS-IMPORT-120C | P0 | 10m | 1 | DONE | 备份数据库后 apply，删除 4 条 PENDING 销售占位并补齐正式销售行单位 |
| WPS-IMPORT-120D | P1 | 10m | 1 | DONE | 重建来源覆盖、缺口明细、分层、执行计划、操作性 blocker、总台账、行动矩阵和完成度审计 |
| WPS-IMPORT-120E | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-05 WPS-IMPORT-119 出货汇总销售来源 note 收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-119A | P0 | 10m | 1 | DONE | 针对 no-candidate 销售缺口，比对 `出货汇总` 同合同、同商品、同门店、同售价和数量覆盖关系 |
| WPS-IMPORT-119B | P0 | 10m | 1 | DONE | 新增 note-only dry-run/apply 脚本，支持单行精确命中和同价多行精确加总 |
| WPS-IMPORT-119C | P0 | 10m | 1 | DONE | 备份数据库后 apply，给 8 条销售明细补 `[WPS_SHIPMENT_SUMMARY_SALES_SOURCE]` 来源 note |
| WPS-IMPORT-119D | P1 | 10m | 1 | DONE | 重建来源覆盖、缺口明细、分层、no-candidate、总台账、行动矩阵和完成度审计 |
| WPS-IMPORT-119E | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-05 WPS-IMPORT-118 剩余导入行动矩阵

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-118A | P0 | 10m | 1 | DONE | 读取 `wps_remaining_closure_register.json`，把 187 行关闭条件翻译成行动线、责任输入和复跑脚本 |
| WPS-IMPORT-118B | P0 | 10m | 1 | DONE | 新增只读行动矩阵脚本，输出 `wps_remaining_action_matrix.{json,csv,md}` |
| WPS-IMPORT-118C | P1 | 10m | 1 | DONE | 校验行动矩阵总行数与关闭台账一致，修正 `quantity_conflict_same_store` 分类口径 |
| WPS-IMPORT-118D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-05 WPS-IMPORT-117 cloud-only 原件广域本机搜索

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-117A | P0 | 10m | 1 | DONE | 新增只读广域本机搜索脚本，按 cloud-only 目标文件名、大小和 SHA1 扫描常见本机目录、WPS 缓存和临时目录 |
| WPS-IMPORT-117B | P0 | 10m | 1 | DONE | 输出 `wps_cloud_only_broad_local_search.{json,csv,md}`，确认 PDF 候选 0、根目录 `出货汇总.xlsx` 同名候选 5 但精确命中 0 |
| WPS-IMPORT-117C | P0 | 10m | 1 | DONE | 复跑 cloud-only 窄探测和完成度审计，确认 `ready_to_copy_count=0`、`cloud_only_files=2` |
| WPS-IMPORT-117D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-116 剩余导入关闭总台账

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-116A | P0 | 10m | 1 | DONE | 汇总五个 DB 来源缺口分桶、剩余裁决执行方案和 cloud-only 探测报告 |
| WPS-IMPORT-116B | P0 | 10m | 1 | DONE | 新增只读总台账脚本，生成 `wps_remaining_closure_register.{json,csv,md}` |
| WPS-IMPORT-116C | P0 | 10m | 1 | DONE | 校验总台账数量与完成度审计一致：`183+2+2=187` |
| WPS-IMPORT-116D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-115 操作性历史行保留/清理关闭清单

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-115A | P0 | 10m | 1 | DONE | 复核操作性保留/清理队列与严格来源覆盖重复报告 |
| WPS-IMPORT-115B | P0 | 10m | 1 | DONE | 新增只读关闭清单脚本，区分零价、零数量、PENDING 和操作标记行 |
| WPS-IMPORT-115C | P1 | 10m | 1 | DONE | 输出 `wps_operational_retention_blockers.{json,csv,md}`，确认严格重复覆盖候选为 0 |
| WPS-IMPORT-115D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-114 正式报关材料缺口关闭清单

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-114A | P0 | 10m | 1 | DONE | 复跑 `PENDING-威斯敏` 正式报关来源缺口复核 |
| WPS-IMPORT-114B | P0 | 10m | 1 | DONE | 新增只读关闭清单脚本，区分占位父单缺正式原件和明细继承父单缺口 |
| WPS-IMPORT-114C | P1 | 10m | 1 | DONE | 输出 `wps_formal_evidence_blockers.{json,csv,md}`，确认正式报关候选为 0 |
| WPS-IMPORT-114D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-113 操作性候选冲突阻断原因分类

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-113A | P0 | 10m | 1 | DONE | 新增只读分类脚本，读取 `candidate_conflict_review=36` 的执行队列 |
| WPS-IMPORT-113B | P0 | 10m | 1 | DONE | 输出 `wps_operational_candidate_conflict_blockers.{json,csv,md}`，归因数量、零数量、门店和价格冲突 |
| WPS-IMPORT-113C | P1 | 10m | 1 | DONE | 复跑完成度审计，确认没有自动写库项 |
| WPS-IMPORT-113D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-112 no-candidate 来源缺口关闭路径归因

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-112A | P0 | 10m | 1 | DONE | 新增只读分类脚本，读取 `source_required_no_candidate=24` 的执行队列 |
| WPS-IMPORT-112B | P0 | 10m | 1 | DONE | 输出 `wps_no_candidate_source_blockers.{json,csv,md}`，归因 PENDING、商品不匹配和同合同源缺失 |
| WPS-IMPORT-112C | P1 | 10m | 1 | DONE | 复跑 cloud-only 窄探测和完成度审计，确认没有自动写库或复制项 |
| WPS-IMPORT-112D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-111 剩余候选映射阻断原因分类

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-111A | P0 | 10m | 1 | DONE | 新增只读阻断原因分类脚本，读取剩余 23 条候选映射复核项 |
| WPS-IMPORT-111B | P0 | 10m | 1 | DONE | 横向扫描是否存在多个带来源拆分行加总覆盖无来源聚合行，确认候选为 0 |
| WPS-IMPORT-111C | P1 | 10m | 1 | DONE | 输出 `wps_remaining_candidate_blockers.{json,csv,md}`，分出数量冲突、价格冲突和多候选加总价格冲突 |
| WPS-IMPORT-111D | P1 | 10m | 1 | DONE | 复跑完成度审计和 diff check，确认仍无自动可写项 |
| WPS-IMPORT-111E | P1 | 10m | 1 | DONE | 更新检查点、指标、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-110 多候选中的唯一组合门店覆盖收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-110A | P0 | 10m | 1 | DONE | 扩展组合门店别名清理脚本，允许多候选中唯一兼容组合门店来源通过 |
| WPS-IMPORT-110B | P0 | 10m | 1 | DONE | dry-run 确认 `EXP250027 / 窗帘` 2 条拆分装箱行由 `米尔皮塔、圣荷西625` 组合门店行覆盖 |
| WPS-IMPORT-110C | P0 | 10m | 1 | DONE | 备份数据库后 apply，删除 2 条无来源拆分装箱行 |
| WPS-IMPORT-110D | P1 | 10m | 1 | DONE | 顺序重建来源缺口明细、分层、候选映射、占用复核、执行队列和完成度审计 |
| WPS-IMPORT-110E | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-109 组合门店别名聚合来源收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-109A | P0 | 10m | 1 | DONE | 新增组合门店别名覆盖 dry-run/apply 脚本，识别 `圣荷西2115和625` 对 `圣荷西625` 等别名覆盖 |
| WPS-IMPORT-109B | P0 | 10m | 1 | DONE | dry-run 确认 7 条无来源拆分销售/装箱行由带 WPS 来源组合门店行覆盖 |
| WPS-IMPORT-109C | P0 | 10m | 1 | DONE | 备份数据库后 apply，删除 1 条销售行和 6 条装箱行 |
| WPS-IMPORT-109D | P1 | 10m | 1 | DONE | 顺序重建来源缺口明细、分层、候选复核、操作复核、执行队列和完成度审计 |
| WPS-IMPORT-109E | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-108 操作性缺口重复覆盖复核

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-108A | P0 | 10m | 1 | DONE | 新增只读复核脚本，检查 118 条操作性来源缺口是否被带 WPS 来源现库行严格覆盖 |
| WPS-IMPORT-108B | P0 | 10m | 1 | DONE | 输出 `wps_operational_duplicate_coverage.{json,csv,md}`，确认严格覆盖候选为 0 |
| WPS-IMPORT-108C | P1 | 10m | 1 | DONE | 识别 2 条零价/非零价近似价格冲突，作为复核项而非自动清理项 |
| WPS-IMPORT-108D | P1 | 10m | 1 | DONE | 复跑完成度审计和来源覆盖审计，确认当前仍无自动可写项 |
| WPS-IMPORT-108E | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-107 聚合门店来源覆盖销售行收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-107A | P0 | 10m | 1 | DONE | 为 5 条聚合门店占用候选新增 dry-run/apply 清理脚本 |
| WPS-IMPORT-107B | P0 | 10m | 1 | DONE | dry-run 确认 5 条无来源拆分销售行由带 WPS 来源聚合行覆盖，并合并单位字段 |
| WPS-IMPORT-107C | P0 | 10m | 1 | DONE | 备份数据库后 apply，删除 5 条拆分重复销售行 |
| WPS-IMPORT-107D | P1 | 10m | 1 | DONE | 重建来源缺口明细、分层、候选复核、执行队列和完成度审计 |
| WPS-IMPORT-107E | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-106 重复来源占用销售行收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-106A | P0 | 10m | 1 | DONE | 为 2 条同字段无引用占用复核项新增 dry-run/apply 清理脚本 |
| WPS-IMPORT-106B | P0 | 10m | 1 | DONE | dry-run 确认 2 条无来源重复销售行可由带 WPS 来源行覆盖，并合并单位字段 |
| WPS-IMPORT-106C | P0 | 10m | 1 | DONE | 备份数据库后 apply，删除 2 条重复销售行 |
| WPS-IMPORT-106D | P1 | 10m | 1 | DONE | 重建来源缺口明细、分层、候选复核、执行队列和完成度审计 |
| WPS-IMPORT-106E | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-105 候选来源占用/转移复核

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-105A | P0 | 10m | 1 | DONE | 读取 `wps_candidate_source_mapping_review.json` 和现库引用关系 |
| WPS-IMPORT-105B | P0 | 15m | 1 | DONE | 新增 `analyze_wps_candidate_source_ownership.py`，复核候选来源占用行是否有库存/报关引用 |
| WPS-IMPORT-105C | P0 | 10m | 1 | DONE | 生成 `wps_candidate_source_ownership_review.{json,csv,md}`，识别 5 条聚合占用转移候选 |
| WPS-IMPORT-105D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-104 cloud-only 日志接口线索探测

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-104A | P0 | 10m | 1 | DONE | 新增只读脱敏日志探针，读取 cloud-only 目标和 WPS 本机日志 |
| WPS-IMPORT-104B | P0 | 10m | 1 | DONE | 输出 URL host/path/query key、接口词和错误码摘要，不输出 token/cookie/日志正文 |
| WPS-IMPORT-104C | P0 | 10m | 1 | DONE | 生成 `wps_cloud_only_log_api_clues.{json,md}`，确认两个目标均无接口线索 |
| WPS-IMPORT-104D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-103 cloud-only 下载手柄探测

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-103A | P0 | 10m | 1 | DONE | 抽取两个 cloud-only 目标在 WPS metadata/cache/transfer 中的 fileId、groupId、taskId |
| WPS-IMPORT-103B | P0 | 15m | 1 | DONE | 新增 `probe_wps_cloud_only_download_handles.py`，不联网、不输出 token、不写库 |
| WPS-IMPORT-103C | P0 | 10m | 1 | DONE | 生成 `wps_cloud_only_download_handles.{json,md}` 并确认 `directly_downloadable_count=0` |
| WPS-IMPORT-103D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-102 剩余来源缺口执行队列

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-102A | P0 | 10m | 1 | DONE | 读取 199 条来源缺口分层、候选映射、操作性复核和正式报关复核报告 |
| WPS-IMPORT-102B | P0 | 15m | 1 | DONE | 新增 `build_wps_remaining_source_gap_execution_plan.py`，逐条输出必要输入、禁止动作和安全下一步 |
| WPS-IMPORT-102C | P0 | 10m | 1 | DONE | 生成 `wps_remaining_source_gap_execution_plan.{json,csv,md}`，确认 `auto_writable=0` |
| WPS-IMPORT-102D | P1 | 10m | 1 | DONE | 复跑完成度审计、来源覆盖审计和 diff check |
| WPS-IMPORT-102E | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-101 cloud-only 原件关闭工具

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-101A | P0 | 10m | 1 | DONE | 复跑 cloud-only 窄探测和 WPS 内部深探测，确认当前仍无 SHA1 精确副本 |
| WPS-IMPORT-101B | P0 | 15m | 1 | DONE | 新增 `close_wps_cloud_only_files.py`，只在 SHA1 精确匹配时复制项目源文件 |
| WPS-IMPORT-101C | P0 | 10m | 1 | DONE | 生成 `wps_cloud_only_close_plan.{json,md}`，确认 `not_ready_count=2`、`copied_count=0` |
| WPS-IMPORT-101D | P1 | 10m | 1 | DONE | 复跑完成度审计、来源覆盖审计和 diff check |
| WPS-IMPORT-101E | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-100 剩余裁决只读执行方案

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-100A | P0 | 10m | 1 | DONE | 新增只读执行方案脚本，读取剩余裁决 dossier 与现库目标行 |
| WPS-IMPORT-100B | P0 | 10m | 1 | DONE | 为 `EXP2500002 / 瓷砖` 输出保留、归属安纳汉姆、归属 Burbank、拆分 4 个分支 |
| WPS-IMPORT-100C | P0 | 10m | 1 | DONE | 为 `EXP2400006` 输出 reference-only 与正式材料后创建报关 2 个分支 |
| WPS-IMPORT-100D | P1 | 10m | 1 | DONE | 生成 `wps_remaining_decision_execution_plan.{json,csv,md}` 并确认本轮写入为 0 |
| WPS-IMPORT-100E | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、备忘录、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-99 cloud-only WPS 内部状态深探测

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-99A | P0 | 10m | 1 | DONE | 识别 WPS 云同步进程打开的本机数据库、端口和日志位置 |
| WPS-IMPORT-99B | P0 | 15m | 1 | DONE | 新增深探测脚本复核 sync/transfer/precloud/datacache/cachedata/logs |
| WPS-IMPORT-99C | P0 | 10m | 1 | DONE | 生成 `wps_cloud_only_deep_state.{json,md}`，确认没有隐藏本机下载状态 |
| WPS-IMPORT-99D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-98 剩余裁决项引用状态复核

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-98A | P0 | 10m | 1 | DONE | 复核 `EXP2500002` 与 `EXP2400006` 相关现库销售/装箱行引用关系 |
| WPS-IMPORT-98B | P0 | 10m | 1 | DONE | 增强剩余裁决 dossier，列出销售库存引用和装箱报关引用 |
| WPS-IMPORT-98C | P1 | 10m | 1 | DONE | 重新生成 `wps_remaining_decision_dossier.{json,csv,md}` |
| WPS-IMPORT-98D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-97 云端原件当前 metadata 复核

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-97A | P0 | 10m | 1 | DONE | 刷新完成度审计，确认当前自动可写项、来源缺口和 cloud-only 原件数量 |
| WPS-IMPORT-97B | P0 | 10m | 1 | DONE | 复核两个 cloud-only 目标的当前 WPS metadata 和本机候选 SHA1 |
| WPS-IMPORT-97C | P1 | 10m | 1 | DONE | 尝试打开 WPS 旧缓存触发根目录 `出货汇总.xlsx` 同步并复查 SHA1 |
| WPS-IMPORT-97D | P1 | 10m | 1 | DONE | 记录 WPS 窗口自动化限制、结果、指标、风险和 patch |

## 2026-06-04 WPS-IMPORT-96 销售别名 no-candidate 来源复核

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-96A | P0 | 10m | 1 | DONE | 从剩余 no-candidate 中筛出 13 条销售来源缺口 |
| WPS-IMPORT-96B | P0 | 15m | 1 | DONE | 新增销售别名强匹配 dry-run 脚本 |
| WPS-IMPORT-96C | P0 | 10m | 1 | DONE | 确认 `salesItemUpdates=0`，原因是源行已消费、重复源副本或无强候选 |
| WPS-IMPORT-96D | P1 | 10m | 1 | DONE | 更新检查点、指标、风险、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-95 全量装箱源漏匹配来源回填

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-95A | P0 | 10m | 1 | DONE | 从 `no_candidate_source_required=28` 中筛出全量装箱源可唯一强匹配的记录 |
| WPS-IMPORT-95B | P0 | 15m | 1 | DONE | 新增全量装箱源来源 note 回填脚本，默认 dry-run |
| WPS-IMPORT-95C | P0 | 10m | 1 | DONE | 备份数据库并应用 4 条 note-only 来源回填 |
| WPS-IMPORT-95D | P1 | 10m | 1 | DONE | 复跑来源缺口明细、分层、完成度审计和三条主 dry-run |
| WPS-IMPORT-95E | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、风险、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-94 PENDING-威斯敏正式报关来源缺口复核

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-94A | P0 | 10m | 1 | DONE | 复核 `formal_evidence_required=18` 的 DB 占位报关单和明细 |
| WPS-IMPORT-94B | P0 | 15m | 1 | DONE | 新增只读脚本比对占位报关单、WPS 装箱源集合、正式凭证候选 |
| WPS-IMPORT-94C | P0 | 10m | 1 | DONE | 生成 `wps_formal_customs_gap_review.{json,csv,md}` 并确认 `auto_writable=0` |
| WPS-IMPORT-94D | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、风险、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-93 CG2500013 采购错挂修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-93A | P0 | 10m | 1 | DONE | 用当前 PDF 运行时重新抽取 `CG2500013` 原件正文 |
| WPS-IMPORT-93B | P0 | 10m | 1 | DONE | 修正采购凭证抽取脚本，支持 PDF 文本表格明细 |
| WPS-IMPORT-93C | P0 | 10m | 1 | DONE | 新增 `CG2500013` 专用修复脚本并生成 dry-run 计划 |
| WPS-IMPORT-93D | P0 | 10m | 1 | DONE | 备份数据库并应用合同头、明细和供应商修复 |
| WPS-IMPORT-93E | P1 | 10m | 1 | DONE | 复跑采购导入、来源覆盖、完成度审计和来源分层报告 |
| WPS-IMPORT-93F | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、风险、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-92 采购别名强匹配来源回填

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-92A | P0 | 10m | 1 | DONE | 复核剩余采购来源缺口，确认只处理同合同、金额、单价、数量和商品别名强对齐子集 |
| WPS-IMPORT-92B | P0 | 15m | 1 | DONE | 新增严格采购别名来源 note 回填脚本，默认 dry-run |
| WPS-IMPORT-92C | P0 | 10m | 1 | DONE | 写库前备份数据库并应用 18 条采购明细来源 note、3 条数量/单位错位修正 |
| WPS-IMPORT-92D | P1 | 10m | 1 | DONE | 复跑 dry-run、采购导入 dry-run、来源覆盖审计和完成度审计 |
| WPS-IMPORT-92E | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、风险、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-91 零值/操作性历史来源缺口复核

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-91A | P0 | 10m | 1 | DONE | 从 `zero_or_operational_review=118` 中抽取 DB 行、候选来源和操作性标记 |
| WPS-IMPORT-91B | P0 | 15m | 1 | DONE | 新增只读脚本检查库存/报关引用并生成 verdict |
| WPS-IMPORT-91C | P0 | 10m | 1 | DONE | 生成 `wps_operational_source_gap_review.{json,csv,md}` 并确认 `auto_writable=0` |
| WPS-IMPORT-91D | P1 | 10m | 1 | DONE | 复跑完成度审计、diff check 并更新检查点、指标、风险、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-90 候选来源映射深度复核

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-90A | P0 | 10m | 1 | DONE | 从 `candidate_mapping_review=39` 中抽取候选源、DB 行和来源 note 消费情况 |
| WPS-IMPORT-90B | P0 | 15m | 1 | DONE | 新增只读脚本对比 DB 行、WPS 源行、候选源是否已挂到其他 note |
| WPS-IMPORT-90C | P0 | 10m | 1 | DONE | 生成 `wps_candidate_source_mapping_review.{json,csv,md}` 并确认 `auto_writable=0` |
| WPS-IMPORT-90D | P1 | 10m | 1 | DONE | 复跑完成度审计并更新检查点、指标、风险、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-89 来源缺口处置分层

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-89A | P0 | 10m | 1 | DONE | 按当前完成度审计确认阶段目标：自动可写项归零，剩余来源缺口只做处置分层 |
| WPS-IMPORT-89B | P0 | 15m | 1 | DONE | 新增只读 disposition 分类脚本，消费 `wps_source_gap_details.json` |
| WPS-IMPORT-89C | P0 | 10m | 1 | DONE | 生成 `wps_source_gap_disposition.{json,csv,md}` 并确认 `auto_writable=0` |
| WPS-IMPORT-89D | P1 | 10m | 1 | DONE | 复跑完成度审计并更新检查点、指标、风险、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-88 仅云端原件窄探测与同步尝试

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-88A | P0 | 10m | 1 | DONE | 新增只读窄探测脚本，只针对当前两个 cloud-only 目标反查 |
| WPS-IMPORT-88B | P0 | 10m | 1 | DONE | 扫描项目源目录、WPS 本机路径、Downloads 和 WPS cache.db 候选 |
| WPS-IMPORT-88C | P1 | 10m | 1 | DONE | 尝试打开根目录旧缓存 `出货汇总.xlsx` 触发 WPS 同步并复核 SHA1 |
| WPS-IMPORT-88D | P1 | 10m | 1 | DONE | 复跑窄探测、完成度审计、出口文件留存审计并更新检查点 |

## 2026-06-04 WPS-IMPORT-87 云端原件缺口审计口径修正

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-87A | P0 | 10m | 1 | DONE | 查清完成度审计 `cloud_only_files=1` 与出口留存审计 `cloud_only_files=2` 的口径差异 |
| WPS-IMPORT-87B | P0 | 10m | 1 | DONE | 修正完成度审计，合并主目录与根目录清单 metadata 并按 scope 输出 |
| WPS-IMPORT-87C | P1 | 10m | 1 | DONE | 修正出口留存审计摘要，增加主目录/根目录分 scope 计数 |
| WPS-IMPORT-87D | P1 | 10m | 1 | DONE | 复跑审计并更新检查点、指标、风险、结果日志和 patch |

## 2026-06-04 WPS-IMPORT-86 剩余裁决结构化证据包

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-86A | P0 | 10m | 1 | DONE | 按当前进度把阶段目标收窄为剩余裁决证据包，不再寻找无证据写库项 |
| WPS-IMPORT-86B | P0 | 15m | 1 | DONE | 新增只读脚本生成 `wps_remaining_decision_dossier.{json,csv,md}` |
| WPS-IMPORT-86C | P0 | 10m | 1 | DONE | 将 `EXP2500002 / 瓷砖` 拆成源销售、源装箱、现库行、反证和可选动作 |
| WPS-IMPORT-86D | P0 | 10m | 1 | DONE | 将 `EXP2400006` 拆成源文件、现库、保留附件、真实凭证抽取和正式编号反证 |
| WPS-IMPORT-86E | P1 | 10m | 1 | DONE | 更新脚本索引、检查点、结果日志、指标、风险和 patch |

## 2026-06-04 WPS-IMPORT-85 唯一 WPS 云端原件缺口复核

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-85A | P0 | 10m | 1 | DONE | 从完成度审计定位唯一 `cloud_only_files=1` 条目 |
| WPS-IMPORT-85B | P0 | 10m | 1 | DONE | 查验 WPS 本机缓存和项目源目录是否已有同名/同合同文件 |
| WPS-IMPORT-85C | P1 | 10m | 1 | DONE | 尝试读取 WPS 客户端状态并记录 GUI 自动化限制 |
| WPS-IMPORT-85D | P1 | 10m | 1 | DONE | 更新备忘录：该无年份路径 PDF 继续作为原件副本缺口，不写库、不冒充 |

## 2026-06-04 WPS-IMPORT-84 出口附件页面验收与运行时启动修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-84A | P0 | 10m | 1 | DONE | 按当前进度更新阶段目标：先完成出口附件页面可见/可下载闭环 |
| WPS-IMPORT-84B | P0 | 10m | 1 | DONE | 创建本地测试账号并验证登录接口 |
| WPS-IMPORT-84C | P0 | 10m | 1 | DONE | 修复后端启动巡检旧 Interface 使用并补测试 |
| WPS-IMPORT-84D | P0 | 10m | 1 | DONE | 验证销售附件列表和下载接口 |
| WPS-IMPORT-84E | P0 | 10m | 1 | DONE | 用真实前端页面登录并截图验证“源文件附件”区域 |
| WPS-IMPORT-84F | P1 | 10m | 1 | DONE | 补齐结果记录、指标、风险和 patch |

## 2026-06-03 WPS-IMPORT-83 出口合同源文件附件 Interface 与导入

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-83A | P0 | 15m | 1 | DONE | 新增 `SalesContractFile` 模型、migration 和后端附件路由 |
| WPS-IMPORT-83B | P0 | 15m | 1 | DONE | 在销售详情页新增源文件附件卡片 |
| WPS-IMPORT-83C | P0 | 15m | 1 | DONE | 新增并执行 WPS 出口源文件附件导入脚本 |
| WPS-IMPORT-83D | P1 | 15m | 1 | DONE | 扩展出口文件留存审计，确认附件记录覆盖和物理文件存在性 |
| WPS-IMPORT-83E | P1 | 15m | 1 | DONE | 跑 migration doctor、后端测试、前端 lint、销售详情页测试并更新检查点 |

## 2026-06-03 WPS-IMPORT-82 出货源文件留存审计

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-82A | P0 | 10m | 1 | DONE | 复核销售合同模型和上传目录，确认出口侧没有现成附件 Interface |
| WPS-IMPORT-82B | P0 | 15m | 1 | DONE | 新增出货源文件留存只读审计脚本，按正式 `EXP*` 合同统计覆盖 |
| WPS-IMPORT-82C | P1 | 10m | 1 | DONE | 生成 JSON/CSV/Markdown 审计包并修正占位合同口径 |
| WPS-IMPORT-82D | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、风险、结果日志和 patch |

## 2026-06-03 WPS-IMPORT-81 采购 typo 孤儿附件恢复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-81A | P0 | 10m | 1 | DONE | 复核剩余 4 个不可恢复孤儿 PDF，识别多写一个 0 的合同号候选 |
| WPS-IMPORT-81B | P0 | 10m | 1 | DONE | 扩展附件留存审计，输出 typo 可恢复候选 |
| WPS-IMPORT-81C | P0 | 10m | 1 | DONE | 备份数据库并恢复 2 条 typo PDF 附件记录 |
| WPS-IMPORT-81D | P1 | 10m | 1 | DONE | 复跑审计、恢复 dry-run 和三条业务导入 dry-run |
| WPS-IMPORT-81E | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、结果日志和 patch |

## 2026-06-03 WPS-IMPORT-80 采购物理孤儿附件恢复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-80A | P0 | 10m | 1 | DONE | 扩展附件留存审计，区分可恢复与不可恢复物理孤儿文件 |
| WPS-IMPORT-80B | P0 | 10m | 1 | DONE | 新增物理孤儿附件恢复脚本，默认 dry-run |
| WPS-IMPORT-80C | P0 | 10m | 1 | DONE | 备份数据库并恢复 71 条强匹配 `ContractFile` 记录 |
| WPS-IMPORT-80D | P1 | 10m | 1 | DONE | 复跑审计和恢复 dry-run，确认可恢复孤儿归零 |
| WPS-IMPORT-80E | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、风险、结果日志和 patch |

## 2026-06-03 WPS-IMPORT-79 采购合同附件留存入库

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-79A | P0 | 10m | 1 | DONE | 审计 WPS 首选采购凭证、系统附件表和物理上传文件覆盖关系 |
| WPS-IMPORT-79B | P0 | 15m | 1 | DONE | 新增采购合同附件导入脚本，默认 dry-run、确定性文件名 |
| WPS-IMPORT-79C | P0 | 15m | 1 | DONE | 备份数据库并复制 186 份 WPS 首选采购凭证，创建 186 条 `ContractFile` 记录 |
| WPS-IMPORT-79D | P1 | 10m | 1 | DONE | 复跑附件导入 dry-run 和附件留存审计，确认候选归零 |
| WPS-IMPORT-79E | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、风险、结果日志和 patch |

## 2026-06-03 WPS-IMPORT-78 来源缺口逐条明细包

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-78A | P0 | 10m | 1 | DONE | 刷新采购/装箱/mismatch note-only dry-run 计划，确认无新增安全回填项 |
| WPS-IMPORT-78B | P0 | 15m | 1 | DONE | 新增来源缺口逐条明细包脚本，输出 JSON/CSV/Markdown |
| WPS-IMPORT-78C | P1 | 10m | 1 | DONE | 校验明细包总数与来源覆盖审计 `223` 对齐 |
| WPS-IMPORT-78D | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、结果日志和 patch |

## 2026-06-03 WPS-IMPORT-77 剩余来源缺口分类

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-77A | P0 | 10m | 1 | DONE | 用标准化装箱源复核 48 条装箱来源缺口，确认无安全唯一回填项 |
| WPS-IMPORT-77B | P0 | 10m | 1 | DONE | 新增剩余来源缺口分类脚本，输出 JSON/Markdown |
| WPS-IMPORT-77C | P1 | 10m | 1 | DONE | 重跑来源覆盖、完成度审计、裁决包和三条导入 dry-run |
| WPS-IMPORT-77D | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、结果日志和 patch |

## 2026-06-03 WPS-IMPORT-76 采购合同号口径冲突来源 note 回填

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-76A | P0 | 10m | 1 | DONE | 用标准化销售源分析 137 条销售明细来源缺口，确认无安全唯一回填项 |
| WPS-IMPORT-76B | P0 | 10m | 1 | DONE | 新增采购合同号口径冲突来源 note 回填脚本，默认 dry-run |
| WPS-IMPORT-76C | P0 | 10m | 1 | DONE | 备份数据库并给 `CG2400019` 合同头/明细回填 mismatch 来源 note |
| WPS-IMPORT-76D | P1 | 10m | 1 | DONE | 重跑来源覆盖、完成度审计、裁决包和三条导入 dry-run |
| WPS-IMPORT-76E | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、风险、结果日志和 patch |

## 2026-06-03 WPS-IMPORT-75 占位报关单来源 note 回填

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-75A | P0 | 10m | 1 | DONE | 分析报关单来源缺口，区分正式凭证缺口与 WPS 占位来源缺口 |
| WPS-IMPORT-75B | P0 | 10m | 1 | DONE | 新增占位报关单来源 note 回填脚本，默认 dry-run |
| WPS-IMPORT-75C | P0 | 10m | 1 | DONE | 备份数据库并给 `BGP250028` 回填占位来源 note |
| WPS-IMPORT-75D | P1 | 10m | 1 | DONE | 重跑来源覆盖、完成度审计、裁决包和三条导入 dry-run |
| WPS-IMPORT-75E | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、风险、结果日志和 patch |

## 2026-06-03 WPS-IMPORT-74 装箱明细来源 note 回填

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-74A | P0 | 10m | 1 | DONE | 只读分析销售/装箱明细来源缺口，确认下一批唯一匹配对象 |
| WPS-IMPORT-74B | P0 | 10m | 1 | DONE | 新增装箱明细来源 note 回填脚本，默认 dry-run |
| WPS-IMPORT-74C | P0 | 10m | 1 | DONE | 备份数据库并回填 4 条装箱明细来源 note |
| WPS-IMPORT-74D | P1 | 10m | 1 | DONE | 重跑来源覆盖、完成度审计、裁决包和三条导入 dry-run |
| WPS-IMPORT-74E | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、风险、结果日志和 patch |

## 2026-06-03 WPS-IMPORT-73 采购明细来源 note 回填

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-73A | P0 | 10m | 1 | DONE | 新增采购明细来源 note 回填脚本，默认 dry-run |
| WPS-IMPORT-73B | P0 | 10m | 1 | DONE | 抽查回填计划，确认只追加来源 note、不改业务字段 |
| WPS-IMPORT-73C | P0 | 10m | 1 | DONE | 备份数据库并回填 87 条采购明细来源 note |
| WPS-IMPORT-73D | P1 | 10m | 1 | DONE | 重跑来源覆盖、完成度审计、裁决包和三条导入 dry-run |
| WPS-IMPORT-73E | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、风险、结果日志和 patch |

## 2026-06-03 WPS-IMPORT-72 合同头来源 note 回填与数据库来源覆盖审计

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-72A | P0 | 10m | 1 | DONE | 新增已入库 WPS 来源覆盖审计，统计各表 note 来源缺口 |
| WPS-IMPORT-72B | P0 | 10m | 1 | DONE | 新增合同头来源 note 回填脚本，默认 dry-run |
| WPS-IMPORT-72C | P0 | 10m | 1 | DONE | 备份数据库并只回填出口/采购合同头来源 note |
| WPS-IMPORT-72D | P1 | 10m | 1 | DONE | 重跑来源覆盖、完成度审计和导入 dry-run |
| WPS-IMPORT-72E | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、风险、结果日志和 patch |

## 2026-06-03 WPS-IMPORT-71 完成度审计与剩余阻断归档

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-71A | P0 | 10m | 1 | DONE | 复核当前裁决包、旧粗粒度差异报告和三条导入计划输出 |
| WPS-IMPORT-71B | P0 | 10m | 1 | DONE | 新增只读完成度审计脚本，汇总自动可写项、裁决项和云端原件缺口 |
| WPS-IMPORT-71C | P1 | 10m | 1 | DONE | 生成 `wps_import_completion_audit.json/md` 并修正待裁决字段渲染 |
| WPS-IMPORT-71D | P1 | 10m | 1 | DONE | 更新检查点、备忘录、指标、风险、结果日志和 patch |

## 2026-06-03 WPS-IMPORT-70 WPS 索引刷新与凭证运行时校验

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-70A | P0 | 10m | 1 | DONE | 刷新全量 `11-报关记录` WPS 云端索引并复制可用正文 |
| WPS-IMPORT-70B | P0 | 10m | 1 | DONE | 重跑附件盘点、采购抽取和出口源分析，确认无新增可自动导入项 |
| WPS-IMPORT-70C | P0 | 10m | 1 | DONE | 用 Codex Python 重跑真实凭证抽取，修正系统 Python 缺 PDF 依赖导致的假 `empty_text` |
| WPS-IMPORT-70D | P1 | 10m | 1 | DONE | 重跑出口源、采购、真实凭证导入 dry-run 和裁决包 |
| WPS-IMPORT-70E | P1 | 10m | 1 | DONE | 更新检查点、待裁决备忘录、风险、结果日志和 patch |

## 2026-06-03 WPS-IMPORT-69 EXP2500001 错挂来源收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-69A | P0 | 10m | 1 | DONE | 复核 `EXP2500001 / 冷冻肉切片机` 两条候选装箱行完整字段和来源 note |
| WPS-IMPORT-69B | P0 | 10m | 1 | DONE | 扩展装箱去重脚本，支持只移除字段冲突的错挂来源 note |
| WPS-IMPORT-69C | P0 | 10m | 1 | DONE | 备份数据库并移除 `南常` 行上的 `出货汇总(1):56` 错挂来源 |
| WPS-IMPORT-69D | P1 | 10m | 1 | DONE | 重跑导入 dry-run、裁决包、清理脚本和凭证导入 dry-run |
| WPS-IMPORT-69E | P1 | 10m | 1 | DONE | 更新待裁决备忘录、指标、风险、结果和 patch |

## 2026-06-03 WPS-IMPORT-68 EXP250027 混合门店拆分收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-68A | P0 | 10m | 1 | DONE | 复核 `EXP250027 / 窗帘` 源装箱行，确认 `31+35=66` 的文件正文证据 |
| WPS-IMPORT-68B | P0 | 10m | 1 | DONE | 收紧组合门店创建规则，只允许有真实现有港口的源组合门店自动创建 |
| WPS-IMPORT-68C | P0 | 10m | 1 | DONE | 导入 `米尔皮塔、圣荷西625` 组合门店装箱行，并按装箱数量拆分销售行 |
| WPS-IMPORT-68D | P0 | 10m | 1 | DONE | 删除已被同源拆分销售行覆盖的旧路径门店销售行 |
| WPS-IMPORT-68E | P1 | 10m | 1 | DONE | 跑幂等回归并更新待裁决备忘录、风险、指标和结果日志 |

## 2026-06-03 旧 XLS 报关底稿可读化复核

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-33A | P0 | 10m | 1 | DONE | 复用前端 `xlsx` 依赖读取旧 OLE2/BIFF `.xls` 报关底稿 |
| WPS-IMPORT-33B | P0 | 10m | 1 | DONE | 重跑真实凭证抽取，确认旧 `.xls` 从 `empty_text` 变成 `needs_review` |
| WPS-IMPORT-33C | P0 | 10m | 1 | DONE | 复跑真实凭证、出口源和采购导入 dry-run，确认没有新增写库项 |
| WPS-IMPORT-33D | P1 | 10m | 1 | DONE | 更新待裁决包、业务备忘录和检查点 |

## 2026-06-02 WPS 云端合同正文回收与采购补导入

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-29A | P0 | 15m | 1 | DONE | 通过 WPS 客户端触发 2026 年 3/4/5 月云端采购合同正文下载 |
| WPS-IMPORT-29B | P0 | 10m | 1 | DONE | 修正 WPS 云端索引盘点，识别 SHA1、本机直路径和项目源目录已存在文件 |
| WPS-IMPORT-29C | P0 | 10m | 1 | DONE | 重跑附件盘点、采购抽取、出口源分析和导入 dry-run |
| WPS-IMPORT-29D | P0 | 10m | 1 | DONE | 备份数据库并导入 16 份可证明采购合同和明细 |
| WPS-IMPORT-29E | P1 | 10m | 1 | DONE | 核对出货汇总 Excel 是否写明缺失采购合同乙方，并更新备忘录/检查点 |

## 2026-06-02 WPS 云盘 2026 年 4/5 月补导入

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-25A | P0 | 10m | 1 | DONE | 同步已缓存的 WPS 云盘 2026 年 4/5 月出货/采购源文件 |
| WPS-IMPORT-25B | P0 | 15m | 1 | DONE | 修正装箱源选择规则并新增缺失 EXP 合同头创建 Interface |
| WPS-IMPORT-25C | P0 | 10m | 1 | DONE | 导入 `EXP260005/006/007` 合同头、装箱和销售明细 |
| WPS-IMPORT-25D | P0 | 10m | 1 | DONE | 导入 `CG2600036` 采购合同和明细 |
| WPS-IMPORT-25E | P1 | 10m | 1 | DONE | 运行幂等校验并更新备忘录/检查点 |
| WPS-IMPORT-26A | P0 | 10m | 1 | DONE | 新增 WPS 云端索引只读盘点脚本 |
| WPS-IMPORT-26B | P0 | 10m | 1 | DONE | 固化 2026 年 4/5 月云端文件缓存状态并复制已缓存文件 |
| WPS-IMPORT-26C | P0 | 10m | 1 | DONE | 重跑采购抽取和导入 dry-run，确认无新增可写库合同 |
| WPS-IMPORT-26D | P1 | 10m | 1 | DONE | 更新待裁决备忘录、风险、指标和检查点 |
| WPS-IMPORT-27A | P0 | 10m | 1 | DONE | 全量盘点 `11-报关记录` 云端索引并复制所有已缓存文件 |
| WPS-IMPORT-27B | P0 | 10m | 1 | DONE | 保留 WPS 根目录 `出货汇总.xlsx` 与 `装货清单.xlsx` 作为 `_wps_cloud_root` 证据源 |
| WPS-IMPORT-27C | P0 | 15m | 1 | DONE | 基于根目录 `出货汇总.xlsx` 补导入可证明装箱/销售/合同汇总字段 |
| WPS-IMPORT-27D | P1 | 10m | 1 | DONE | 复跑幂等校验并更新待裁决包/检查点 |
| WPS-IMPORT-28A | P0 | 10m | 1 | DONE | 修正 WPS 云端索引盘点，回查团队文档本机直路径 |
| WPS-IMPORT-28B | P0 | 10m | 1 | DONE | 重跑全量 `11-报关记录` 复制，找回 3 个直路径文件 |
| WPS-IMPORT-28C | P0 | 10m | 1 | DONE | 重跑采购抽取、出口分析和导入 dry-run |
| WPS-IMPORT-28D | P1 | 10m | 1 | DONE | 更新待裁决备忘录、风险、指标和检查点 |

## 2026-04-05 Migration Health 诊断输出

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-110 | P0 | 10m | 1 | DONE | 新增 `prismaMigrationHealthService` 构建 migration health report |
| AGENT-V2-GOV-111 | P0 | 10m | 1 | DONE | 新增 `db:migrate:doctor` 诊断脚本 |
| AGENT-V2-GOV-112 | P1 | 10m | 1 | DONE | 更新测试并验证 doctor 输出 |

## 2026-04-05 Prisma Migration 状态修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-107 | P0 | 15m | 1 | DONE | 新增 `prismaMigrationRepairService`，识别 schema 已生效但状态未收口的 migration |
| AGENT-V2-GOV-108 | P0 | 10m | 1 | DONE | 新增 `db:migrate:repair` 脚本并实际修复 `_prisma_migrations` |
| AGENT-V2-GOV-109 | P1 | 10m | 1 | DONE | 验证 `migrate status` / `migrate deploy` 恢复正常并更新 checkpoint |

## 2026-04-05 回放摘要服务层收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-104 | P0 | 10m | 1 | DONE | 新增 `agentReplaySummaryService` 承接 replay summary record / upsert / map 构建 |
| AGENT-V2-GOV-105 | P0 | 10m | 1 | DONE | `openAgentService` / `aiController` 改为统一消费该 service |
| AGENT-V2-GOV-106 | P1 | 10m | 1 | DONE | 更新后端 service 测试与 checkpoint |

## 2026-04-05 独立回放摘要模型

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-100 | P0 | 15m | 1 | DONE | 在 Prisma schema 中新增 `AgentReplaySummary` 模型与 migration |
| AGENT-V2-GOV-101 | P0 | 10m | 1 | DONE | `openAgentService` 写时 upsert 独立 replay summary |
| AGENT-V2-GOV-102 | P0 | 10m | 1 | DONE | `aiController` 读时优先查询 `AgentReplaySummary`，前端补 `回放摘要` 来源 |
| AGENT-V2-GOV-103 | P1 | 10m | 1 | DONE | 更新 controller/service/UI 测试、迁移执行与 checkpoint |

## 2026-04-05 专用回放快照源

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-96 | P0 | 10m | 1 | DONE | `openAgentService` 写入专用 `AGENT_REPLAY_SNAPSHOT` 日志载荷 |
| AGENT-V2-GOV-97 | P0 | 10m | 1 | DONE | `aiController` 优先从 `AGENT_REPLAY_SNAPSHOT` 恢复 replay baseline |
| AGENT-V2-GOV-98 | P0 | 10m | 1 | DONE | 前端来源说明补齐 `回放快照` / `回放快照 + 操作日志` |
| AGENT-V2-GOV-99 | P1 | 10m | 1 | DONE | 更新 eventLedger/controller/service/UI 测试与 checkpoint |

## 2026-04-05 运行日志回放画像回退源

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-92 | P0 | 10m | 1 | DONE | `governanceReplayService` 支持外部 persisted profile fallback |
| AGENT-V2-GOV-93 | P0 | 10m | 1 | DONE | `aiController` 从 `AGENT_RUN` 日志提取 replay profile 作为回退源 |
| AGENT-V2-GOV-94 | P0 | 10m | 1 | DONE | 前端来源说明补齐 `运行日志` / `运行日志 + 操作日志` |
| AGENT-V2-GOV-95 | P1 | 10m | 1 | DONE | 更新 controller/service/UI 测试与 checkpoint |

## 2026-04-05 基础回放画像持久化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-88 | P0 | 15m | 1 | DONE | `openAgentService` 写时持久化基础 `governanceReplayProfile` |
| AGENT-V2-GOV-89 | P0 | 10m | 1 | DONE | `aiController` 读时解析并复用 metadata 中的 persisted profile |
| AGENT-V2-GOV-90 | P0 | 10m | 1 | DONE | `governanceReplayService` 优先消费 persisted profile，再做运行时 evidence 增强 |
| AGENT-V2-GOV-91 | P1 | 10m | 1 | DONE | 更新 openAgent/controller/service 测试、前端回归与 checkpoint |

## 2026-04-05 回放证据显式化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-85 | P0 | 10m | 1 | DONE | 在 `governanceReplayProfile` 中增加 replay evidence 计数字段 |
| AGENT-V2-GOV-86 | P0 | 10m | 1 | DONE | 前端头部增加 `操作日志证据 X` badge |
| AGENT-V2-GOV-87 | P1 | 10m | 1 | DONE | 更新 service/controller/UI 测试与 checkpoint |

## 2026-04-05 操作日志增强回放来源

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-81 | P0 | 10m | 1 | DONE | 在 `governanceReplayService` 识别 pending-action lifecycle 的 operation-log 证据 |
| AGENT-V2-GOV-82 | P0 | 10m | 1 | DONE | `aiController` 改为 merge 动作时间线后再构建 replay profile |
| AGENT-V2-GOV-83 | P0 | 10m | 1 | DONE | 前端来源说明升级为 `回放来源：会话元数据 + 操作日志` |
| AGENT-V2-GOV-84 | P1 | 10m | 1 | DONE | 更新 service/controller/UI 测试与 checkpoint |

## 2026-04-05 回放分类器服务化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-77 | P0 | 15m | 1 | DONE | 新增 `governanceReplayService`，统一构建 replay profile |
| AGENT-V2-GOV-78 | P0 | 10m | 1 | DONE | `aiController` 改为消费统一 `governanceReplayProfile` 并保持平铺字段兼容 |
| AGENT-V2-GOV-79 | P0 | 10m | 1 | DONE | 前端列表页优先消费 `governanceReplayProfile`，不再依赖散落 replay 字段 |
| AGENT-V2-GOV-80 | P1 | 10m | 1 | DONE | 更新后端 service/controller 测试、前端回归与 checkpoint |

## 2026-04-05 回放来源显式化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-74 | P0 | 10m | 1 | DONE | 在 controller 显式计算并返回 `governanceReplaySource` |
| AGENT-V2-GOV-75 | P0 | 10m | 1 | DONE | 前端接入并显示 `回放来源：会话元数据` |
| AGENT-V2-GOV-76 | P1 | 10m | 1 | DONE | 更新前后端测试与 checkpoint |

## 2026-04-04 回放级别显式化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-70 | P0 | 10m | 1 | DONE | 在 controller 显式计算并返回 `governanceReplayLevel` |
| AGENT-V2-GOV-71 | P0 | 10m | 1 | DONE | 前端接入并显示 `回放级别：工具层/建议层/动作层` |
| AGENT-V2-GOV-72 | P0 | 10m | 1 | DONE | 在会话行/移动卡片增加 `工具层回放 / 建议层回放 / 动作层回放` badge |
| AGENT-V2-GOV-73 | P1 | 10m | 1 | DONE | 更新前后端测试与 checkpoint |

## 2026-04-04 回放能力摘要显式化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-67 | P0 | 10m | 1 | DONE | 在 controller 显式下发 `governanceReplaySummary` |
| AGENT-V2-GOV-68 | P0 | 10m | 1 | DONE | 前端接入并渲染 `工具回放 / 建议回放 / 动作回放` badge |
| AGENT-V2-GOV-69 | P1 | 10m | 1 | DONE | 更新前后端测试与 checkpoint |

## 2026-04-04 审计回放状态显式化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-64 | P0 | 10m | 1 | DONE | 在 `getSessions / getChatHistory` 显式下发 `governanceReplayAvailable` |
| AGENT-V2-GOV-65 | P0 | 10m | 1 | DONE | 前端 service 和列表页切到消费显式 provenance 字段 |
| AGENT-V2-GOV-66 | P1 | 10m | 1 | DONE | 更新前后端测试与 checkpoint |

## 2026-04-04 自动治理视角不写 URL

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-59 | P0 | 10m | 1 | DONE | 阻止 `auto` 来源治理状态回写 URL query |
| AGENT-V2-GOV-60 | P0 | 10m | 1 | DONE | 对齐自动失败视角与待处理 chip 的回归测试口径 |
| AGENT-V2-GOV-61 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 治理视角来源提示

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-56 | P0 | 10m | 1 | DONE | 为治理视角增加来源提示，覆盖自动失败视角 |
| AGENT-V2-GOV-57 | P0 | 10m | 1 | DONE | 为手动接管后的视角增加显式来源说明 |
| AGENT-V2-GOV-58 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 风险排序显式提示

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-53 | P0 | 10m | 1 | DONE | 在 `risk` 模式下显式显示“当前：超时优先风险排序” |
| AGENT-V2-GOV-54 | P0 | 10m | 1 | DONE | 为默认排序补简短顺序说明，减少用户猜测成本 |
| AGENT-V2-GOV-55 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 自动治理视角不污染偏好

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-50 | P0 | 10m | 1 | DONE | 定位自动失败视角覆盖 localStorage 偏好的根因 |
| AGENT-V2-GOV-51 | P0 | 10m | 1 | DONE | 阻止 `auto` 来源治理状态写回本地偏好 |
| AGENT-V2-GOV-52 | P1 | 10m | 1 | DONE | 补本地偏好回归测试与 checkpoint |

## 2026-04-04 超时优先风险排序

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-47 | P0 | 10m | 1 | DONE | 将默认风险排序升级成“超时失败 > 超时待确认 > 普通失败 > 普通待确认” |
| AGENT-V2-GOV-48 | P0 | 10m | 1 | DONE | 保持 `latest-action / latest-message` 排序不受老化规则影响 |
| AGENT-V2-GOV-49 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 摘要条超时聚合徽标

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-44 | P0 | 10m | 1 | DONE | 在值班摘要中增加 `超时失败 X` 聚合徽标 |
| AGENT-V2-GOV-45 | P0 | 10m | 1 | DONE | 在值班摘要中增加 `超时待确认 Y` 聚合徽标 |
| AGENT-V2-GOV-46 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 摘要条老化升级提示

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-41 | P0 | 10m | 1 | DONE | 为失败动作摘要增加“超过 4 小时未处理”老化提示 |
| AGENT-V2-GOV-42 | P0 | 10m | 1 | DONE | 为待确认摘要增加“挂起超过 2 小时”老化提示 |
| AGENT-V2-GOV-43 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 顶部值班摘要条

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-38 | P0 | 10m | 1 | DONE | 在 AI 会话列表顶部新增值班摘要 Alert |
| AGENT-V2-GOV-39 | P0 | 10m | 1 | DONE | 按失败/待确认/已收口三种状态切换摘要文案、样式与快捷入口 |
| AGENT-V2-GOV-40 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 会话级 SLA 与值班提示

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-35 | P0 | 10m | 1 | DONE | 在会话列表行补 `SLA P1 / P2 / P3` 严重度徽标 |
| AGENT-V2-GOV-36 | P0 | 10m | 1 | DONE | 在桌面表格和移动卡片补 `需立即处理 / 待人工确认 / 已闭环` 值班提示 |
| AGENT-V2-GOV-37 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 治理预设 Sticky 控制条

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-33 | P0 | 10m | 1 | DONE | 将顶部治理预设改成 sticky 控制条 |
| AGENT-V2-GOV-34 | P1 | 10m | 1 | DONE | 为 sticky 容器和激活态补测试 |

## 2026-04-04 排序/筛选 URL 持久化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-30 | P0 | 15m | 1 | DONE | 从 URL 恢复 `sort` 与 `actionFilter` 初始状态 |
| AGENT-V2-GOV-31 | P0 | 15m | 1 | DONE | 在切换排序/筛选时回写 query，并保持默认值不落 URL |
| AGENT-V2-GOV-32 | P1 | 10m | 1 | DONE | 更新测试与 checkpoint |

## 2026-04-04 列表层可切换排序

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-27 | P0 | 15m | 1 | DONE | 增加 `排序方式` 控件：风险优先 / 最近动作 / 最近消息 |
| AGENT-V2-GOV-28 | P0 | 10m | 1 | DONE | 让排序方式与动作筛选同时生效 |
| AGENT-V2-GOV-29 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 列表层动作排序与筛选

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-24 | P0 | 15m | 1 | DONE | 在会话列表按动作风险优先级排序 |
| AGENT-V2-GOV-25 | P0 | 15m | 1 | DONE | 增加 `全部 / 有失败 / 有待确认 / 已完成动作` 筛选 |
| AGENT-V2-GOV-26 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 列表层失败高亮与最近动作时间

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-21 | P0 | 10m | 1 | DONE | 在列表层显示失败动作风险信号 |
| AGENT-V2-GOV-22 | P0 | 10m | 1 | DONE | 在列表层显示最近动作时间 |
| AGENT-V2-GOV-23 | P1 | 10m | 1 | DONE | 更新测试与 checkpoint |

## 2026-04-04 列表层失败高亮与最近动作时间

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-18 | P0 | 15m | 1 | DONE | 在会话列表中高亮失败动作风险 |
| AGENT-V2-GOV-19 | P0 | 10m | 1 | DONE | 在会话列表显示最近动作时间 |
| AGENT-V2-GOV-20 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 列表层动作状态汇总

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-15 | P0 | 15m | 1 | DONE | 在 AI sessions 桌面表格中显示动作状态汇总 |
| AGENT-V2-GOV-16 | P0 | 10m | 1 | DONE | 在移动端会话卡片中显示相同的动作状态汇总 |
| AGENT-V2-GOV-17 | P1 | 10m | 1 | DONE | 更新前端测试与 checkpoint |

## 2026-04-04 待确认动作生命周期时间线

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-12 | P0 | 20m | 1 | DONE | 在 controller 中为 `pendingActionSummary` 组装 `created -> final-state` 时间线 |
| AGENT-V2-GOV-13 | P0 | 15m | 1 | DONE | 在 AI sessions 详情中展示动作时间线与事件时间 |
| AGENT-V2-GOV-14 | P1 | 10m | 1 | DONE | 更新 checkpoint 与 progress，记录 lifecycle timeline 已落地 |

## 2026-04-04 待确认动作最终态回放

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-09 | P0 | 20m | 1 | DONE | 为 `AGENT_WRITE_CANCEL / AGENT_WRITE_FAILED` 补日志落点，并在执行日志中写入 `status/detail/sessionId` |
| AGENT-V2-GOV-10 | P0 | 20m | 1 | DONE | 在 `getSessions / getChatHistory` 中用 `OperationLog` 覆盖 `pendingActionSummary` 最终态 |
| AGENT-V2-GOV-11 | P1 | 15m | 1 | DONE | 在 AI sessions 详情中展示待确认动作的最终状态与结果说明，并更新 checkpoint |

## 2026-04-04 确认执行链治理回放补齐

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-06 | P0 | 15m | 1 | DONE | 在 `persistAgentRun` 中持久化 `pendingActionSummary`，让待确认动作能随会话回放 |
| AGENT-V2-GOV-07 | P0 | 15m | 1 | DONE | 为 `getSessions / getChatHistory` 补 `pendingActionSummary` 返回与后端测试 |
| AGENT-V2-GOV-08 | P1 | 15m | 1 | DONE | 在 AI sessions 详情中展示“待确认动作”回放，并更新 checkpoint |

## 2026-04-04 财务高置信挂账建议闭环

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-FIN-01 | P0 | 20m | 1 | DONE | 在 `DiagnoseSalesContractFlow` 中识别唯一高置信待分配收款，并升级为 `AllocatePayment` 建议 |
| AGENT-V2-FIN-02 | P0 | 10m | 1 | DONE | 为“多命中保持 manual，避免误挂账”补测试护栏 |
| AGENT-V2-FIN-03 | P1 | 10m | 1 | DONE | 更新 `PLAN.md / TASKS.md / RISKS.md / METRICS.md / task_plan.md / progress.md` checkpoint |

## 2026-04-04 诊断建议进入确认执行链

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-CLOSE-01 | P0 | 25m | 1 | DONE | 为税退链路新增 `CreateCustomsDeclarationDraft / CreateForexVerificationDraft / CreateTaxRefundDraft` 三个受控写工具与 executor |
| AGENT-V2-CLOSE-02 | P0 | 20m | 1 | DONE | 将组合诊断中的少量高价值建议升级为 `confirmable_write`，并在 runtime 内自动物化成 `pendingActions` |
| AGENT-V2-CLOSE-03 | P1 | 15m | 1 | DONE | 在 `AIAssistant` 实时消息中展示 `actionRecommendations`，让建议与待确认动作同屏可见并补测试/checkpoint |

## 2026-04-04 组合诊断建议闭环可见化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-ACT-01 | P0 | 25m | 1 | DONE | 为三类组合诊断工具补结构化 `recommendedActions`，把 blocker/next step 升级为正式建议对象 |
| AGENT-V2-ACT-02 | P0 | 20m | 1 | DONE | 在 runtime 执行层收集复合诊断建议，并沿 `ChatHistory / OperationLog` metadata 持久化到会话治理面 |
| AGENT-V2-ACT-03 | P1 | 20m | 1 | DONE | 在 AI 会话页展示推荐动作回放和建议数量，并补后端/前端定向测试与 checkpoint |

## 2026-04-04 组合型任务工具深化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-TOOL-01 | P0 | 35m | 1 | DONE | 为 unified runtime 新增 `DiagnoseSalesContractFlow / DiagnosePurchaseExecution / DiagnoseTradeComplianceReadiness` 三个组合型诊断工具 |
| AGENT-V2-TOOL-02 | P0 | 20m | 1 | DONE | 为 tool registry 增加 `isComposite` 与域级 `compositeToolCount`，区分基础工具与复合任务工具 |
| AGENT-V2-TOOL-03 | P1 | 20m | 1 | DONE | 在 AI 会话页展示域描述与复合工具数量，并补对应后端/前端测试与 checkpoint |

## 2026-04-04 Tool Registry 治理面接通

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-GOV-01 | P0 | 15m | 1 | DONE | 暴露 `GET /api/v1/ai/agents/tools`，让通用主 Agent 的工具注册表成为正式接口 |
| AGENT-V2-GOV-02 | P0 | 20m | 1 | DONE | 为 frontend `aiService` 增加 tool registry 调用，并在 AI 会话页展示主入口、读/写工具数与覆盖域数 |
| AGENT-V2-GOV-03 | P1 | 10m | 1 | DONE | 同步台账，记录 tool registry 已成为可见治理面 |
| AGENT-V2-GOV-04 | P1 | 15m | 1 | DONE | 在 AI 会话详情中展示 `toolTraceSummary.items`，把工具调用回放推进到可见层 |
| AGENT-V2-GOV-05 | P1 | 10m | 1 | DONE | 让 tool registry 成为 role-aware 治理面，展示当前角色和按域可用工具数量 |

## 2026-04-04 Universal Agent 深写能力接入

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-WRITE-01 | P0 | 30m | 1 | DONE | 扩通用主 Agent 写工具到供应商新建/更新、采购合同新建/更新、库存状态更新 |
| AGENT-V2-WRITE-02 | P0 | 20m | 1 | DONE | 为写工具补 `allowedRoles` 元数据，并在 runtime 内显式校验角色 |
| AGENT-V2-WRITE-03 | P1 | 10m | 1 | DONE | 同步 `task_plan.md / progress.md / PLAN.md / TASKS.md`，记录深写能力接入与剩余测试风险 |

## 2026-04-04 Universal Agent V2 可观测性接通

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-OBS-01 | P0 | 20m | 1 | DONE | 为 unified runtime 注入 internal specialist frame，并把 routePlan 作为统一 prompt 的内部路由上下文 |
| AGENT-V2-OBS-02 | P0 | 30m | 1 | DONE | 让 `getSessions / getChatHistory` 返回 routeMode、domainsTouched、toolsUsed 等 route metadata |
| AGENT-V2-OBS-03 | P0 | 25m | 1 | DONE | 在 AI 会话页显示 routeMode/工具域摘要，并在详情弹窗展示 routePlan 和 tools 数量 |
| AGENT-V2-OBS-04 | P0 | 30m | 1 | DONE | 扩通用事实工具到合同详情、财务风险、低库存、税退详情等更深层查询 |
| AGENT-V2-OBS-05 | P0 | 20m | 1 | DONE | 将工具调用明细汇总为 `toolTraceSummary`，写入 Agent metadata 与 `AGENT_RUN` 事件台账 |

## 2026-04-04 Universal Agent Runtime V2 实施起步

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-IMP-01 | P0 | 30m | 1 | DONE | 在 `openAgentService` 中明确 `unified` 为主公开入口，并将 legacy preset 标记为内部兼容态 |
| AGENT-V2-IMP-02 | P0 | 45m | 1 | DONE | 落第一版 tool registry，统一输出工具 metadata（domain/access/confirmationRequired） |
| AGENT-V2-IMP-03 | P0 | 45m | 1 | DONE | 接入首批跨域读工具：统一搜索、库存概览、税退链路概览、最近事件 |
| AGENT-V2-IMP-04 | P0 | 30m | 1 | DONE | 落轻量内部路由：按消息内容判断 focused/cross-domain/broad/legacy-explicit，并据此裁剪工具域 |
| AGENT-V2-IMP-05 | P1 | 15m | 1 | DONE | 为 V2 起步实现补后端定向测试与 checkpoint 台账 |

## 2026-04-04 Universal Agent Runtime V2 方案定稿

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-V2-PLAN-01 | P0 | 30m | 1 | DONE | 输出通用主 Agent 方案：统一对外入口、内部工具域/路由、tool-first 感知、确认门写操作 |
| AGENT-V2-PLAN-02 | P0 | 10m | 1 | DONE | 更新 `docs/README.md`、`PLAN.md`、`TASKS.md`，把 Universal Agent Runtime V2 纳入正式执行台账 |

## 2026-04-04 Agent 剩余扫尾：旧路径排查 + 权限口径对齐

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-DOC-04 | P0 | 10m | 1 | DONE | 全仓扫描旧 `/ai/chat-history` 运行时调用，确认残留仅在历史修复说明文档中 |
| AGENT-DOC-05 | P0 | 20m | 1 | DONE | 更新 About 页和 Agent 弹窗文案，统一为“固定能力集自动附加、暂不支持逐项勾选” |
| AGENT-DOC-06 | P1 | 15m | 1 | DONE | 更新 `docs/plans/2026-03-29-agent-cli-mcp-ready-design.md`，补当前实现状态说明并记录与目标架构的差异 |

## 2026-04-03 Agent 状态文档校正 + 历史接口修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-DOC-01 | P0 | 15m | 1 | DONE | 为 `aiService.getChatHistory` 增加失败测试并修正 `/ai/history` 路径，恢复前后端接口一致性 |
| AGENT-DOC-02 | P0 | 20m | 1 | DONE | 更新 `task_plan.md / progress.md / docs/README.md`，把 Agent 状态从“待接入”校正为“主体已落地、剩余待收口” |
| AGENT-DOC-03 | P1 | 10m | 1 | DONE | 同步 `PLAN.md / TASKS.md` checkpoint，记录本轮 Agent 文档校正与剩余风险 |

## 2026-04-02 本地 API 304 代理链修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| API-PROXY-304-01 | P0 | 10m | 1 | DONE | 在 backend 应用入口禁用 ETag，修复 Next dev rewrite 代理下 `/api/v1/purchases` 等 JSON API 返回 304 导致页面误判失败的问题 |

## 2026-04-02 采购合同页 FileText 图标回归修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| CONTRACTS-BUG-02 | P0 | 5m | 1 | DONE | 恢复采购合同页 `FileText` 图标 import，修复合同号列表项 `FileText is not defined` 运行时错误 |

## 2026-04-02 采购合同页图标回归修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| CONTRACTS-BUG-01 | P0 | 5m | 1 | DONE | 恢复采购合同页 `Store` 图标 import，修复“合作店铺”概览卡 `Store is not defined` 运行时错误 |

## 2026-04-02 采购合同页去故事流

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| CONTRACTS-UI-01 | P1 | 15m | 1 | DONE | 删除采购合同页顶部“采购故事流”引导卡片，保留列表区入口并同步更新页面测试断言 |

## 2026-04-02 Open Agent Runtime 融合

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-RUNTIME-01 | P0 | 90m | 1 | DONE | 接入 `open-agent-sdk` 后端运行时，新增三类预置业务 agent 与 `/ai/agents/prompt` 只读执行入口 |
| AGENT-RUNTIME-02 | P0 | 60m | 1 | DONE | AIAssistant 已集成 mode tabs + agent chips + runBusinessAgent 前端调用入口 |
| AGENT-RUNTIME-03 | P1 | 90m | 1 | DONE | 确认后执行写动作工作流：AllocatePayment / UpdateExportContractStatus / CreatePaymentRecord 三个受控写工具，pendingAction 两阶段确认 |
| AGENT-RUNTIME-04 | P1 | 90m | 1 | DONE | Agent 会话/用量/写执行沉淀到事件台账：AGENT_RUN + AGENT_WRITE_EXECUTE 事件，eventLedger AGENT 分类 |
| AGENT-RUNTIME-05 | P0 | 60m | 1 | DONE | 统一入口重构：去掉 chat/agent Tab 和 Agent 选择器，合并为 unified agent 单入口；新增 UpdateSystemConfig + GetSystemConfig 工具；前端二步确认卡片 UI |
| AGENT-RUNTIME-06 | P0 | 45m | 1 | DONE | 流式输出恢复（SSE via agent.query）+ 图片上传恢复 + 消息气泡溢出修复 |
| AGENT-RUNTIME-07 | P0 | 30m | 1 | DONE | 会话历史列表：历史对话回溯、新建对话、会话切换 |
| AGENT-RUNTIME-08 | P0 | 60m | 1 | DONE | 自进化巡检基础架构：PatrolService（业务+系统巡检规则）+ PatrolJob（每小时cron）+ 通知下发 + API 路由 |

## 2026-04-02 出口合同第三方来源展示收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FIN-P0-06 | P0 | 45m | 1 | DONE | 将 `hasThirdPartyCargo / sourceParties` 暴露到出口合同列表与详情，并补齐服务层/页面回归测试 |

## 2026-04-02 客户级收款池与部分分摊

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FIN-P0-05 | P0 | 90m | 1 | DONE | 落地客户级收款池：收入记录补客户名、支持原始收款到多合同的部分分摊、收款池展示已分配/剩余额 |

## 2026-04-02 自进化闭环规划

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| EVO-PLAN-01 | P0 | 45m | 1 | DONE | 输出“观察-追溯-修复-固化”L2 闭环方案，明确分阶段架构、风险边界与 DoD |
| EVO-FND-01 | P0 | 90m | 1 | TODO | 设计统一事件模型与分类法，收口 `OperationLog / ImportRecord / ChatHistory / TokenUsage` 到同一事件语义 |
| EVO-FND-02 | P0 | 90m | 1 | TODO | 新增 `case / trace` 主实体与状态机，支持问题聚合、根因归档、证据挂载与时间线回放 |
| EVO-OBS-01 | P1 | 60m | 1 | TODO | 升级系统日志页与项目驾驶舱，补 case 漏斗、事件时间线、失败热点和闭环看板 |
| EVO-RPR-01 | P1 | 90m | 1 | TODO | 新增 repair 工作流：从 case 生成待办/修复动作，并强制记录验证结果与回滚点 |
| EVO-LRN-01 | P1 | 90m | 1 | TODO | 新增规则注册表与经验固化流程，让验证通过的修复沉淀为规则、playbook 或 guardrail |
| EVO-GOV-01 | P1 | 60m | 1 | TODO | 建立闭环指标、自动化审批边界、灰度策略与 fail-closed 安全约束 |

## 2026-04-02 付款备注规范收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FIN-P0-03 | P0 | 60m | 1 | DONE | 收口导入脚本与手工收款录入的备注规范，让合同号稳定进入可机读备注 |

## 2026-04-01 收款池半自动挂账

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FIN-P0-02 | P0 | 60m | 1 | DONE | 落地收款池高置信度自动匹配：唯一合同号 + 全额待收命中自动挂账，并在收付款页提供显式触发入口 |

## 2026-04-01 财务 P0 历史流水兼容

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FIN-P0-01 | P0 | 45m | 1 | DONE | 在 `financeService` 兼容历史 `INCOME / EXPENSE`，打通待分配收款、分配动作与趋势统计闭环 |

## 2026-04-01 findings 剩余入口与频控收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FINDINGS-05 | P1 | 20m | 1 | DONE | 将 `/tax-refunds` 统一重定向到 `/dashboard/tax-refunds`，同步相关 CTA |
| FINDINGS-06 | P2 | 30m | 1 | DONE | 登录限流按 `IP + 用户名` 分桶，并补前端剩余等待时间提示 |

## 2026-03-31 findings 高优先级修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FINDINGS-01 | P0 | 20m | 1 | DONE | 修复 `/dashboard/purchase` 404，新增兼容重定向入口 |
| FINDINGS-02 | P1 | 20m | 1 | DONE | 新增自定义 404 页面，补返回工作台/登录页入口 |
| FINDINGS-03 | P1 | 30m | 1 | DONE | 修复出口创建页空提交无字段级提示，允许提交并展示明确校验错误 |
| FINDINGS-04 | P1 | 15m | 1 | DONE | 调整全局背景网格位置，消除页面顶部黄色细线 |

## 2026-03-30 故事化工作台与模块首页收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| STORY-FLOW-01 | P0 | 60m | 1 | DONE | 将首页工作台改成“采购主线 + 出口跟进 + 财务上报”的故事化入口 |
| STORY-FLOW-02 | P0 | 45m | 1 | DONE | 重排采购、出口、财务模块首页首屏，让每页先讲清“下一步动作” |
| STORY-FLOW-03 | P0 | 20m | 1 | DONE | 将模块 Tab Header 改成移动端可换行，减少横向滑动依赖 |

## 2026-03-30 移动端交互收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| MOBILE-UX-01 | P0 | 45m | 1 | DONE | 将共享 Dialog 收敛为移动端全屏弹层，保证关闭按钮可见可达 |
| MOBILE-UX-02 | P0 | 15m | 1 | DONE | 从一级导航移除重复的“项目驾驶舱”入口，仅保留系统管理内入口 |
| MOBILE-UX-03 | P0 | 45m | 1 | DONE | 让 AI 助手浮动按钮支持拖拽移动，避免遮挡底部 Tab |

## 2026-03-30 本地项目驾驶舱

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| COCKPIT-01 | P0 | 90m | 1 | DONE | 落地只读实时项目驾驶舱：本地 git / 任务 / 计划 / 指标状态自动采集、手机可视化页面、自动轮询刷新、系统管理入口与穿透脚本 |

## 2026-03-29 Agent Lifecycle & Ops

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-OPS-01 | P0 | 45m | 1 | DONE | 落地 Agent 账号与 credential 生命周期管理 API：list/get/create/update Agent、issue/revoke/rotate credential，并挂载 `/api/v1/agents` |
| AGENT-OPS-02 | P1 | 60m | 1 | DONE | 为 Agent 账号与 credential 提供前端管理界面、一次性 token 展示与安全提示 |
| AGENT-OPS-03 | P1 | 60m | 1 | DONE | 为 credential 管理补到期策略、活跃凭证上限、管理员通知与前端风险提醒 |
| AGENT-OPS-04 | P0 | 60m | 1 | DONE | 落地远程 HTTP MCP endpoint，并将 update 类能力扩展到 CLI / MCP / 路由授权 |
| AGENT-OPS-05 | P1 | 45m | 1 | DONE | 落地 Agent credential 到期巡检任务，支持每日通知管理员并在 app 启动时自动接入 |
| AGENT-OPS-06 | P1 | 30m | 1 | DONE | 在系统管理中新增“关于”模块，提供远程 Agent / 本机 CLI 的快速接入说明、一键安装命令与复制按钮，默认采用用户账号密码接入 |

## 2026-03-29 表单字段 id/name 统一修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| A11Y-FORM-01 | P0 | 45m | 1 | DONE | 为共享 `Input / Textarea / CommandInput` 下沉默认 `id` 兜底，补齐系统内绕过共享组件的原生字段 `id/name`，并新增源码级审计测试锁定回归 |

## 2026-03-29 Agent CLI + MCP-ready

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| AGENT-ARCH-01 | P0 | 45m | 1 | DONE | 产出 Agent CLI + MCP-ready 架构设计：独立 Agent 账号、命令层、CLI 协议、审计与分阶段实施路径 |
| AGENT-ARCH-02 | P0 | 60m | 1 | DONE | 落地 Agent 账号数据模型与鉴权方案（`AgentAccount / AgentCredential / AgentGrant` + dual-actor audit） |
| AGENT-ARCH-03 | P0 | 45m | 1 | DONE | 落地 backend 统一搜索接口与命令层首批查询能力 |
| AGENT-ARCH-04 | P0 | 60m | 1 | DONE | 落地原子化采购创建（含 items）与首批 CLI 命令 |
| AGENT-ARCH-05 | P1 | 45m | 1 | DONE | 在 CLI 稳定后封装 MCP server，复用同一命令层与权限模型 |

## 2026-03-29 采购表单可访问性修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| A11Y-PUR-01 | P0 | 45m | 1 | DONE | 统一修复采购创建页表单无障碍问题：补齐 `Label/Input/Textarea/CommandInput` 的 `id/name/htmlFor`，移除误用 `FormLabel`，扩展 `DatePicker` 触发器属性透传并补采购页回归测试 |
| A11Y-PUR-02 | P0 | 20m | 1 | DONE | 收口剩余 2 个表单 issue：修复 `BatchImportDialog` 的文本输入/文件上传标签关联，并移除“匹配结果”对 `Label` 的误用 |

## 2026-03-28 CEO Review 重排（工作台优先）

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| ROADMAP-01 | P0 | 20m | 1 | DONE | 输出并归档 CEO 路线图升级计划，定义 30/90 天目标、取舍边界与执行顺序 |
| BASE-01 | P0 | 20m | 1 | DONE | 修复 `useMobile` 在 Vitest/jsdom 下因 `matchMedia` 缺失导致的崩溃，改用 `useSyncExternalStore` 并补回归测试 |
| OPS-ENTRY-01 | P0 | 45m | 1 | DONE | 抽出共享运维中心入口数据并升级运维中心总览页，统一 `system/page` 与 `settings > 运维中心` 的来源 |
| SH-01 | P0 | 45m | 1 | DONE | 收敛导航单一来源：让 `Sidebar` / `Header` / `ModuleTabHeader` 统一由一份 registry 派生，消除入口漂移 |
| SH-02 | P0 | 30m | 1 | DONE | 拆分 Header 过载职责：把全局搜索、移动导航、通知和用户菜单分离成独立子块 |
| SH-03 | P0 | 20m | 1 | TODO | 核对运维中心入口层级：确认 `dashboard/system` / `dashboard/system/logs` / `dashboard/system/import-records` 是否仍需要分散入口或应继续收敛 |
| WS-01 | P0 | 90m | 1 | TODO | 选一个代表性高频模块页做 workspace 改造，形成“经营工作台”示范页面 |

> 备注：`FE-COV-98` 仍保留在下方作为质量护栏子线推进，本节只列主线工作项。

## 2026-03-24 仓库瘦身与 Git 收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| REPO-HYGIENE-01 | P0 | 45m | 1 | DONE | 收紧 `.gitignore`、从 git 索引移除 `.pyc` 与 codepilot 产物、清掉本地 stale/build 报告目录，将仓库体积从 `6.6G` 压到 `1.7G` |

## 2026-03-24 VPS 首次上线

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| DEPLOY-VPS-01 | P0 | 90m | 1 | DONE | 将当前系统上线到 `23.81.118.51`：落 `pm2/nginx` 配置、修复前端生产构建红灯、启动前后端并验证公网首页与管理员登录可用 |

## 2026-03-23 提交前 E2E 稳定化

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| E2E-03 | P0 | 60m | 1 | DONE | 修复前端全量 Playwright 红灯（hydration mismatch、mock 契约漂移、过期 IA 断言），完成 fresh 全门禁验证并收口提交前台账 |

## 2026-03-22 Frontend Audit To Iteration

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| FE-AUDIT-01 | P0 | 20m | 1 | DONE | 产出 `docs/frontend-audit-2026-03.md`，固化审查结论、结构问题、frontend-skill 方向与分阶段改进计划 |
| FE-BASE-01 | P0 | 45m | 1 | DONE | 修复 `frontend` 当前 lint/build 红灯，清理明显 warning，恢复前端可演进基线 |
| FE-NAV-01 | P0 | 45m | 1 | DONE | 建立单一导航注册表，统一驱动 Sidebar/Header/ModuleTabHeader，消除多份导航配置漂移 |
| FE-CLEAN-01 | P1 | 20m | 1 | DONE | 清理陈旧或脱轨页面入口（如旧 `dashboard/logs`），统一壳层规范 |
| FE-DASH-01 | P0 | 90m | 1 | DONE | 重做工作台首屏结构：从卡片拼盘收敛为“当前焦点 + 高频动作 + 关键趋势 + 风险提醒”工作空间 |
| FE-NAV-02 | P0 | 45m | 2 | DONE | 将权限、默认落点、重定向规则进一步并入导航注册表，减少壳层条件分支 |
| FE-SPLIT-01 | P1 | 90m | 1 | DONE | 拆分 `finance/statements/page.tsx`，收口 route/data/view/dialog 结构 |
| FE-SPLIT-02 | P1 | 75m | 1 | DONE | 拆分 `store-recommend/page.tsx`，降低超长页面与重复卡片堆叠 |
| FE-SHELL-01 | P1 | 60m | 2 | DONE | 继续重构 `Header`，拆开移动导航、搜索、通知、用户菜单 |
| FE-SEARCH-01 | P1 | 60m | 2 | DONE | 将 Header 全局搜索改为聚合入口，避免输入时并发打 5 个接口 |
| FE-AI-01 | P2 | 60m | 3 | DONE | 降低 AI 助手对业务页面主交互的抢占，改成更克制的辅助入口 |
| FE-STATE-01 | P2 | 45m | 1 | DONE | 统一列表页和模块页 loading / empty / error 状态体系 |
| FE-MODULE-01 | P2 | 90m | 1 | DONE | 让采购/出口/财务模块首页形成差异化工作空间结构 |
| FE-QA-01 | P2 | 45m | 1 | DONE | 为登录页、工作台、采购合同、财务页、移动端首屏补截图回归门禁 |

## 2026-03-21 CEO/Eng/Design 三维评审迭代（基于 2026-03-20 review）

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| REV-01 | P0 | 15m | 1 | DONE | 修复导出路由权限缺失：GET /system/export/:type 与 /pdf 均无 roleAuth，加 ADMIN+业务角色限制 |
| REV-02 | P1 | 90m | 2 | DONE | 财务首页升级为经营驾驶舱：汇率显示、收付款完成率进度条、紧迫性预警 badge、快捷导航区 |
| REV-03 | P1 | 20m | 2 | DONE | AI 助手 z-index 提升至 z-[199]/z-[200]，防止被弹框/sticky header 覆盖 |
| REV-04 | P1 | 60m | 3 | DONE | 经营执行中台拆分：page.tsx(55行) 委托 UnshippedListTab + PurchaseChecklistTab 子组件 |
| REV-05 | P1 | 45m | 3 | DONE | 设置页 IA 优化：基础档案加港口/品类入口、数据导出改 shadcn Select、系统配置分域说明 |
| REV-06 | P1 | 30m | 1 | DONE | 导出路由加 withAuditLog 审计日志，可在 system/logs 追溯每次导出行为 |
| REV-07 | P0 | 45m | 2 | DONE | SystemConfig 分域分组：新增 GET /configs/domains 端点，CONFIG_DOMAIN_MAP 维护 params/dictionary/ai/other 四域 |
| REV-08 | P2 | 20m | 1 | DONE | vitest coverage 增加 services 层覆盖、reporter 加 lcov、阈值提升至 15/25%，test:coverage 命令已就绪 |
| REV-09 | P0 | 30m | 1 | DONE | authenticate() 加 LRU 内存缓存（TTL=60s, max=1000）：减少每请求 DB 查询，暴露 clearAuthCache() 供禁用即时踢出 |
| REV-10 | P0 | 15m | 1 | DONE | Settings 删除单位/报关公司失败时回滚本地状态并展示精确错误 toast（原来只有空 catch） |
| REV-11 | P1 | 20m | 1 | DONE | 财务页新增 loadError 状态：区分「无数据」与「加载失败」，失败时展示专属 ServerCrash 错误卡片+重试按钮 |
| REV-12 | P0 | 5m | 1 | DONE | ops-execution moduleName="财务"→"经营执行"，修复语义错误（FINANCE_TABS 跨页导航保留，aria-label 修正） |
| REV-13 | P0 | 15m | 1 | DONE | 旧导出路由旁路修复：/api/v1/export/:type 补 roleAuth，与 /system/export/:type 权限对齐，消除 RBAC 绕过漏洞 |
| REV-14 | P0 | — | 1 | N/A | PUT /system/notifications/:id/read 所有者校验：已通过 userId 过滤实现，无需额外修复 |
| REV-15 | P1 | 15m | 1 | DONE | 财务驾驶舱货币混用：应收全部标注 USD，应付保持 ¥/CNY，底部说明文字同步更新 |
| MOB-01 | P0 | 60m | 1 | DONE | 移动端汉堡菜单（R-019 18轮）：Header 加 Sheet 抽屉，md以下展示全量导航+用户信息+退出 |
| SPLIT-01 | P1 | 45m | 2 | DONE | SettingsPageContent.tsx 拆分为 5 个 Tab 子组件（MasterData/SystemConfig/DataImport/Ops/DataExport/Users） |
| FIN-TREND-01 | P2 | 90m | 3 | DONE | 财务趋势折线图：后端 /finance/payment-trends 按周聚合 + 前端 recharts 图表，支持 30/90 天切换 |
| FIN-OVERDUE-01 | P2 | 45m | 3 | DONE | 应收逾期预警：后端 /finance/overdue-receivables（发货30天未收视为逾期） + 前端驾驶舱预警卡片 |
| COV-01 | P1 | 30m | 1 | DONE | Coverage 扩围：include 新增 src/app/**，排除 layout/loading/error 等框架文件，阈值提升至 20/15% |
| MRD-01 | P1 | 60m | 4 | DONE | 智能比价 PriceGuard 组件：调用 /products/:id/price-history，实时显示涨/跌/持平红绿灯徽章 |
| MRD-02 | P1 | 30m | 4 | DONE | 合规性智能提示 ComplianceHint：关键词规则（鸟刺/烟花/刀具/食品）自动弹出美国法规提示 |
| MRD-03 | P1 | — | — | N/A | 合同Word/PDF导出：采购合同详情页已有完整实现（generateFromPurchase + exportPurchasePdf），无需新增 |
| MRD-04 | P1 | 45m | 1 | DONE | 合同附件归档：采购详情页增加「合同附件」卡片，支持上传/下载/删除，后端新增 downloadFile 端点 |
| PERF-01 | P1 | 20m | 1 | DONE | 财务模块 Tab 卡顿修复：statements/page.tsx 的 loading 改为骨架屏内联方式，ModuleTabHeader 始终渲染，消除切 Tab 时整页空白闪烁 |
| PERF-02 | P1 | 60m | 1 | DONE | 全模块 Tab 切换性能优化：新建 src/lib/api-cache.ts（30s 内存缓存），覆盖全部 10 个 Tab 页面，首次加载正常，30s 内重访秒开 |

## 2026-03-19 ClawPi Domain Sweep

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| OPS-DOMAIN-01 | P0 | 30m | 1 | DONE | 全仓清扫 ClawPi 旧域名残留，核查脚本/配置/定时任务入口，修复前端 API 基址环境变量不一致并完成无副作用验证 |

## 2026-03-15 Ops Execution Center

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| OPS-EXEC-01 | P0 | 60m | 1 | DONE | 经营执行中台首批交付：新增 `/dashboard/ops-execution` 入口、后端未发货聚合 API、负责人分发能力、前后端定向测试 |
| OPS-EXEC-02 | P0 | 90m | 2 | DONE | 门店采购清单模块初版：补店型/开店阶段模板、生成逻辑、模板保存、CSV 导出与中台页交互 |
| OPS-EXEC-03 | P0 | 120m | 3 | DONE | 任务提醒引擎初版：自然语言建任务、优先级/责任人/提醒时间/二次提醒、提醒处理器与轮询任务 |

## 任务清单
| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| UX-LAUNCH-01 | P0 | 30m | 1 | DONE | 登录成功后直达 `/dashboard`，工作台数据看板改为懒加载并提供骨架屏，缩短首开空白感 |
| HS-UX-01 | P0 | 20m | 1 | DONE | 查明本地登录/空库根因，补 HSCode 默认全量列表，再联通本地 backend+frontend 登录链路 |
| PERF-01 | P0 | 40m | 1 | DONE | 页面切换性能优化：实现全局 GET 缓存+并发去重+写后失效，并在侧边栏空闲预取常用路由，完成 lint/test/build 验证 |
| PERF-02 | P0 | 60m | 1 | DONE | 持续性能优化：后端列表接口新增 lite 轻量响应并移除冗余关联，前端高频页切换为 lite 请求，叠加 GET 缓存 TTL 提升至 180s，完成前后端回归与构建验证 |
| PERF-03 | P0 | 45m | 1 | DONE | 持续性能优化：侧边栏预取限流（优先级+上限+去重）、AI 助手业务页懒加载、后端开启 gzip 压缩并排除 SSE，完成前后端回归与构建验证 |
| PERF-04 | P0 | 45m | 1 | DONE | 持续性能优化：销售/货柜详情页首屏只加载主数据，商品/门店/库存改为弹窗或标签页按需加载，并补首屏不拉重数据的回归测试 |
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
| SYS-08 | P0 | 25m | 1 | DONE | 修复“系统管理”主入口 `/dashboard/system` 404：新增总览页、补单测并扩展导航 E2E 用例 |
| SYS-09 | P0 | 30m | 1 | DONE | 融合“基础设置”和“系统管理”：侧边栏整合为单一系统管理模块并保留原路由可访问性（含权限与回归测试） |
| SYS-10 | P0 | 35m | 1 | DONE | 按“功能归位”拆分系统管理：移除独立系统管理一级菜单，运维入口并入设置页并保留旧路由兼容跳转 |
| DB-01 | P0 | 20m | 1 | DONE | Prisma 数据源切回 Supabase PostgreSQL（恢复 `provider=postgresql` 与 `directUrl`） |
| OPS-01 | P0 | 15m | 1 | DONE | 统一本地端口与环境模板（backend 默认端口 3000，`env.example` 同步） |
| OPS-02 | P1 | 20m | 1 | DONE | 补齐启动/上线文档（根 README + backend README + Supabase 迁移文档）并移除 Vercel 占位 rewrite |
| AUTH-01 | P1 | 20m | 1 | DONE | 登录页支持记住账号密码与“快捷登录”按钮（本地恢复后可一键登录） |
| AUTH-02 | P0 | 25m | 1 | DONE | 登录页改为“快捷登录 + 一键登录（admin）后输入密码自动提交”，并将 admin 测试密码切换为 123456（含 seed 同步） |
| AUTH-03 | P0 | 25m | 1 | DONE | 登录页快捷登录收口：移除“记住用户名/测试账号提示/6位自动提交文案”，改为“首次成功登录后支持一键直接登录”并补齐回归测试 |
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
| CI-02 | P0 | 25m | 1 | DONE | 修复前端 Vitest CI 假红灯：定位全量/coverage 下页面交互慢测超时，并将 `frontend/vitest.config.ts` 默认 `testTimeout` 提升到 `20000` 后完成全量 `test + coverage` 复核 |
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
| CUSTOMS-DRAFT-01 | P0 | 45m | 1 | DONE | 基于现有 `sales_contracts + packing_items + product` 自动生成报关单草稿，并在报关单列表页提供触发入口 |
| TAX-EXPORT-01 | P0 | 45m | 1 | DONE | 出口退税申报前校验 V1：新增 `relation_no/invoice_no/vat_rate_type/match_status`，实现导出前校验、告警、规范化与 passed-only 导出，并补齐后端单测 |
| TRM-CRUD-API-01 | P0 | 35m | 1 | DONE | 既有 `customsDeclaration/forexVerification/taxRefund/taxRate` 服务层与路由模式 | 4 组税退模块 CRUD 控制器 + 路由挂载 + 定向回归测试 | `cd backend && node --test src/services/customsDeclarationService.test.js src/services/forexVerificationService.test.js src/services/taxRateService.test.js src/services/taxRefundService.test.js src/routes/taxModules.test.js src/controllers/taxRefundController.test.js` | `/api/v1/customs-declarations`、`/api/v1/forex-verifications`、`/api/v1/tax-refunds`、`/api/v1/tax-rates` 已挂载且回归通过 |
| TRM-CRUD-FE-01 | P0 | 45m | 1 | DONE | 退税 API 契约 + 现有 dashboard 页面模式 | `/dashboard/tax-refunds` 列表/详情/创建/编辑 + 服务层/类型/导航入口 + 构建修复 | `cd frontend && npm test -- src/services/taxRefund.service.test.ts src/app/dashboard/tax-refunds/page.test.tsx src/app/dashboard/tax-refunds/create/page.test.tsx 'src/app/dashboard/tax-refunds/[id]/page.test.tsx' 'src/app/dashboard/tax-refunds/[id]/edit/page.test.tsx' src/components/layout/Sidebar.test.tsx && cd frontend && npm run lint -- src/services/taxRefund.service.ts src/services/taxRefund.service.test.ts src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx src/types/index.ts src/app/layout.tsx src/app/dashboard/tax-refunds/page.tsx src/app/dashboard/tax-refunds/page.test.tsx src/app/dashboard/tax-refunds/create/page.tsx src/app/dashboard/tax-refunds/create/page.test.tsx 'src/app/dashboard/tax-refunds/[id]/page.tsx' 'src/app/dashboard/tax-refunds/[id]/page.test.tsx' 'src/app/dashboard/tax-refunds/[id]/edit/page.tsx' 'src/app/dashboard/tax-refunds/[id]/edit/page.test.tsx' src/app/dashboard/tax-refunds/components/TaxRefundStatusBadge.tsx src/app/dashboard/tax-refunds/components/TaxRefundForm.tsx src/app/dashboard/tax-refunds/components/TaxRefundListPageContent.tsx src/app/dashboard/tax-refunds/components/TaxRefundDetailPageContent.tsx && cd frontend && npm run build` | 登录后退税模块可进入、可增改查、静态校验与生产构建通过 |
| OPS-CTI-01 | P0 | 30m | 1 | DONE | 安装并配置 `claude-to-im` 飞书桥接：收缩项目 skill 入口、修复 `doctor.sh` 缺配置崩溃、写入本地 `config.env`、完成凭据校验并启动守护进程 |
| FE-COV-98 | P0 | 90m | 1 | DOING | 前端全量 Vitest + 当前 coverage 配置 | 修复既有红灯、扩 `coverage.include` 到 `src/app`/`src/services` 并把四项指标拉到 `>=98%`，产出专项报告 | `cd frontend && npm run test && npm run test:coverage` | 全量前端单测通过，Statements/Branches/Functions/Lines 全部 `>=98%` |
| FE-COV-98-A | P0 | 20m | 1 | DONE | 提炼既有执行计划与当前 coverage 配置现状，产出 `docs/coverage-98-master-plan.md` 分阶段总纲 |
| FE-COV-98-B | P0 | 25m | 1 | TODO | 锁定最新 `frontend` 全量 test / coverage 基线，输出低覆盖热点清单与阶段优先级 |
| FE-COV-98-C | P0 | 45m | 1 | TODO | 修复当前前端失败测试与 coverage 下慢测不稳定项，恢复全量单测稳定绿灯 |
| FE-COV-98-D | P0 | 35m | 1 | TODO | 扩大 `frontend/vitest.config.ts` 的 `coverage.include` 到 `src/app`/`src/services`/`src/lib`/`src/components` 并收紧 threshold |
| FE-COV-98-E | P0 | 60m | 1 | TODO | 按热点顺序补 `services/lib/app/components` 测试并清理 branches/functions 长尾缺口 |
| FE-COV-98-F | P0 | 20m | 1 | TODO | 完成最终 `test + coverage` 验证，输出专项报告并更新结果台账 |
| FE-COV-98-CI | P0 | 20m | 1 | DONE | 现有 `test-and-acceptance.yml`、`frontend/vitest.config.ts`、2026-03-12 coverage 基线实测结果 | `docs/coverage-98-ci-plan.md` + 文档导航 + checkpoint 产物 | `cd frontend && npm run test:coverage`；`git diff --check -- docs/coverage-98-ci-plan.md docs/README.md PLAN.md TASKS.md logs/task-FE-COV-98-DOC.md RESULTS/FE-COV-98-DOC.md` | CI 门禁方案已落盘，后续可按该方案推进稳定性治理和 98% 硬门禁切换 |

## 2026-03-24 HSCode 低频分片补抓

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| HSCODE-BF-01 | P0 | 120m | 2 | DONE | 识别 `400` 截断章节并执行 4 位前缀补抓；确认 `55` 章为阈值误报而非真实缺口，随后完成 manifest / CSV / 正式库三层同步到 `14161` |
| HSCODE-DIAG-01 | P0 | 45m | 1 | DONE | 新增 `HSCode` 缺失诊断脚本，结合本地前缀分布与源站边界探测重新判断当前是否仍有缺失；确认 `55` 无缺失，其余可疑章继续保留人工复核结论 |
| HSCODE-BF-02 | P0 | 90m | 2 | DONE | 对 `28/29/44/62/84/85/90` 执行 98 个 4 位前缀定向补抓，重建 manifest / CSV / 正式库到 `14391`，并复核当前“是否仍缺失”的判断边界 |
| HSCODE-XVAL-01 | P0 | 45m | 1 | DONE | 引入中国海关官方 HS4 统计表作为二级来源做交叉验证，确认当前 `14391` 数据仍存在真实缺口，而不是仅有源站探针噪声 |
| HSCODE-BF-03 | P0 | 60m | 2 | DONE | 对 `4413/4414/4415/6205/6207/8418/8419/8431/8435/8442/8519/9027/9033` 做二级来源驱动的定向补抓，重建三层数据到 `14734`，并确认这批真实缺口前缀已经全部补齐 |
| HSCODE-BF-04 | P0 | 120m | 3 | DONE | 基于官方表对 `44/62/84/85/90` 做第二轮系统对账与残余缺口补抓，将三层数据推进到 `15273`，并把官方表范围内残余缺口压缩到 `84` 章 `5` 个、`85` 章 `7` 个 |
| HSCODE-BF-05 | P0 | 45m | 2 | DONE | 对 `84/85` 两章最后 `12` 个尾差前缀再补一轮，将三层数据推进到 `15346`，并把残余缺口进一步压缩到 `8` 个前缀 |
| HSCODE-BF-06 | P0 | 30m | 1 | DONE | 改用“搜索引擎反查详情页编码 -> 精确 10 位码抓详情”清掉最后 `8` 个尾差前缀，将三层数据对齐到 `15354` |

## 2026-03-24 VPS 线上热修复

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| VPS-HOTFIX-01 | P0 | 35m | 1 | DONE | 修复 VPS 线上模块页统一报错：定位生产 CORS 误拦截无 `Origin` 同源请求，补后端回归测试，重新发布并复验 `/dashboard`、`/dashboard/contracts`、`/dashboard/finance` 恢复 |

## 2026-03-24 Mobile UX 收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| MOBILE-UX-01 | P0 | 45m | 1 | DONE | 收口采购合同页手机端体验：移动端改为合同卡片流 + 底部筛选 Sheet + 压缩概览区，保留桌面表格，并同步部署到 VPS 复验 |
| MOBILE-UX-02 | P0 | 40m | 1 | DONE | 收口供应商页手机端体验：新增底部搜索 Sheet + 供应商卡片流，修正双布局测试断言，并同步部署到 VPS 复验 |
| MOBILE-UX-03 | P0 | 45m | 1 | DONE | 收口库存状态页手机端体验：新增底部搜索/批量操作 Sheet + 库存卡片流，修正双布局测试断言，并同步部署到 VPS 复验 |

## 2026-03-30 Git 仓库精简收口

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| REPO-HYGIENE-02 | P0 | 25m | 1 | DONE | 盘点当前未提交文件，补齐 `.gitignore` 对 `frontend/qa-artifacts` 与 `frontend/backend PATCHES/RESULTS` 的忽略规则，并用 `git rm --cached` 将已跟踪过程产物从索引移除 |

## 2026-03-12 Backend Coverage 98

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| BE-COV-98 | P0 | 120m | 1 | DOING | 后端覆盖率推进到 98%，第一阶段先完成测试门禁稳定化、全量基线盘点与专项报告，第二阶段进入 controller/service 分批补测 |

## 2026-03-21 导航重构与设置精简

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| NAV-01 | P1 | 10m | 1 | DONE | 将「经营执行」从财务模块 Tab 移至经营中台模块（ops-execution 改用 OPERATIONS_TABS） |
| NAV-02 | P1 | 10m | 1 | DONE | 将「商家管理」(suppliers) 接入采购模块 Tab，更新侧边栏 childPrefixes |
| NAV-03 | P1 | 10m | 1 | DONE | 将「HS 编码」(hs-codes) 接入出口模块 Tab，更新侧边栏 childPrefixes |
| NAV-04 | P1 | 15m | 1 | DONE | 精简系统设置页：移除「基础档案」和「小工具（Cloud费用计算器）」两个Tab，默认落地系统配置 |
| NAV-05 | P1 | 5m | 1 | DONE | 修复 finance/page.tsx 中 Recharts Tooltip formatter 类型错误并通过生产构建 |
| NAV-06 | P1 | 10m | 1 | DONE | ADMIN_TABS 重排序（系统配置→用户管理→通知中心→系统日志→导入记录→AI 管理→合同模板），删除数据导入 Tab |
| NAV-07 | P1 | 15m | 1 | DONE | 「数据导入」功能改为导入记录页右上角按钮，点击跳 /dashboard/import |
| BUG-01 | P0 | 5m | 1 | DONE | 修复导入记录 404：前端 service 调用改为 /import/history |
| FIX-05 | P1 | 30m | 1 | DONE | HS 编码模糊搜索：后端 Dice 系数算法 + 前端相似度 Badge 展示 |
| UX-01 | P1 | 20m | 1 | DONE | 统一分页：HS 编码页新增 20/50/100 条每页 Select，默认 20 条 |
| UX-02 | P1 | 25m | 1 | DONE | Tab 记忆：localStorage 持久化各模块最后访问路径，侧边栏点击模块自动跳回上次位置 |
| UX-03 | P1 | 20m | 1 | DONE | 筛选重置：退税列表、报关单列表筛选区新增「重置」按钮 |

## 2026-03-21 CEO三维评审 + 设计评审 → 迭代计划

> 来源：REDUCTION / HOLD SCOPE / SCOPE EXPANSION 三轮 CEO Review + Design Review。  
> 按优先级排序，P0 = 质量危机/影响上线，P1 = 可见体验缺陷，P2 = 扩展与优化。

### 🔴 P0 质量门禁

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| QG-01 | P0 | 60m | 1 | TODO | 修复 46 个前端失败测试：定位失败原因（mock 不同步、页面行为变更），逐文件修复直到 0 red（对应 FE-COV-98-C） |
| QG-02 | P0 | 15m | 1 | TODO | API 缓存内存泄漏修复：`api-cache.ts` 增加 `setInterval` 每 5 分钟清理过期条目，或引入 LRU 策略限制最大 200 条 |
| QG-03 | P0 | 20m | 1 | TODO | 全局 React Error Boundary：在 `app/layout.tsx` 外层加 `<GlobalErrorBoundary>`，catch 渲染崩溃并展示「页面异常，点击刷新」fallback UI |

### 🟡 P1 体验与架构

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| ARCH-01 | P1 | 45m | 1 | TODO | HS 编码 SQLite FTS5 索引：对 `hs_codes.product_name` 建 FTS5 虚拟表，fuzzySearch 改为 `MATCH` 语句，候选集压缩到 <100 条再做 Dice 排序，解决 12k 记录全扫性能问题 |
| ARCH-02 | P1 | 30m | 1 | TODO | 分页状态 URL 同步：HS 码、采购合同、销售合同、付款记录等列表页将 `page/pageSize/keyword` 写入 URL query string（`useSearchParams`+`router.replace`），支持浏览器回退与书签 |
| ARCH-03 | P1 | 20m | 1 | TODO | RBAC 写路由审计：盘查所有 POST/PUT/DELETE 路由，确认 `system-configs`、`users`、`roles` 等管理类端点已加 `requireAdmin` 中间件，消除普通员工越权风险 |
| DESIGN-01 | P1 | 20m | 1 | TODO | 采购列表空单元格修复：当采购单缺少供应商/金额/状态字段时，展示「—」占位符而非空白，避免表格参差不齐（Design Review P1） |
| DESIGN-02 | P1 | 15m | 1 | TODO | 图表坐标轴字号修复：财务趋势折线图 X/Y 轴 `tick` 字体从 10px 提升到 12px，图例文字同步放大，提升可读性（Design Review P1） |
| DESIGN-03 | P1 | 20m | 1 | TODO | 统一空态设计：产品/库存/合同等空列表页统一使用「插画 + 主操作按钮」的空态卡片（Design Review P1） |
| REDUCE-01 | P1 | 20m | 1 | TODO | 移除「门店推荐」页（`/dashboard/store-recommend`）：CEO REDUCTION 识别为低频且维护成本高，删除页面、路由、侧边栏入口，相关测试同步清理 |
| REDUCE-02 | P1 | 15m | 1 | TODO | 移除 `ComplianceHint` 悬浮合规提示组件：CEO REDUCTION 识别为打断用户流程的噪音，暂时下架，后续可改为「按需查询」模式集成到 HS 编码详情页 |

### 🟢 P2 扩展能力（SCOPE EXPANSION 近期可落地）

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| EXP-01 | P2 | 90m | 1 | TODO | AI HS 码推荐助手：在 HS 编码搜索区加「AI 辅助识别」按钮，用户输入产品描述，调用 Kimi/MiniMax API 返回推荐 HS 编码列表 + 税率，利用现有 AI 配置体系 |
| EXP-02 | P2 | 45m | 1 | TODO | 汇率自动同步：定时拉取央行/ExchangeRate-API 公开汇率，写入 `system_configs`，财务模块付款换算自动引用最新汇率而非手动填写 |
| EXP-03 | P2 | 60m | 1 | TODO | 合同 Word 模板导出：基于 `docxtemplater`，采购/销售合同详情页增加「导出 Word」选项，输出带公司抬头/盖章位置的标准合同格式 |
| EXP-04 | P2 | 120m | 2 | TODO | 供应商文件自服务门户 V1：生成带时效的供应商上传链接，供应商无需登录即可上传报价单/发票/合规文件，文件归入对应采购合同附件 |

## 2026-06-02 WPS 历史出货导入链路

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WPS-IMPORT-01 | P0 | 40m | 1 | DONE | 查找并保存 WPS `11-报关记录` 源文件，建立只读解析脚本，生成合同/装箱/销售/发票汇总与现库差异报告 |
| WPS-IMPORT-02 | P0 | 30m | 1 | TODO | 人工确认 `EXP250018 925圣荷西.xlsx` 文件名与内容合同号不一致问题；确认后决定归入 EXP250018、EXP250019 或保留异常 |
| WPS-IMPORT-03 | P0 | 60m | 1 | DONE | 基于 `preferred_packing_items.csv` 与 `preferred_sales_items.csv` 设计幂等导入脚本；已低风险补齐商品/门店主数据，明细替换路径默认 dry-run 并加保护 |
| WPS-IMPORT-04 | P0 | 45m | 1 | DONE | 审计 `invoice_summary_items.csv` 报关/发票号复用情况；已确认该表疑似模板/旧数据复用，导入脚本对报关/退税写入默认拒写 |
| WPS-IMPORT-05 | P1 | 30m | 1 | DONE | 盘点采购合同 PDF/DOCX、报关单、退税联等凭证文件的附件归属，避免把凭证内容误写入商品行字段 |
| WPS-IMPORT-06 | P0 | 60m | 1 | DONE | 实现装箱明细 merge 导入策略：保留已有报关链接，按合同/商品/数量/箱数/重量/体积匹配后补空字段，无法匹配才新增 |
| WPS-IMPORT-07 | P0 | 45m | 1 | DONE | 实现销售明细 merge 导入策略：只导入能从源文件安全推出门店的销售行，补售价/规格/来源，无法确认门店的行保留为 skipped |
| WPS-IMPORT-08 | P0 | 45m | 1 | TODO | 处理剩余异常：2 条装箱歧义、1 条销售缺门店、1 个 `EXP250027` 31 套窗帘多门店口径、1 条路径门店推断复核和 1 个 `EXP2400006` 旧空运报关底稿缺正式海关编号项 |
| WPS-IMPORT-09 | P0 | 30m | 1 | DONE | 盘点真实报关单、出口退税联、发票、提单、采购合同等附件队列，生成 `attachment_inventory.*`，明确哪些 EXP 合同有高价值凭证 |
| WPS-IMPORT-10 | P0 | 60m | 1 | DONE | 从真实报关单、出口退税联、发票 PDF/附件正文抽取关键字段和退税联明细，生成 `evidence_extracts.*` / `evidence_db_mapping.csv`，不写库 |
| WPS-IMPORT-11 | P0 | 60m | 1 | DONE | 基于 `evidence_db_mapping.csv` 备份后安全写入真实报关单草稿、报关明细、退税草稿，并验证导入脚本幂等 |
| WPS-IMPORT-12 | P0 | 60m | 1 | DONE | 处理剩余真实凭证 blocked 项：已为销项发票补有限 OCR 并保留复核；旧 `.xls` 因缺转换/读取依赖继续 blocked；`EXP2400005/EXP2400006` 共目录仍需人工归属裁决 |
| WPS-IMPORT-13 | P0 | 45m | 1 | DONE | 绕开旧 `.xls`，用同目录真实报关单 PDF 明细唯一匹配 `EXP2400005`，写入 `222920240004561873` 报关单与 1 条明细，并验证幂等 |
| WPS-IMPORT-14 | P0 | 30m | 1 | TODO | 人工核对两份 OCR 发票：`EXP2400001` 商业发票与 `POR2400003` 采购侧发票，决定是否录入发票模块或仅作为附件证据 |
| WPS-IMPORT-15 | P1 | 30m | 1 | DONE | 判断两个旧 `.xls` 是否只是已由 PDF 覆盖的重复底稿；`1单.xls` 已证明为 `EXP2400005 / 222920240004561873` 的旧底稿副本，`2单空运.xls` 仍缺正式海关编号 |
| WPS-IMPORT-16 | P0 | 75m | 1 | DONE | 抽取 WPS 采购合同凭证，安全导入 66 个缺失采购合同、79 条采购明细、2 个商品和 5 个商品单位补齐，并验证幂等 |
| WPS-IMPORT-17 | P1 | 45m | 1 | DONE | 修正采购合同 DOCX/XLSX 抽取规则，安全导入 10 个缺失采购合同、38 条采购明细、1 个供应商和 2 个商品，并验证幂等 |
| WPS-IMPORT-18 | P1 | 45m | 1 | DONE | 为图片 CRC 损坏 DOCX 增加正文 XML fallback，安全导入 `CG2500041` 采购合同和 1 条采购明细，并验证幂等 |
| WPS-IMPORT-19 | P1 | 45m | 1 | DONE | 扩大 DOCX XML fallback 覆盖异常条目场景，安全导入 `CG2500095` 采购合同和 2 条采购明细；剩余真实缺口收敛为 `CG2400008`、`CG2400013`、`CG2400027`、`CG2600013` |
| WPS-IMPORT-20 | P0 | 30m | 1 | DONE | 复跑出口源 merge 后补齐新增商品带出的尾差：安全写入 7 条装箱明细、4 条销售明细和 3 个商品字段，并验证幂等 |
| WPS-IMPORT-21 | P0 | 25m | 1 | DONE | 将真实凭证 OCR 改为优先中文语言包，复核后确认仍无新增可写库项，并生成 `docs/wps-import-decision-memo.md` 待业务裁决 |
| WPS-IMPORT-22 | P0 | 25m | 1 | DONE | 新增可复跑待裁决包脚本，输出 `wps_import_decision_packet.csv/json/md`，把 95 条剩余人工裁决事项逐条列明 |
| WPS-IMPORT-23 | P0 | 30m | 1 | DONE | 增加源文件路径唯一门店推断，安全写入 56 条销售行门店归属，待裁决包从 95 条降到 39 条 |
| WPS-IMPORT-24 | P0 | 35m | 1 | DONE | 纳入 `12-报关单` 独立 PDF 归档与抽取，安全写入 23 个新报关单头并验证幂等 |
| WPS-IMPORT-30 | P0 | 35m | 1 | DONE | 复核 4 份扫描 PDF 采购合同，安全写入 `CG2400027`、`CG2600024`、`CG2600030`、`CG2600031` 及 18 条采购明细，采购待裁决缺口降到 2 |
| WPS-IMPORT-31 | P0 | 25m | 1 | DONE | 用合同聚合中的唯一现有门店补齐销售明细门店，安全新增 23 条销售明细、更新 7 条旧销售明细，待裁决包从 45 条降到 22 条 |
| WPS-IMPORT-32 | P0 | 25m | 1 | DONE | 用唯一现有报关单补映射退税用途确认发票明细，安全新增 `EXP2500001` 退税草稿 1 条，待裁决包从 22 条降到 20 条 |
| WPS-IMPORT-34 | P0 | 35m | 1 | DONE | 复核 WPS 客户端 `出货汇总` 不是仍缺云端副本；安全删除 29 条可证明重复装箱行，待裁决包从 20 条降到 13 条 |
| WPS-IMPORT-35 | P0 | 25m | 1 | DONE | 对 `CG2400013` 只导入合同头 DRAFT，不创建明细，待裁决包从 13 条降到 12 条 |
| WPS-IMPORT-36 | P0 | 35m | 1 | DONE | 将文件名错配但正文一致的 `EXP250018 925圣荷西.xlsx` 按正文归入 `EXP250019`，写入缺失装箱/销售并修正 40 条销售售价，待裁决包从 12 条降到 11 条 |
| WPS-IMPORT-37 | P0 | 25m | 1 | DONE | 删除 `EXP2400001` 1 条完全重复且无报关引用的装箱行，补来源 note，待裁决包从 11 条降到 10 条 |
| WPS-IMPORT-38 | P0 | 30m | 1 | DONE | 用签章 PDF 复核 `CG2400008` 乙方并结合 XLSX 明细入库，新增 1 份采购合同、16 条采购明细和 7 个商品，待裁决包从 10 条降到 9 条 |
| WPS-IMPORT-39 | P0 | 20m | 1 | DONE | 复核两份 output_invoice PDF 为商业发票，将其标记为 reference-only，不再作为税票 blocked 项，待裁决包从 9 条降到 7 条 |
| WPS-IMPORT-40 | P0 | 20m | 1 | DONE | 复核旧 `.xls` 报关底稿，确认 `1单.xls` 为正式报关单 `222920240004561873 / EXP2400005` 的参考副本，待裁决包从 7 条降到 6 条 |
| WPS-IMPORT-41 | P0 | 25m | 1 | DONE | 用 WPS 客户端下载并保留 `20250604235840` 退税发票清单和顶层 `出货汇总.xlsx`，云端仅正文缺口从 3 个降到 1 个；两者均无新增写库项 |
| WPS-IMPORT-42 | P0 | 30m | 1 | DONE | 用 `_wps_cloud_root/出货汇总.xlsx` 的 31+35 拆分证据删除 `EXP250027` 无门店 66 套窗帘汇总重复行；防止多门店合并名称自动建门店，待裁决包明确为 7 条 |
| WPS-IMPORT-43 | P0 | 20m | 1 | DONE | 装箱歧义裁决包补充源行/候选行摘要，并只列最高同分候选；复核 `EXP2500001` 不是可证明重复，继续留待业务裁决 |
| WPS-IMPORT-44 | P0 | 25m | 1 | DONE | 收紧销售路径门店推断：同合同同商品装箱多门店时不再用文件路径猜销售门店，新增暴露 19 条销售门店待裁决项 |
| WPS-IMPORT-45 | P0 | 25m | 1 | DONE | 用同源装箱行的商品和数量唯一命中证据修正 8 条销售门店、补 5 条来源 note，销售门店待裁决从 19 条降到 7 条 |
| WPS-IMPORT-46 | P0 | 20m | 1 | DONE | 清理 1 条已证明不可靠的 WPS 路径门店销售行，避免 `EXP250028` 铁艺屏风继续挂到不在装箱候选内的圣荷西625 |
| WPS-IMPORT-47 | P0 | 20m | 1 | DONE | 用同合同同商品同数量的全量装箱证据唯一门店收口 `EXP2500002` 300 平方米销售行，待裁决包从 14 条降到 13 条 |
| WPS-IMPORT-48 | P1 | 20m | 1 | DONE | 补强 WPS 云端盘点，记录 5 条 metadata 外 filecache 线索和 4 条 `文件不存在` 失败下载，避免漏判旧云端文件 |
| WPS-IMPORT-49 | P0 | 30m | 1 | DONE | 下载并保留 WPS 根目录 `919清单.xlsx` 与 `0429装货清单-叶总.xlsx`；放宽清单类工作簿识别并安全写入 `EXP260005` 1 条装箱行 |
| WPS-IMPORT-50 | P0 | 25m | 1 | DONE | 将 WPS 根目录出货/装货/清单候选做成独立可复跑盘点，下载保留 `0718装货单.xlsx`，确认当前仅 89KB 根目录 `出货汇总.xlsx` 未缓存 |
| WPS-IMPORT-51 | P0 | 15m | 1 | DONE | 补强 WPS 云端盘点报告的“仅云端可见文件”清单，并复跑全量只读导入校验；确认自动导入已归零，剩余 13 条留待业务裁决 |
| WPS-IMPORT-52 | P0 | 25m | 1 | DONE | 复核 WPS 中不存在 `11-出货清单` 目录；将 `0802出货清单.xlsx` 升级为 shipment_list 参考凭证，并安全补入 4 条正式报关明细申报要素 |
| WPS-IMPORT-53 | P0 | 20m | 1 | DONE | 将 `出口申报信息.xlsx` 纳入 shipment_list 参考凭证抽取，安全补入 `EXP2400002` 正式报关明细 `瓷砖` 申报要素 |
| WPS-IMPORT-54 | P0 | 25m | 1 | DONE | 从正式出口退税联 PDF 抽取完整申报要素，安全补入 11 条现有正式报关明细空字段，并验证幂等 |
| WPS-IMPORT-55 | P0 | 15m | 1 | DONE | 复核正式 PDF 坐标文字，安全补入 `530420240040849246` 第 10 项 `支撑柱` 5 段完整申报要素 |
| WPS-IMPORT-56 | P0 | 15m | 1 | DONE | 复核 `EXP2400006` 同目录源文件与 WPS 云端索引，补强裁决包中的正式海关编号缺口证据 |
| WPS-IMPORT-57 | P0 | 20m | 1 | DONE | 全量审计 WPS 路径门店推断，删除 19 条与同数量装箱唯一门店冲突且已有正确重复行的销售污染行 |
| WPS-IMPORT-58 | P1 | 15m | 1 | DONE | 将剩余 10 条证据不足的路径门店推断销售行纳入裁决包，避免隐藏在数据库中 |
| WPS-IMPORT-59 | P0 | 20m | 1 | DONE | 用同源装货备注中的商品别名与同数量证据修正 `EXP250016` 玻璃瓶销售门店，并补齐 14 条销售行装货数量证据 note |
| WPS-IMPORT-60 | P0 | 20m | 1 | DONE | 用同质销售行组证据给 `EXP250028` 两条 2 套铁艺屏风现有门店销售行补售价和来源 note，销售门店待裁决从 6 条降到 4 条 |
| WPS-IMPORT-61 | P0 | 20m | 1 | DONE | 用同源同商品残余配对证据给 `EXP250025` 181.44 平方米瓷砖行补 `Burbank` 装货证据 note，待裁决包从 20 条降到 18 条 |
| WPS-IMPORT-62 | P0 | 20m | 1 | DONE | 清理 `EXP250014` 4 条同源同数量同价格的旧路径门店重复销售行；价格不一致的 3 条继续留裁决，待裁决包从 18 条降到 14 条 |
| WPS-IMPORT-63 | P0 | 20m | 1 | DONE | 将 `EXP250014` 剩余 3 条同源正确价格转移到 `圣荷西2115` 强门店行并删除弱路径行，待裁决包从 14 条降到 11 条 |
| WPS-IMPORT-64 | P1 | 15m | 1 | DONE | 补强 `EXP2400006` blocked 证据：出货汇总 `invoice_no=25312000000011328975` 不是正式 18 位海关编号，继续不创建报关单 |
| WPS-IMPORT-65 | P0 | 20m | 1 | DONE | 对已存在组合门店的 3 条装箱源行新增独立来源装箱行，不硬匹配单门店候选；待裁决包从 11 条降到 8 条 |
| WPS-IMPORT-66 | P0 | 20m | 1 | DONE | 修正销售规格解析并用同源/已入库装箱规格数量证据补强 6 条销售行 note；`EXP250019` Burbank/Westminster 冲突转入裁决包，待裁决包稳定为 7 条 |
| WPS-IMPORT-67 | P0 | 20m | 1 | DONE | 迁移 `EXP250019` 错挂装箱来源：从 Westminster 501.12 平方米行移除 `925圣荷西#装货:11`，新增 Burbank 501.12 平方米装箱行，待裁决包从 7 条降到 6 条 |

## 2026-06-07 管理工作台与模块归属

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WU-FE-WORKBENCH | P0 | 20m | 1 | DONE | 重做管理工作台首页为采购、销售、仓储物流、财务四模块并行入口；修复 HS 编码/报关单归属串扰；通过测试、lint、类型检查、构建和浏览器验证 |

## 2026-06-07 采购合同模板归属

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WU-FE-PROCUREMENT-TEMPLATE | P0 | 20m | 1 | DONE | 移除采购模块独立「合同模板」Tab；在采购合同页内嵌模板管理弹窗；旧模板 URL 重定向回采购合同页；完成目标测试、lint、构建和生产预览验证 |

## 2026-06-07 供应商管理表单页

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WU-FE-SUPPLIERS-FORM | P0 | 20m | 1 | DONE | 将供应商管理从卡片/表格列表页改为左侧索引 + 右侧档案表单页；支持新建、选择编辑、删除；完成目标测试、lint、类型检查、构建和浏览器验证 |

## 2026-06-07 AI 助手独立模块

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WU-FE-AI-MODULE | P0 | 20m | 1 | DONE | 将 AI 助手恢复为侧边栏独立顶级模块；新增 AI 会话 Tab；`/dashboard/ai` 兼容跳转会话列表；完成目标测试、lint、类型检查、构建和浏览器验证 |

## 2026-06-07 侧边栏数量徽标下线

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WU-FE-SIDEBAR-BADGES | P0 | 15m | 1 | DONE | 移除侧边栏模块右侧绿色数字徽标；侧边栏不再请求采购、出口、财务待处理数量；完成目标测试、lint、类型检查和浏览器验证 |

## 2026-06-07 财务总览与报表合并

| ID | 优先级 | 预计时长 | 并行槽位 | 状态 | 任务 |
|---|---|---:|---:|---|---|
| WU-FE-FINANCE-OVERVIEW-MERGE | P0 | 20m | 1 | DONE | 财务顶层 Tab 收敛为「财务总览」「收付管理」；旧报表路由跳转总览锚点；总览页内嵌报表分析、上传导入和四个下钻区块；完成目标测试、lint、类型检查 |
