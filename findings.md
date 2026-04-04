# Findings

## 2026-04-04 组合诊断建议闭环发现

- 当前 runtime 已经有两块关键资产，但中间缺了一层结构化桥接：
- 组合诊断工具能输出 `blockers / nextActions`
- 写工具能进入 `pendingAction -> confirm` 两阶段确认
- 真正缺的不是更多自然语言，而是可沉淀、可回放的“建议动作对象”。
- 最小正确做法不是新增表或改 prompt，而是在工具执行层拦截复合诊断 JSON，提炼出 `actionRecommendations` 并随 metadata 落库。
- 这样做的收益是三重的：
- session/history 可以稳定回放诊断建议
- 后续若要把个别建议升级成 `confirmable_write`，不需要重做数据通路
- 治理面开始能回答“这次 AI 不只是看了什么工具，还建议了什么动作”

## 2026-04-02 Agent Runtime 融合发现

- `open-agent-sdk-typescript` 的价值在于把完整 agent loop 跑在应用进程里，适合作为你系统的 Agent Runtime 内核。
- 它不适合整套替换现有系统，因为默认 session 持久化是文件系统路径 `~/.open-agent-sdk/sessions`，而不是你当前的 Prisma 审计模型。
- 当前仓库已经有可复用的 Agent 与 AI 底座：
- `AgentAccount / AgentCredential / AgentGrant` 适合承接 agent 身份、权限与接入
- `ChatHistory / TokenUsage / OperationLog / ImportRecord` 适合承接会话、用量、审计与学习材料
- 最合理的融合路线是“SDK 执行内核 + 你自己的业务工具层 + 你自己的审计与记忆层”，不是直接搬 SDK 默认工具池。
- Phase 1 最稳的切入点是：先挂一个 read-only Agent Runtime，再给财务 / 出口单证 / 驾驶舱三个预置 agent prompt 和业务查询工具。

## 2026-04-02 客户级收款池发现

- 当前收入记录之所以无法回答“客户还差多少钱”，根因不是没有收款数据，而是收款只能作为孤立流水存在。
- 本轮已经补上客户级收款池模型：收入记录全部带客户名，分摊子记录可以追溯到源收款，未分完的金额继续留在池中。
- 当前真实库里 `25` 条收入都已补齐 `customerName=Sp food trading LLC`。
- 但合同级 `receivedAmount` 不会自动根据历史收入总和变化，仍要靠真实分摊动作更新；这是符合现阶段业务规则的。

## 2026-04-02 备注规范收口发现

- 当前真正需要统一的不是“再加更多匹配规则”，而是付款备注的上游质量。
- 本轮已经把两条入口统一到了可机读格式：
- 导入：`合同号:EXP... | 门店:... | 用途:...`
- 手工收款：`合同号:EXP... | 备注:...`
- 但本地历史付款数据恢复遇到外部依赖问题：WPS 容器里的源 Excel 路径可见，实际读取/复制内容会卡住。
- 已补充结论：稳定原始文件实际位于 `/Users/helena/Documents/捷淞/4-财务部/合同明细、美元交易.xlsx`，且可正常读取。
- 结论：功能层已经推进完成；当前未推进的核心已回到“如何提高可自动匹配的备注覆盖率”。

## 2026-04-01 收款池半自动挂账发现

- 当前真实收款池共有 `25` 笔未分配收入，但备注里 `EXP...` 合同引用数为 `0`。
- 这说明“自动匹配能力缺失”已经不是首要瓶颈；当前首要瓶颈变成了历史导入数据的备注质量。
- 因此本轮自动匹配规则必须保持保守，不能为了追求命中率而放松到模糊猜测，否则误挂账风险会高于收益。
- 已落地的最小可用规则是：唯一合同号 + 待收全额一致。它对未来规范化录入有效，但对现有历史池子短期不会出量。

## 2026-04-01 财务 P0 兼容发现

