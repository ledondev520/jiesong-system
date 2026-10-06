若本文件夹结构或内容变化，请更新本文件。

`real-hs-catalog.spec.ts` / `real-hs-fixture.ts`：四项1440px真实本地HS验收定义，登录后经出口菜单与HS页签进入；名称与数字编码组合交集/既有截短回退、详情、返回/重载保留查询，手工证据取消/Escape/重开零写入，真正无效来源400保留所有输入、明确纠正后保存、待响应按钮禁用/重复点击拦截、API/列表/整页重载回读，以及BOSS详情可读、写入口隐藏与真实PUT403。每项独占已提交迁移的0700目录/0600SQLite，字典由独立SQLite字面量预置，真实API只透传登录、本地查询与已有手工更新；HS的AI/外部供应商路径和其他业务写入直接拒绝，独立只读回查完整HS行与现有角色审计/其他业务表守恒。普通本地详情没有复制入口，现有两处复制仅在AI结果后出现，因此本轮没有复制通过证据，也不新增功能或调用AI来补覆盖。`playwright test e2e/real-hs-catalog.spec.ts --list`只验证四项定义，真实浏览器执行须走既有hosted CI；本地未执行，不改启动参数、安装浏览器或绕过loopback限制。

`real-role-lifecycle.spec.ts` 增加一项同一用户单条通知已读回归：`notification-state` 场景真实 PURCHASE 登录，只预置该用户的四条通知；双击期间暂缓首条真实 Express 成功响应的交付，不改响应内容。Header 和面板未读数为二，与真实未读 API 及独立只读 SQLite 一致，整页重载仍为二且再点已读行不重写。沿用既有 hosted Playwright 门槛；`--list --grep='repeated notification mark-one'` 仅核对定义，不表示浏览器通过。不涉及生产通知或其他用户权限。

`real-sales-header.spec.ts`：四项1440px真实SALES合同头补充验收，经出口菜单进入既有合同信息。完整草稿取消/重开/重载零写入；四项已有字段普通保存，暂缓交付真正成功响应期间按钮禁用且重复点击只写一次；汇率0的真正400保留全部草稿与原始原因，明确纠正后重试一次；真实认证GET、整页重载及后来取消编辑保持已保存资料。每项独占 `sales-header` 已提交迁移0700/0600私有SQLite，独立只读连接逐行核对金额、采购/装箱、库存、付款和内部单据事实不变及SALES审计。沿用真实Express透传，不mock业务响应、改变空日期/港口既有语义或新增字段，不访问生产、资金转移、发运、单据生成/签约、上传或外部服务。`playwright test real-sales-header.spec.ts --list` 仅核对四项定义，浏览器结果以hosted CI为准。

`onboarding.spec.ts`：390/1440px 合成账号核对流程，确认打开/取消不写入、明确开通后保存一次及列表刷新；不访问生产账号。移动注册回执刷新后仍显示，且明确不是实时审批状态。

目的：验收生产构建的页面和客户端交互；多数用合成 API，明确标注的集成用私有 SQLite 与真实 Express。
边界：不发送真实验证码，不读取或提交真实业务记录；合成 API 不构成真实后端证据，隔离集成也不构成生产验收。
职责：夹具遵循服务 DTO，界面变动后同步断言，保留页面异常和视口检查。

| 名字 | 地位 | 功能 |
| --- | --- | --- |
| helpers.ts | 合成夹具 | 认证、业务 API 与状态；采购 receipts 必须返回 typed summary，邮箱注册仅返回待审核结果 |
| profile-preference-fixture.ts | 本地设置辅助 | 复用真实合成 SALES 登录/迁移夹具，透传 HTTP、只读安全用户字段与明确偏好键，注入单次本地写失败 |
| profile-preference-lifecycle.spec.ts | 个人设置验收定义 | 1440px Header 菜单下完整草稿取消、保存/重开/整页重载、偏好与资料持久化失败后的明确重试 |
| mobile.spec.ts | 移动验收 | 320/390/430px 页面及延迟财务明细滚动、邮箱验证码注册申请、登录退出、表单及错误恢复 |
| button-coverage.spec.ts | 交互验收 | 主要页面按钮、弹窗与无运行时异常检查 |
| smoke.spec.ts | 冒烟验收 | 主要页面与业务入口 |
| visual.spec.ts / snapshots | 可选视觉验收 | 平台相关截图，仅在 VISUAL_REGRESSION=1 时运行 |
| real-export-3d.spec.ts | 真实 SALES 场景验收 | 既有缺尺寸货物的实际绘制、旋转/缩放/平移、响应式尺寸与页签/重载返回，独立 SQLite 零业务写入核对 |
| real-dashboard-sources.spec.ts | 真实工作台验收 | 独立 SQL KPI/资金来源、六笔以外的历史风险、PURCHASE 下一采购任务与 BOSS 只读销售详情、重载和完整业务零写入 |