- 当前真实库 `payments` 只有两种类型：`INCOME (25)` 和 `EXPENSE (35)`。
- 其中 `25` 条 `INCOME` 都没有关联合同，直接解释了为什么当前“待分配收款池”看起来像没打通。
- `financeService` 现状只识别 `RECEIVABLE_RECEIPT / RECEIVABLE_COLLECTION / PAYABLE_PAYMENT`，导致历史流水在待分配池和趋势图里都不可见。
- 当前分配逻辑原本还存在闭环缺口：分配后不会处理原始到账记录，理论上会一直留在待分配池里并被重复分配。
- 结论：P0 应先做服务层兼容与分配状态收口，而不是先做 schema 级改造。

## 2026-03-31 UI/UX 深度测试发现

### 严重问题 (P0)
- **采购管理页面 404**: `/dashboard/purchase` 返回 404，用户无法访问采购管理功能
  - 截图: `.gstack/qa-reports/screenshots/05_purchases.png`
  - 修复建议: 检查 `frontend/src/app/dashboard/purchase/page.tsx` 是否存在

### 中等问题 (P1)
- **404 页面过于简陋**: 只显示 "404 | This page could not be found."，无返回首页按钮
  - 截图: `.gstack/qa-reports/screenshots/s10_01_404_page.png`
- **页面顶部黄色边框**: 所有页面顶部都有 2-3px 黄色边框，可能是调试样式未移除
- **表单验证提示不明确**: 创建出口合同时，直接提交无明确字段级验证提示
  - 截图: `.gstack/qa-reports/screenshots/s7_02_form_validation.png`

- **已修复**: 已新增 `frontend/src/app/dashboard/purchase/page.tsx`，`/dashboard/purchase` 现在重定向到 `/dashboard/contracts`
- **已修复**: 已新增自定义 `frontend/src/app/not-found.tsx`，404 页面现在提供"返回工作台 / 返回登录页"入口
- **已修复**: 已修正 `frontend/src/app/dashboard/sales/create/page.tsx` 的提交按钮逻辑与数值校验
- **已修复**: 已修正 `frontend/src/app/globals.css` 的水平网格背景下移 24px，消除页面顶部的黄色细线
- **已修复**: 旧退税入口 `/tax-refunds` 已统一重定向到 `/dashboard/tax-refunds`
- **已修复**: 外汇核销页中的退税跳转已统一到 `/dashboard/tax-refunds`
- **已修复**: 登录限流已改为按 `IP + 用户名` 分桶，前端会显示剩余等待时间提示

## 2026-03-31 扩展测试新发现

### 场景13-24 测试结果

#### 中等问题 (P1)
- **合同详情页入口不明显**: 出口合同列表页的"详情"按钮选择器可能不符合常规，自动化测试无法点击
  - 截图: `.gstack/qa-reports/screenshots/s13_01_contract_detail.png`
  - 建议: 检查详情按钮的 HTML 结构，确保有明确的点击区域

- **搜索功能缺失**: 报关单管理页面未检测到筛选下拉框和搜索功能
  - 截图: `.gstack/qa-reports/screenshots/s16_01_filters.png`
  - 建议: 为列表页添加统一的搜索和筛选组件

- **资源加载404错误**: 控制台记录多个资源加载失败
  ```
  [error] Failed to load resource: the server responded with a status of 404
  ```
  - 建议: 检查是否有缺失的图片、CSS 或 JS 文件

- **表格排序功能缺失**: 出口合同列表的金额表头无法点击排序
  - 截图: `.gstack/qa-reports/screenshots/s71_01_sort_check.png`
  - 建议: 为表格列添加排序功能，提升数据浏览效率

- **搜索功能不完整**: 出口合同列表页未找到搜索框
  - 截图: `.gstack/qa-reports/screenshots/s70_02_no_search.png`
  - 建议: 在列表页添加关键词搜索功能，支持按合同号、客户名搜索

- **页面刷新后状态丢失**: 在出口合同列表第2页刷新后，页码重置回第1页
  - 截图: `.gstack/qa-reports/screenshots/s33_01_before_refresh.png`
  - 建议: 使用 URL 参数保存分页和筛选状态，刷新后恢复

- **离线状态提示缺失**: 系统未检测网络断开状态，无离线提示
  - 截图: `.gstack/qa-reports/screenshots/s44_01_offline_check.png`
  - 建议: 添加网络状态监听，断网时显示提示

- **多标签页数据同步缺失**: 创建合同后返回列表页，无自动刷新或提示
  - 截图: `.gstack/qa-reports/screenshots/s65_01_data_sync.png`
  - 建议: 添加数据同步提示或自动刷新机制

- **API错误处理不明确**: 网络异常时的错误提示不明显
  - 截图: `.gstack/qa-reports/screenshots/s66_01_api_error.png`
  - 建议: 添加明确的网络错误提示和重试机制

#### 轻微问题 (P2)
- **数据一致性检查**: 仪表盘显示42份销售合同，列表页显示42条，数据一致 ✅
  - 但文本提取显示重复，可能需要优化数据展示格式

- **分页功能**: ✅ 分页组件工作正常，支持上一页/下一页
  - 截图: `.gstack/qa-reports/screenshots/s15_01_pagination.png`

- **删除确认弹窗**: ✅ 删除操作有确认弹窗，防止误操作
  - 截图: `.gstack/qa-reports/screenshots/s17_01_delete_dialog.png`

- **数据导出**: ✅ 出口合同列表支持 Excel 导出
  - 每行数据都有 Excel 导出按钮

- **表单字段**: ✅ 创建出口合同表单有 6 个可输入字段，结构清晰
  - 截图: `.gstack/qa-reports/screenshots/s19_01_empty_submit.png`

- **权限控制**: ✅ 系统管理页面和用户管理页面均可正常访问

- **响应式适配**: ✅ 平板(768x1024)和小屏手机(375x667)适配良好
  - 截图: `s21_01_tablet.png`, `s21_02_small_phone.png`

- **键盘导航**: ✅ 登录页支持 Tab 键导航
  - 截图: `.gstack/qa-reports/screenshots/s23_01_keyboard_nav.png`

### 测试统计
- **总截图数量**: 115 张
- **测试场景**: 72 个
- **页面覆盖**: 16 个功能模块
- **发现问题**: 已修复 7 个，新增 20 个

### 截图索引

#### 场景测试截图 (s系列)
| 场景 | 截图文件 | 说明 |
|-----|---------|------|
| s1-s12 | `s1_*.png` ~ `s12_*.png` | 第一轮基础测试 |
| s13-s24 | `s13_*.png` ~ `s24_*.png` | 扩展功能测试 |
| s25-s36 | `s25_*.png` ~ `s36_*.png` | 深度功能测试 |
| s37-s48 | `s37_*.png` ~ `s48_*.png` | 边界场景与压力测试 |
| s49-s60 | `s49_*.png` ~ `s60_*.png` | 扩展功能场景测试 |
| s61-s72 | `s61_*.png` ~ `s72_*.png` | 性能与可访问性测试 |
| s61 | `s61_*.png` | 页面加载性能 |
| s62 | `s62_01_alt_check.png` | 图片ALT标签 |
| s63 | `s63_01_form_a11y.png` | 表单可访问性 |
| s64 | `s64_01_keyboard_nav.png` | 键盘导航 |
| s65 | `s65_01_data_sync.png` | 数据同步 |
| s66 | `s66_01_api_error.png` | API错误处理 |
| s67 | `s67_01_download.png` | 文件下载 |
| s68 | `s68_01_notification.png` | 通知系统 |
| s69 | `s69_01_boundary_test.png` | 数据验证边界 |
| s70 | `s70_02_no_search.png` | 搜索功能检查 |
| s71 | `s71_01_sort_check.png` | 排序功能检查 |
| s72 | `s72_*_*.png` | 响应式断点测试 |

#### 页面截图 (数字系列)
| 序号 | 截图文件 | 状态 |
|-----|---------|------|
| 01-16 | `01_*.png` ~ `16_*.png` | 各功能模块页面 |

---