运行：`CI=1 npm run test:e2e -- --reporter=list,html`（先 `npx playwright install chromium`）。注册验收验证合成发送请求、冷却按钮、待审核提示及无自动登录令牌；后端 `emailRegistration.test.js` 验证真实校验和限流。采购夹具保持 SIGNED/无到货事实，汇总与明细不得伪造已验收库存。

- `business-qa.spec.ts`：390/1440px 合成采购单号搜索，验证既有 keyword 参数、具名详情/合同生成入口及无水平溢出；不写入生产数据。

- `payment-roundtrip.spec.ts`：390/1440px 中文付款备注通过真实浏览器 XHR，以 83 字符 ASCII SHA-256 幂等键提交；取消不写入、重复提交拦截、失败保留全部草稿、原样重试键不变、成功关闭并刷新及整页重载。API 使用合成路由夹具，真实数据库语义由 `trade-lifecycle.integration.js` 覆盖。

- `product-editor.spec.ts`：390/1440px 合成商品编辑验收，关闭/Escape/历史返回后恢复已保存资料，迟到 HS 详情不能回填取消会话；新增/编辑保存失败保留全部输入并原样重试，重复提交拦截，旧保存不关闭新草稿或恢复旧筛选。所有商品和 HS API 均本地路由 mock，不访问生产数据或付费匹配。

- `contract-attachment-auth.spec.ts`：390/1440px 标签 Bearer 登录下的合成文件下载/PNG 解码/PDF Blob 嵌入、403 错误原样显示并重试、关闭后迟到响应与历史返回。检查下载文件名/字节、临时 URL 释放、请求头无凭据 URL 与移动无溢出；不访问生产数据。PDF 仅验证认证读取与嵌入路径，显示仍取决于浏览器 PDF 支持。

- `supplier-editor.spec.ts`：390/1440px 合成供应商档案与采购内联新建，失败保留可重试草稿，取消重开清空未提交值，迟到保存不覆盖新选择、搜索或新弹窗。API全部通过本地route mock，不访问生产业务；质量/别名持久化与冲突回滚由真实隔离HTTP/SQLite回归覆盖。

- `real-role-lifecycle.spec.ts` / `real-role-fixture.ts`：4项1440px真实角色浏览器验收并检查未捕获页面异常，分别覆盖 PURCHASE 到货取消/保存/重载且待验不入库，WAREHOUSE 30件合格与10件待复验/操作者/验货来源/库存自动流转，SALES 缺合格库存发运失败原子回滚、仓库真实HTTP复验后50件发运及重复请求不再扣库，BOSS 采购/销售只读UI与真实403不改业务库。每项/重试独占临时0700目录和0600 SQLite，固定测试账号和密钥仅用于合成夹具；跳过创建表单，不跳过登录或被验收的写事务。
- 角色验收 API 仅透传到 `127.0.0.1` 隔离 Express，没有业务响应 mock 或测试HTTP入口；独立只读 SQLite 连接核对落库。沿用既有 hosted Playwright workflow 与锁定依赖，不改变产品权限、Schema或CI权限。`playwright test real-role-lifecycle.spec.ts --list` 仅验证定义；真实浏览器通过情况以 hosted CI 为准，不把本地HTTP/DB、类型或lint通过称为浏览器通过。
- 角色夹具对子进程显式传递同一 `TMPDIR`，确保自定义临时根目录与后端启动校验一致；仍只传递测试所需环境，不继承数据库或供应商凭据。