## 历史发现
- 已新增 `frontend/middleware.ts`，敏感路径 (`/admin`, `/.env` 等) 现在返回 404 而非 500，避免信息泄露。
- 已新增 `frontend/src/lib/error-logger.ts`，实现错误去重和降噪，解决控制台错误过多的问题。
- 已新增 `frontend/src/app/dashboard/purchase/page.tsx`，`/dashboard/purchase` 现在重定向到 `/dashboard/contracts`，不再 404。
- 已新增自定义 `frontend/src/app/not-found.tsx`，404 页面现在提供“返回工作台 / 返回登录页”入口。
- 已修正 `frontend/src/app/dashboard/sales/create/page.tsx` 的提交按钮逻辑与数值校验，空表单提交现在能直接显示字段级错误提示。
- 已将 `frontend/src/app/globals.css` 的水平网格背景下移 24px，用于消除截图里页面顶部的黄色细线。
- 旧退税入口 `/tax-refunds` 已统一重定向到 `/dashboard/tax-refunds`。
- 外汇核销页中的退税跳转已统一到 `/dashboard/tax-refunds`。
- 登录限流已改为按 `IP + 用户名` 分桶，前端会显示剩余等待时间提示。

### 轻微问题 (P2)
- **搜索功能缺失**: 出口合同列表页未检测到搜索表单
- **移动端登录频繁限制**: 频控已从同 IP 一刀切改为按 `IP + 用户名` 分桶，仍需观察真实设备下是否还会频繁触发

### 优点 ✅
- 登录体验良好，错误密码有清晰的红色提示框
- 移动端响应式优秀，适配完美
- 数据展示完整，42个出口合同和4个报关单正常显示
- 状态标签清晰，草稿/已发运等状态颜色区分明确

### 截图清单
- 场景截图: `.gstack/qa-reports/screenshots/s*_*.png` (18张)
- 页面截图: `.gstack/qa-reports/screenshots/0*.png` (16张)
- 详细报告: `.gstack/qa-reports/findings.md`

### 业务数据量
- 出口合同: 42份 | 报关单: 4份 | 库存商品: 138种
- 待收回款: $2,403,632.812 | 采购待付: ¥3,682,632.13

### 性能数据
- TTFB: 816ms | DOM Ready: 1914ms | 总加载: 1926ms

---

## 2026-03-31 深度功能测试新发现 (场景25-36)

### 中等问题 (P1)
- **表格排序功能缺失**: 出口合同列表的金额表头无法点击排序
  - 截图: `.gstack/qa-reports/screenshots/s29_01_table_sort.png`
  - 建议: 为表格列添加排序功能，提升数据浏览效率

- **页面刷新后状态丢失**: 在出口合同列表第2页刷新后，页码重置回第1页
  - 截图: `.gstack/qa-reports/screenshots/s33_01_before_refresh.png`
  - 建议: 使用 URL 参数保存分页和筛选状态，刷新后恢复

- **详情页链接选择器问题**: 自动化测试无法找到合同详情链接
  - 可能与场景13的详情按钮问题相关
  - 建议: 检查详情链接的 HTML 结构和路由

### 轻微问题 (P2)
- **导出按钮选择器不明确**: 虽然页面上有 Excel 导出功能，但自动化测试无法通过常规选择器定位
  - 可能是行内操作按钮的特殊实现方式
  - 建议: 为导出按钮添加更明确的 data-testid 或 class

### 功能正常 ✅
- **AI 助手功能完整**: 支持文本输入和图片上传
  - 截图: `.gstack/qa-reports/screenshots/s25_01_ai_assistant.png`
  - 支持粘贴、拖拽、点击上传图片

- **用户菜单正常**: 包含个人设置、退出登录选项
  - 截图: `.gstack/qa-reports/screenshots/s27_01_user_menu.png`

- **状态筛选功能正常**: 支持按草稿、已发运等状态筛选
  - 截图: `.gstack/qa-reports/screenshots/s30_01_status_filter.png`

- **浏览器返回按钮正常**: 从创建页返回列表页功能正常
  - 返回后 URL 正确: `/dashboard/sales`

- **性能表现良好**: 42 条数据加载时间 3 秒，可接受
  - 截图: `.gstack/qa-reports/screenshots/s31_01_performance.png`

---

## 2026-04-01 边界场景与压力测试新发现 (场景37-48)

### 🚨 严重安全问题 (P0)
- **敏感路径可访问**: 以下路径返回 500 错误而非 404，存在信息泄露风险
  ```
  /admin
  /api/internal
  /config
  /env
  /.env
  ```
  - 截图: `.gstack/qa-reports/screenshots/s47_01_security_check.png`
  - 建议: 对这些路径返回 404 或统一错误页面，避免暴露服务端信息

- **控制台错误过多**: 473 条错误，可能存在内存泄漏或前端异常
  - 截图: `.gstack/qa-reports/screenshots/s48_01_memory_check.png`
  - 建议: 检查控制台错误来源，修复前端异常

### 中等问题 (P1)
- **离线状态提示缺失**: 系统未检测网络断开状态，无离线提示
  - 截图: `.gstack/qa-reports/screenshots/s44_01_offline_check.png`
  - 建议: 添加网络状态监听，断网时显示提示

### 轻微问题 (P2)
- **会话过期处理**: 需长时间观察，标记为待验证
  - 截图: `.gstack/qa-reports/screenshots/s45_01_session_check.png`

### 功能正常 ✅
- **防重复提交机制**: 快速连续点击后仍停留在创建页，防重机制生效
  - 截图: `.gstack/qa-reports/screenshots/s37_01_rapid_click.png`

- **XSS 防护正常**: 脚本标签被正确转义，未执行
  - 截图: `.gstack/qa-reports/screenshots/s40_02_xss_result.png`

- **SQL 注入防护**: 特殊字符被正确处理
  - 截图: `.gstack/qa-reports/screenshots/s39_02_sql_result.png`

- **特殊字符支持**: Emoji 和多语言字符正常显示
  - 截图: `.gstack/qa-reports/screenshots/s41_01_special_chars.png`

- **并发页面操作**: 快速切换页面无异常
  - 截图: `.gstack/qa-reports/screenshots/s43_01_concurrent_nav.png`

- **导出压力测试**: 3次快速导出耗时 4 秒，性能可接受
  - 截图: `.gstack/qa-reports/screenshots/s46_01_export_stress.png`

---

## 2026-04-01 扩展场景测试新发现 (场景49-60)

### 功能缺失 (建议增强)
- **批量导入功能缺失**: 未找到批量导入入口
  - 截图: `.gstack/qa-reports/screenshots/s49_02_import_check.png`
  - 建议: 添加 Excel/CSV 批量导入功能，支持大量数据快速录入

- **打印/PDF导出功能缺失**: 未找到打印或PDF导出入口
  - 截图: `.gstack/qa-reports/screenshots/s50_01_print_check.png`
  - 建议: 添加合同打印和PDF导出功能，便于线下归档

- **主题/暗黑模式缺失**: 未找到主题切换功能
  - 截图: `.gstack/qa-reports/screenshots/s52_02_theme_check.png`
  - 建议: 添加暗黑模式，提升夜间使用体验

- **帮助文档入口缺失**: 未找到帮助或文档入口
  - 截图: `.gstack/qa-reports/screenshots/s53_01_help_check.png`
  - 建议: 添加帮助中心或用户指南入口

- **列表批量操作缺失**: 列表无复选框，不支持批量操作
  - 截图: `.gstack/qa-reports/screenshots/s57_01_batch_check.png`
  - 建议: 添加批量选择、批量删除、批量导出功能

- **表单自动保存缺失**: 刷新页面后表单数据丢失
  - 截图: `.gstack/qa-reports/screenshots/s58_02_after_reload.png`
  - 建议: 添加表单自动保存和草稿恢复功能

- **链接分享功能缺失**: 未找到分享或复制链接功能
  - 截图: `.gstack/qa-reports/screenshots/s59_01_share_check.png`
  - 建议: 添加合同详情页分享功能