- `real-receipt-pool.spec.ts`：3项1440px真实收款池验收，FINANCE将USD1000拆分为两合同300/200，核对独立只读SQLite、真实合同读回、列表刷新/整页重载与剩余500再分配后来源退出池，来源总额与日期/方式/客户信息保持；CNY被真实后端拒绝后草稿完整保留、明确重试仍零写入、取消/Escape/重开与重载不产生收款；BOSS可读池余额但隐藏分配/自动匹配/到账操作，两写路由真实403且业务库不变。验证真实登录身份，不伪造Payment操作者字段。
- 收款池API沿用 `real-role-fixture.ts` 的仅loopback真实HTTP透传，无业务mock；每项/重试独占0700目录、0600 SQLite与限流器，子进程固定 `TZ=UTC`。夹具以schema migrate diff初始化，完整迁移部署由独立后端集成测试覆盖。跳过合同/到账创建表单，不跳过登录/分配事务；不涉及转账、上传、外部供应商、生产数据、FX或新幂等规则。FINANCE写与BOSS只读是本套浏览器覆盖，其他现有可写角色不据此声称浏览器通过；未点击成功自动匹配。
- `playwright test real-receipt-pool.spec.ts --list` 仅验证3项定义；实际浏览器通过情况以既有 hosted CI 为准，本地运行被阻止时不安装/重启浏览器或宣称通过。

- `tax-navigation.spec.ts`：390/1440px 实际 Next 路由下的合成报关列表，验证原生 Back/Forward 筛选与第 1 页恢复、快速逐字搜索输入及关键词/状态/重置保留 `view` 和 `source`、带关键词/状态的详情经 Back/Forward 与明确返回恢复完整来源筛选、随后中断筛选并切换退税页签，以及重复点击/方向键导航。报关/退税 API 写请求直接拒绝；不访问生产数据。定义可由 CI 执行，本地添加定义不代表浏览器验收已通过。

- `dashboard-return-context.spec.ts`：390/1440px 实际 Next 路由下的合成只读工作台/经营报表，验证阻塞范围与已应用日期经销售明细返回、Back/Forward 和整页刷新保留，范围快速切换/原生历史、未应用草稿、倒序日期禁用以及全部期间重置。业务写请求拒绝，检查未捕获页面异常；定义与实际浏览器通过情况分别报告。

- `real-dashboard-sources.spec.ts`：两项1440px已挂载工作台验收；每项/重试独占 `dashboard-sources` 已提交迁移0700/0600 SQLite，通过真实 PURCHASE/BOSS 登录和真实 Express 透传，核对待起草2、待补录1、库存记录3、正确最大年月账期、USD825/CNY1350；最近六笔之外的旧合同经阻塞/风险优先出现且取消合同不出现。PURCHASE 点击真正下一步到采购详情，BOSS 点击只读任务到历史销售详情，均要求真实GET200、可见合同号和整页重载；独立只读完整业务/目录/账期/业务审计快照不变且无业务写请求、无未捕获页面异常。只在现有工作台操作，不访问经营执行/报表，也不为未挂载的 ProductTracker 新增入口。`playwright test real-dashboard-sources.spec.ts --list` 只确认两项定义；实际浏览器由既有 hosted CI 执行，不绕过本地 Chromium/loopback 限制。后端独立 HTTP/SQL 来源证据见 `backend/src/testHelpers/role-browser-dashboard.test.js`。

- `real-role-lifecycle.spec.ts` 新增六项1440px FINANCE内部报关/退税表单验收（每种三项）：新建完整草稿经返回取消/刷新/重开零业务与审计写入；真实重复编号拒绝后保留全部输入，纠正编号重试创建一次，整页重载读回及备注编辑保存/重载，报关明细ID不变；已有记录编辑金额/日期/备注后返回取消，重开恢复原始日期与输入。每项独占 `tax-record-forms` 私有迁移SQLite及真实Express，不mock业务响应，独立只读连接核对整条记录与FINANCE审计操作者。退税编辑使用真实API ISO日期以防空白回填。全部保持DRAFT/已退金额0，不调用正式申报、确认、资金结算、导出、上传或外部服务。`playwright test real-role-lifecycle.spec.ts --list --grep='FINANCE (customs|refunds)'` 仅验证六项定义；浏览器执行以既有hosted CI为准。