- **新用户引导缺失**: 首次登录无操作引导
  - 截图: `.gstack/qa-reports/screenshots/s60_01_new_user.png`
  - 建议: 添加新用户 onboarding 流程

### 功能正常 ✅
- **文件上传功能存在**: 创建合同页面支持文件上传
  - 截图: `.gstack/qa-reports/screenshots/s51_01_upload_check.png`

- **面包屑导航完整**: 深层页面有完整的面包屑路径
  - `/dashboard/sales/create` → 创建出口合同
  - `/dashboard/system` → 系统管理 / 运维中心
  - `/customs-declarations` → 报关单管理
  - 截图: `.gstack/qa-reports/screenshots/s54_01_breadcrumb.png`

- **数据卡片可交互**: 仪表盘数据卡片支持点击跳转
  - 截图: `.gstack/qa-reports/screenshots/s56_01_card_click.png`

---

## 2026-04-01 性能与可访问性测试新发现 (场景61-72)

### 可访问性问题 (P2)
- **表单可访问性需改进**: 部分表单字段可能缺少label关联或ARIA描述
  - 截图: `.gstack/qa-reports/screenshots/s63_01_form_a11y.png`
  - 建议: 为所有输入框添加 `<label>` 关联或 `aria-label` 属性

### 功能正常 ✅
- **键盘导航正常**: 登录页支持Tab键导航，焦点可正确移动
  - 截图: `.gstack/qa-reports/screenshots/s64_01_keyboard_nav.png`

- **文件下载功能存在**: 出口合同列表支持Excel导出
  - 截图: `.gstack/qa-reports/screenshots/s67_01_download.png`

- **通知入口存在**: 页面顶部有通知中心入口
  - 截图: `.gstack/qa-reports/screenshots/s68_01_notification.png`

- **响应式适配良好**: 在 iPhoneSE(375x667)、iPad(768x1024)、笔记本(1440x900) 上均显示正常
  - 截图: `.gstack/qa-reports/screenshots/s72_iPhoneSE_375x667.png`
  - 截图: `.gstack/qa-reports/screenshots/s72_iPad_768x1024.png`
  - 截图: `.gstack/qa-reports/screenshots/s72_Laptop_1440x900.png`

---

## 历史发现 (英文笔记)

- Current dashboard only exposes four flat quick-action buttons and a generic analytics panel.
- Procurement create flow already supports selecting/creating suppliers and creating contracts, but the post-creation doc/export/archive path is not surfaced from the homepage.
- Export contracts already carry `totalBoxes`, `grossWeight`, and `volume`, but the homepage does not guide users back to complete these fields after contract return.
- Finance upload capabilities exist in the statements page, but the finance homepage does not prioritize upload as the first action.
- Module-level tab navigation originally depended on horizontal scrolling on mobile, which amplified the feeling of “来回划动”.
- Reframing the homepage around procurement-first user stories still leaves one next-step gap: homepage cards are currently static guidance, not yet driven by actual contract status counts.

---

## 待修复问题汇总 (截至 2026-04-01)

### P0 - 严重问题
| 问题 | 状态 | 说明/修复文件 |
|-----|------|-------------|
| 敏感路径信息泄露 | ✅ 已修复 | `frontend/middleware.ts` - 拦截敏感路径返回404 |
| 控制台错误过多 | ✅ 已修复 | `frontend/src/lib/error-logger.ts` - 错误去重和降噪 |
| 采购管理页面 404 | ✅ 已修复 | `frontend/src/app/dashboard/purchase/page.tsx` |
| 404 页面过于简陋 | ✅ 已修复 | `frontend/src/app/not-found.tsx` |
| 页面顶部黄色边框 | ✅ 已修复 | `frontend/src/app/globals.css` |
| 表单验证提示不明确 | ✅ 已修复 | `frontend/src/app/dashboard/sales/create/page.tsx` |
| 路由结构不统一 | ✅ 已修复 | 退税入口已统一重定向 |

### P1 - 中等问题 (待修复)
| 问题 | 影响 | 建议修复方案 |
|-----|------|-------------|
| 合同详情页入口不明显 | 用户无法查看合同详情 | 检查详情按钮 HTML 结构，添加明确点击区域 |
| 搜索功能缺失 | 报关单页面无法搜索 | 添加统一搜索和筛选组件 |
| 搜索功能不完整 | 出口合同列表无法按关键词搜索 | 添加合同号、客户名搜索框 |
| 表格排序功能缺失 | 无法按金额/日期排序 | 为表格列添加点击排序功能 |
| 资源加载 404 错误 | 控制台报错，可能影响性能 | 检查缺失的图片、CSS、JS 文件 |
| 页面刷新后状态丢失 | 分页状态不保持 | 使用 URL 参数保存状态 |
| 离线状态提示缺失 | 断网时无用户提示 | 添加 `navigator.onLine` 监听和提示 |
| 多标签页数据同步缺失 | 数据更新后列表不刷新 | 添加自动刷新或数据同步提示 |
| API错误处理不明确 | 网络异常时用户无感知 | 添加明确的网络错误提示和重试机制 |

### P2 - 轻微问题 (待修复)
| 问题 | 影响 | 建议修复方案 |
|-----|------|-------------|
| 导出按钮选择器不明确 | 自动化测试困难 | 添加 data-testid 或 class |
| 表单可访问性 | 屏幕阅读器用户可能无法识别字段 | 添加 label 关联和 ARIA 属性 |
| 会话过期处理 | 需长时间观察 | 待验证 |

### 功能缺失 (建议增强)
| 功能 | 优先级 | 建议实现方案 |
|-----|--------|-------------|
| 批量导入功能 | P2 | Excel/CSV 批量导入，支持数据快速录入 |
| 打印/PDF导出 | P2 | 合同打印和PDF导出，便于线下归档 |
| 主题/暗黑模式 | P3 | 添加暗黑模式切换，提升夜间体验 |
| 帮助文档入口 | P3 | 添加帮助中心或用户指南 |
| 列表批量操作 | P2 | 批量选择、删除、导出功能 |
| 表单自动保存 | P2 | localStorage 自动保存草稿 |
| 链接分享功能 | P3 | 合同详情页分享功能 |
| 新用户引导 | P3 | 首次登录 onboarding 流程 |

---

*报告由自动化测试生成，最后更新: 2026-04-02*

## 测试覆盖总览

### 已测试场景 (72个)

| 批次 | 场景范围 | 测试重点 | 状态 |
|-----|---------|---------|------|
| 基础功能 | s1-s12 | 登录、导航、表单、移动端适配 | ✅ 完成 |
| 扩展功能 | s13-s24 | 详情页、分页、筛选、导出 | ✅ 完成 |
| 深度功能 | s25-s36 | AI助手、排序、状态筛选、性能 | ✅ 完成 |
| 边界安全 | s37-s48 | XSS/SQL注入、并发、内存、安全 | ✅ 完成 |
| 扩展场景 | s49-s60 | 导入、打印、主题、面包屑、自动保存 | ✅ 完成 |
| 性能可访问性 | s61-s72 | 加载性能、可访问性、响应式 | ✅ 完成 |

### 发现的问题统计

| 优先级 | 数量 | 代表问题 |
|-------|------|---------|
| P0 - 严重 | 2 | 敏感路径信息泄露、控制台错误过多 |
| P1 - 中等 | 9 | 搜索缺失、排序缺失、数据同步缺失 |
| P2 - 轻微 | 3 | 导出选择器、表单可访问性 |
| 建议增强 | 8 | 批量导入、打印、暗黑模式、帮助文档等 |

### 已修复问题

- ✅ 敏感路径信息泄露 (middleware.ts)
- ✅ 控制台错误过多 (error-logger.ts)
- ✅ 采购管理页面 404
- ✅ 404 页面过于简陋
- ✅ 页面顶部黄色边框
- ✅ 表单验证提示不明确
- ✅ 路由结构不统一 (退税入口)
- ✅ 登录限流逻辑优化
- ✅ 销售合同提交按钮逻辑