- `real-menu-export-documents.spec.ts`：六项1440px真实SALES菜单验收，从登录后的出口合同入口进入详情；覆盖申报三表资料门禁/取消，生成三条关联内部记录/整页重载与报关/退税菜单读回，实际下载XLSX完整标题/表头/明细/金额，双击只发一次但明确再次生成沿用追加版本，商业三单元数据门禁与只读预检取消，确认生成/归档/实际三Sheet下载与重载后归档同字节再下载，以及资料变化导致真正400后保留弹窗、修复并明确重试。每项独占 `menu-export-documents` 的已提交迁移0700/0600私有SQLite和真实Express；只透传真正响应，可暂缓交付但不改业务结果，下载字节复用后端锁定ExcelJS解析。只用合成当前税则和业务资料，不访问生产或真实发票/附件、AI供应商、正式申报、签约或资金/出货操作。`playwright test real-menu-export-documents.spec.ts --list` 仅验证六项定义；真实浏览器执行沿用hosted CI门槛，不尝试绕过本地Chromium或loopback限制。

- `real-export-3d.spec.ts`：一项真实 SALES 菜单验收，复用 `menu-export-documents` 的两箱/0.2CBM缺尺寸合成资料与迁移 SQLite，不增加夹具或改写 HTTP 结果。打开既有3D页签，核对箱数与一项尺寸预估；通过画布自身已保留的 GPU 绘制输出验证有色商品确实可见，旋转/滚轮缩放/右键平移均改变稳定像素，1440→390→1440响应尺寸后仍可操作，页签返回及整页重载再次绘制。就绪条件是跨浏览器动画帧后的实际像素连续三次一致、有色商品像素及画布比例与可见尺寸匹配；不使用任意 sleep、截图基线、Three内部状态或仅Canvas存在断言。鼠标在前后观测时移出画布，排除悬浮高亮；DOM统计/提示不进入像素读取。业务写请求必须为零，独立只读 SQLite 核对合同/装箱/单据/附件完整行不变；pageerror 从测试开始持续检查。严格 console error 观测从 `loginAs` 确认真正 SALES 登录成功后、出口菜单导航前开始，覆盖全部后续业务/3D/重载错误，不按状态码或 WebGL 文本过滤（含不抛异常的 Three 着色器链接错误，橙色边框仍绘制也不能放行）。该边界只把登录准备阶段的无会话 `/auth/session` 探测与被验收业务分开；首轮 hosted trace 已确认唯一控制台错误是登录成功前该 GET 的401，不修改真实认证响应。不涉及截图下载、空货物/WebGL不可用分支、生产资料、上传或外部业务服务。`playwright test real-export-3d.spec.ts --list` 只核对一项定义，浏览器实际执行须由既有 hosted Chromium CI 完成；禁止跳过有色绘制断言、过滤401/WebGL错误或增加浏览器权限/启动参数来绕过环境限制。

- `profile-preference-lifecycle.spec.ts`：四项1440px Header 用户菜单→个人设置定义，复用 `sales-header` 的已提交迁移0700/0600私有 SQLite 和真实合成 SALES 登录。取消姓名/备注/两项偏好草稿后重开及整页重载恢复保存值；保存规范化姓名、备注、紧凑信息密度和最近模块开关后，同标签重开/重载读回；原生偏好写入失败或后续资料持久化失败均保留全部草稿和明确错误，用户重试后成功并重载。后者按现有非原子顺序验证已写入偏好与已变化的内存姓名，不承诺回滚。仅读取 `jiesong_header_user_preferences`；资料写失败注入只匹配 sessionStorage 的目标键，不检查其值，不读认证存储或 cookies。既有真实 `auth/me` 只读核对 id/username/name/role，借通知 GET 原样透传认证上下文，不提取凭据或修改响应。业务写请求拒绝，只有合成登录可 POST，持续检查 pageerror；不上传头像、不请求桌面通知权限、不访问生产账号。此套只验收本地保存生命周期，不代表服务端资料持久化、跨设备同步或偏好已作用到其他页面。`playwright test profile-preference-lifecycle.spec.ts --list` 仅核对四项定义；实际 Chromium 浏览器执行等待既有 hosted CI，本地执行限制不通过安装、启动参数或隧道绕过。
