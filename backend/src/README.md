# 后端源码目录

> 若本文件夹结构或内容变化，请更新本文件。

`testHelpers/dashboard-source-seed.js` 与 `role-browser-dashboard.test.js` 增加当前工作台的已提交迁移/真实角色 HTTP 验收：独立 SQL 已知例题核对 KPI、原资金定义、最近六笔之外的历史风险/阻塞、已完成单排除和 PURCHASE/BOSS 实际详情200，并逐表确认业务事实不变。商品追踪仅为额外兼容 API 证据，当前页面未挂载该组件。运行与边界见 `testHelpers/README.md`；不覆盖经营执行/报表或声称浏览器通过。

## 目的

存放后端 API 所有源代码文件，实现进销存系统的完整业务逻辑。

`integration/application-audit-readback.integration.js` 以真实 Express/认证角色、已提交迁移的私有合成 SQLite 与独立 SQL 字面资料/只读全表快照，验证日志关键词/IP、日期/分页、完整记录与12列 CSV 内容，以及现有 ADMIN-only 边界和真实分类生成审计的重复读取。`controllers/system/notificationController.js` 的共享筛选仅使用 SQLite 支持的 `contains`，不传 PostgreSQL 的 `mode`；保留日期、过滤、导出上限与现有权限。只验收应用合成记录，不访问生产、OS日志或真实执行历史；页面没有独立详情路由，此套不声称浏览器通过。由 `npm run test:db` 执行。

`integration/notification-state-lifecycle.integration.js` 只用一个当前合成用户、真实认证 HTTP 与迁移后的 0700/0600 私有 SQLite，验证单条已读及重复完成、重新读取/未读筛选/计数，和全部已读重试；独立只读连接比较全部通知字段，确认只改变已读状态，不新增通知。由 `npm run test:db` 执行，不访问生产或测试其他用户。

`integration/tax-preparation-content.integration.js` 在已提交迁移构建的私有合成 SQLite 中，使用真实 Express HTTP 验证四类内部退税准备内容：当前出货与五 Sheet 工作簿一致；供应商税号/开票日期缺失时明确列出差异，拒绝确认且不改记录；重复预览/导出保持相同内容且不重复归档；多商品行的数量和人民币进货价税与美元出口报价保持独立来源。独立只读 SQLite 比较源行和时间戳；三单由既有生成器产生，船司核对仅用合成结构化夹具。不覆盖浏览器、真实文件、正式申报或收退款，由 `npm run test:db` 执行。

`integration/carrier-pdf-edges.integration.js` 扩展既有 trade-lifecycle 的真实 PDF 正向链路，以内存 PDFKit、实际 Express/default pdfjs/原件归档和已提交迁移创建的私有 SQLite 验证四类边缘：两商品两页匹配与准备度、预期数字出现在片段外仍拒绝错误行数量、纯图片转人工复核、损坏 PDF 返回既有 422 且数据库/归档/准备度不变。保留现有数字存在性及商品身份分段比较，不提供通用表格解析或 OCR。独立 `npm run test:carrier-pdf` 已接入 `test:all`；本次验证既有 `test:db` 为 173 项、新 PDF 命令为 5 项（含四个子用例及外层测试）。详见 `../../docs/qa/carrier-pdf-edges-2026-10-06.md`。

`integration/financial-snapshot-readbacks.integration.js` 用已提交迁移和独立写入/只读回查的 0700/0600 合成 SQLite，通过真实认证 HTTP 验证四类财务读取：跨年账期的独立月度/YTD 报表快照；有序、可空/零/负值及汇总行证据与现有财务/老板边界；全历史人民币供应商差异和分组总计；当前名称搜索下钻的来源 ID、批次元数据、分类与重复读取不改已关联/忽略状态。名称搜索是发现链接，可能包含重叠名称；银行下钻默认 CNY，发票模型无币种字段。不访问真实文件、上传、正式申报或生产数据，不改变报表/对账口径。

`integration/overview-source-readbacks.integration.js` 在已提交迁移构建的 0700/0600 私有合成 SQLite 中，以实际 Express、数据库角色和原全局限流验证三类概览来源：上海发运日闭区间的 CNY 自有收入/已售成本/商品毛利/净现金与相同销售下钻；当前应收应付的正式/派生所有权、取消排除和合同表头已收事实；固定 UTC 日期的 30/90 天收付趋势、原币与类型排除。合成收款流水特意不同于表头余额，分别保留经营执行优先逐笔 USD 流水与财务概览采用表头余额的既有口径。独立 SQL 字面插入与全表只读快照确认期间筛选不改变当前资金/库存、所有成功/拒绝读取不改任何持久字段；当前库存只断言夹具的 1 个活跃商品、2 个 SHIPPED 在途合同和 0 个低库存预警，不涉及估值。不读取生产、不上传、不改变逾期或汇率规则。由 `npm run test:db` 执行，已在当前 CI Node 20.19.0 验证，Date/object-form mock timers 最低需 20.11。

`integration/financial-workbook-import.integration.js` 以真实认证 multipart、内存合成 XLSX 和已提交迁移创建的私有 SQLite 验证十类财务导入：数字公式缓存（含0/负数/小数）、可区分的无缓存及错误/非金额缓存、合法字面量与空值兼容、字符串类型无缓存的已知残余边界、单文件预览凭证/覆盖、三文件现金流/证据/来源回读、整期替换、阻塞输入不写库、晚期 SQLite 失败完整回滚和原请求重试、既有角色/停用/匿名边界。成功写入及覆盖还通过独立只读SQL直接与夹具字面量比较资产、月度/YTD、0、负数、合法空值和现金流/证据金额；三来源类型、文件名、Sheet和计数与固定期望比较，字节数/哈希与原合成文件独立比较，避免HTTP读取服务掩盖错误。金额只读已有缓存；ExcelJS 的 `cell.result` 保留缓存0，仅undefined时惰性查询已使用的SheetJS。两库均不能区分字符串类型缺 `<v>` 与合法空字符串缓存，继续按旧空值兼容，不声称全部缺缓存可检测。由 `npm run test:db` 执行；原文件不归档，不访问生产、浏览器或外部服务。

## 文件清单

`integration/financial-library-source-readbacks.integration.js` 通过原有本地资料库CLI干跑/确认和真实ADMIN/FINANCE认证GET，在已提交迁移、0700/0600私有SQLite中验证两份合成XLS/XLSX来源、三Sheet和61行：专用月报/未知文件跳过、重复导入零写入、原始字节的哈希/大小和来源元数据、账期关联、物理行号/空行间隙、缓存/空值/零/负数/布尔值、分页、持久化前脱敏、分类账期筛选以及其他当前角色/停用/匿名拒绝。独立只读SQL核对固定字面量和全部无关表不变；普通附件目录保持空。随 `npm run test:db` 执行，不构成浏览器或生产验收；与月度工作簿上传入口独立。

| 文件/目录 | 地位 | 功能 |
|-----------|------|------|
| app.js | 入口 | Express 应用初始化和启动（含定时任务启动） |
| config/ | 配置层 | 权限校验后的环境加载、活动 AI 供应商与常量（含单元测试） |
| controllers/ | 控制层 | 处理 HTTP 请求，调用服务层 |
| integration/ | 集成测试层 | 数据库集成测试（空结构/事务/seed 幂等、真实 HTTP 进销存闭环、首个门店创建/RBAC、仓储异常出库/FIFO/来源守恒、收验货后采购更正/补录边界与合同附件 multipart/权限/失败留存矩阵，以及银行流水/发票查询筛选、币种、分类与既有角色边界）；generic-export-content.integration.js 解析七个设置模块的 CSV 下载，覆盖空表头、文本/日期/金额和重复导出的业务只读性 |
| testHelpers/ | 隔离测试夹具 | 登录/找回/采购多进程及真实角色浏览器的私有合成HTTP/SQLite服务；role-browser-server.test.js仅验证夹具真实HTTP和落库，不执行浏览器 |
| jobs/ | 定时任务层 | 库存预警、出口提醒（每月5号退税/缺票提醒）等定时任务 |
| middleware/ | 中间件层 | 认证、仅记录请求结构的性能日志、错误处理（含单元测试） |
| routes/ | 路由层 | 定义 API 路由和参数验证 |
| services/ | 服务层 | 业务逻辑实现；tradeWorkflowService 对已发运事实优先展示完成，历史箱规及采购资料缺口保留为补录提示，未发运门槛保持不变 |
| utils/ | 工具层 | 通用工具函数（含校验/响应单元测试） |

## 控制器清单

| 文件 | 功能 |
|------|------|
| authController.js | 用户认证、授权与找回密码 |
| supplierController.js | 供应商管理 CRUD |
| storeController.js | 门店管理 CRUD + 港口 |
| productController.js | 商品管理 + 历史价格 |
| purchaseController.js | 采购合同 + 经 fileService 收紧权限的附件上传 + 从 UPLOAD_DIR 解析附件下载；旧下载/删除入口复用财务凭证访问边界，旧删除保留既有物理归档 |
| salesController.js | 出口合同 + 价格计算 + 源文件附件；旧下载/删除入口复用财务凭证访问边界 |
| fileController.js | 合同附件；退税确认清单含核验行，所有下载及删除入口经 fileService.assertFileAccess 限制为管理员/财务 |
| taxRefundController.js | 退税记录与工作台、出货材料确认和受限月度导出 |
| containerController.js | 货柜管理 + 装箱明细 |
| inventoryController.js | 库存查询；采购/验货来源状态由业务事实驱动，手工和批量不可绕过 |
| financeController.js | 付款与账款管理 |
| financialStatementsController.js | 月度财务三文件预览、确认导入与账期查询 |
| financialEvidenceController.js | 脱敏财务资料摘要、文档列表与 Sheet 行级下钻 |
| systemController.js | 系统配置（活动 AI 供应商与独立密钥均仅返回脱敏状态）+ 数据导入导出 |
| aiController.js | AI问答 + 辅助录入 + 当前供应商模型说明 + Anthropic 禁止隐式重试 + 统一分页边界的对话历史 |
| aiUsageController.js | AI 用量趋势日期校验、调用明细有界分页与用量汇总 |
| notificationController.js | 统一分页边界的通知列表、已读与生成 |
| system/notificationController.js | 当前用户通知与 ADMIN 应用审计列表/CSV；共用 SQLite 子串、日期及实体筛选 |

## 服务清单

| 文件 | 功能 |
|------|------|
| authService.js | 登录验证、版本化Token、统一密码策略、邮箱验证码找回密码 |
| fileService.js | 合同附件与生成文件受限归档；共用财务凭证访问边界；chmod/失败清理前校验可信上传根路径与本次文件身份，只清理本次新文件，保留其他版本 |
| patrolService.js | 使用 SalesContract 与财务共享发运30天逾期规则；同管理员同标题未读或24小时内告警去重，保留真实汇率过期提醒 |
| financeService.js | 付款幂等、应收应付聚合；收款分配逐行正数/合同校验，SQLite 写锁后检查未关联合同的到账来源和剩余金额，分配子行规范化为 USD；通用创建不得携来源 ID 绕过分配；已收货/已到港合同按真实款项自动结清，差异重新打开待结清 |
| salesCargoLifecycle.js | 销售与旧货柜共用发运/出库证据检查；禁止已出库货物变更及合同删除 |
| salesFinanceService.js | 按共享所有权判定查询自有采购合同，聚合单柜收入、成本、退税与现金流 |
| salesCreationService.js | 出口表头与明细原子创建；既有日志表保存按认证操作者隔离的请求摘要，断线或并发重试复用结果且路由不重复记新建审计；模板失败全部回滚 |
| salesService.js | 装箱增删改与统计在同一事务；发运后禁止增删行或修改数量/单位，单证资料可补录；导入装箱后自动进入装柜；登记到港保留出库，收款齐套自动完成；正式表头金额不被派生金额覆盖；局部保存保留省略汇率，显式无效汇率在写入前返回 400，不改变既有角色及发运后货物边界 |
| importService.js | 历史CSV按非唯一名称检查重名，按id更新；单行事务提交后才计成功并更新缓存，失败回滚且不吞数据库异常，既有合同沿用销售出库约束 |
| financeImportService.js | 银行流水与发票清单解析、识别标题行后的招商银行中英文币种和脱敏账号、按银行/币种/账号及余额轨迹跨来源去重、税务全量导出的数电发票号码识别、同票多明细聚合及批次写入 |
| bankFlowService.js | 银行流水按币种与脱敏账号查询（空币种沿用人民币默认值）、人民币发票对账和美元到账汇总 |
| financeMatchService.js | 银行流水/发票与购销合同匹配；人民币只匹配采购、美元收入只匹配销售；发票自动写入重验 PENDING，人工目标沿用有效且未取消的购销合同规则 |
| invoiceRecordService.js | 发票分页、筛选后有效/红冲分类统计、销方汇总及完整发票号码批量精确查询 |
| invoiceVerificationService.js | 出口退税候选发票的销方、价税合计、品名、状态只读一致性核验 |
| financialStatementsService.js | 会计报表数字公式缓存/既有空值兼容与明确错误指引、科目余额/明细账同账期校验，单事务写入与下钻查询 |
| financialEvidenceService.js | 工资、税务、凭证与日记账等资料的分类、脱敏、幂等导入与受限查询 |
| ai/contextService.js | 按当前销售合同港口关联构造美元上下文；局部查询失败保留其他资料并提示不可用，解析汇率后继续拼接财务概况 |
| aiService.js | DeepSeek/Kimi 活动供应商、DeepSeek 独立密钥与 flash thinking/high、完整时限、零重试与流式用量 |
| anthropicCompatService.js | Open Agent 的 OpenAI 协议适配，保留思考/工具回合与图像，共用请求时限及模型参数 |
| openAgentService.js | 出口详情复用销售服务从装箱行计算拼柜来源；内部草稿按请求直接执行；其他写操作一次确认；当前 AI 客户端校验与零自动重试、工具角色与执行回放；SDK 错误终止传播为 503/SSE error，不写成功记录 |
| agentReplaySummaryService.js | Agent 回放摘要持久化，支持复用外层事务客户端 |
| importService.js | CSV数据解析与导入 |
| exportService.js | 多格式数据导出（CSV + 出口合同五 Sheet Excel 含商业发票/税务测算）；收付款 CSV 沿用财务现有 PAYABLE/PAYABLE_PAYMENT/EXPENSE 应付分组，只转换标签 |
| pdfExportService.js | 销售合同 / 系统数据 PDF 导出 |
| exportReadinessService.js | 全量出口装箱行、逐行确认优先的 HS/申报要素/货源地、出口价格与采购专票口径退税准备度 |
| exportPacketService.js | 出口三单预检、现汇减 0.2 定价、历史报价筛选、逐行申报资料、三 Sheet 生成与受限归档 |
| threeFormsService.js | 基于出口准备度预览/生成报关单、外汇核销单、出口退税单与三 Sheet Excel |
| taxCalculationEngine.js | 将出口准备度转换为统一税务摘要与 Excel/PDF，不内置税则小表 |
| hsCodeService.js | HS 本地/AI 检索与强制来源证据的人工税则更新 |
| hsciqService.js | HSCIQ 查询缓存、并发请求共享、配额预留、可校准总超时与受控上游错误 |
| packingListCheckService.js | 船司装箱单 PDF 受限归档、逐商品比对、历史记录与人工复核结论 |
| purchaseInvoiceService.js | 从采购事实生成催票清单，规范化多发票号码并读取选填附件 |
| taxRefundPreparationService.js | 2026 退税材料清单；区分签署件/生成件、提运单/装箱单；导出出货关联与自动核验 |
| taxRefundShipmentService.js | 按报关单归集出货资料、机器核验、版本确认归档与全量跨月准备汇总；技术时间戳不触发重新确认 |
| taxRefundWorkbenchService.js | 保留既有查询；按申报月份展示逐次出货准备与确认状态，不冒充正式申报 |
| taxRefundExportService.js | 退税记录与采购合同、发票号码、征税率的导出前严格匹配 |
| exportReminderService.js | 次月5号内部退税材料准备提醒、已出货缺发票提醒（幂等通知） |
| patrolService.js | 业务 / 系统巡检、管理员通知、系统操作日志 |

## 工具清单

- `testHelpers/hs-code-browser-server.js` / `.test.js`：独占0700目录/0600SQLite，通过已提交迁移初始化三条独立SQLite字面量HS记录与六种现有角色；真实登录/HTTP和独立只读回查验证本地组合查询及已有ADMIN/PURCHASE/FINANCE人工证据维护。组合查询用已召回候选ID限定既有Prisma名称contains查询，只收紧候选集合，保留原候选分数与组合截短回退；名称单独的模糊召回、数字检索及code-only截短回退保持原实现。所有来源链接为合成example.invalid，不访问外部来源或AI；随`npm test`执行，完整证据见`../../docs/quality/HS本地字典回归_20261006.md`。

- `controllers/system/portCategoryController.js` 和 `customsBrokerController.js` 沿用档案表单的必填名称/港口代码规则：显式空白或 null 更新在持久化前返回 400，省略字段仍保留；报关行选填字段显式 null 清空为数据库 null，避免保存字符串“null”。不新增唯一性或删除规则。
- `integration/catalog-form-lifecycle.integration.js` 在迁移后的私有合成 SQLite 中，以真实 HTTP 验证港口、商品分类和报关行三类创建/编辑/列表回读。独立只读 SQLite 回读检查空白、现有重复键和缺失父级导致的失败不改变既有字段或时间戳；不覆盖浏览器、权限或生产数据。

| 文件 | 功能 |
|------|------|
| prisma.js | Prisma 客户端实例，不打印查询/异常参数 |
| response.js | 统一响应格式 |
| pagination.js | 统一分页归一化与安全整数 offset 上限 |
| validators.js | 参数验证规则，非法或超大列表页码返回 400 |
| upload.js | 文件上传 (multer)；启动磁盘流前验证可信根下的日期目录无子别名并保护为 0700，目录故障经回调拒绝；文件 0600 仍由附件服务在异步查询前收紧 |
| auditLog.js | 操作日志记录 |
| aiCache.js | HS AI 推荐结果缓存；命中直接返回，不模拟等待 |

- WPS同步状态：`services/wpsSyncStatusService.js` 从受限本机回执提供汇总；认证后的 `GET /dashboard/wps-sync` 返回最近成功时间、失败/过期状态及待核对数量，不返回源文件、摘要或业务明细。超过90分钟未核对标记过期。

- 采购模板：`routes/procurementTemplate.js` 的门店列表、通用模板、历史采购明细三个读取入口均先执行 `authenticate`，保持既有响应格式。

- `inventorySnapshot.js`：以自有装箱行扣减对应采购来源、单位的合格库存，旧销售明细兼容不双计；回滚保留验货来源；实际自有出库数量必须有限且为正，草稿零值、非自有拼柜与价格/单证补录不受影响。
- `containerService.js`：旧货柜状态入口委托 `salesService.updateSalesStatus`，沿用单向流转、装载校验、结清检查与原子扣库；新建只允许草稿，表头保存只能携带未改变的状态。真实权限拒绝、取消重试、旧入口绕过及缺库存回滚见 `integration/sales-role-exceptions.integration.js`。
- `salesService.updateSalesStatus` 以规范化后的当前状态判断真实流转，历史 `OUT_STOCK` 重放 `SHIPPED` 只规范状态，不重新校验装载、改发运时间或扣库。
- `integration/sales-partial-metadata.integration.js` 使用真实认证 HTTP 和独立只读 SQLite 回读，验证备注/日期/港口局部保存、必填汇率省略与显式无效输入、既有可写角色/BOSS 拒绝以及发运/结清后的货物与出库保护；仅创建 0700/0600 临时合成库。
- `integration/bank-import-lifecycle.integration.js` 用已提交迁移和真实认证 HTTP 验证银行预览放弃不落库、混合行按既有语义部分导入、账号/币种及批次行数/余额、重放保留已关联/忽略来源及老板只读边界；工作簿仅在内存中生成，独立只读 SQLite 回查且不改合同/付款/会计余额，由 `npm run test:db` 执行。
- `integration/invoice-linkage-boundaries.integration.js` 仅以迁移后的私有合成 SQLite、内存工作簿及真实认证 HTTP 验证三类发票链路：预览/重复导入保留来源与分类，失败/重复解除关联及既有角色边界；不存在、错类型、已取消的人工目标不覆盖确认；跨进程旧自动候选不覆盖较新的人工确认/忽略，且正常匹配与重放仍可用。独立只读回读验证匹配不改会计/付款/合同金额；不覆盖真实导入文件、银行导入、浏览器或同分候选规则。
  `InvoiceRecord` 没有更新时间或匹配版本字段；解除关联把匹配字段还原为空并重置为 `PENDING`。若旧自动请求读取后先人工确认、再解除回到相同 `PENDING` 状态，现有字段无法区分该 ABA 序列，继续沿用待匹配发票可重新自动匹配的语义；此回归不扩展 schema。
- `integration/supplier-editor.integration.js` 的成功写请求带唯一合成请求ID；关闭HTTP后先确认这些请求的真实审计行全部落库，再断开并删除临时SQLite，避免异步 response-finish 审计与清理竞争；不修改生产审计行为。
- `customsDeclarationDraftService.js`：编号包含出口合同号，原子替换仅限 DRAFT，保留 ID 与编号并拒绝覆盖已放行单。

- `utils/inventoryStateMachine.js` 的来源约束用于普通/批量库存接口和 AI 工具，AI 确认时重新检查；相同状态请求不修改 FIFO 时间。

邮箱注册由 `services/emailService.js` 对接阿里云杭州 DirectMail，`services/emailRegistrationService.js` 负责持久化限流、验证码消费和待审核账号；公开接口为 `POST /auth/email-code`、`POST /auth/email-register`。管理员创建和审核入口保持不变。

`routes/rbac-write-routes.test.js` 明确列举登录前邮箱注册入口，检查限流/校验与管理员创建账号权限。`services/openAgentService.js` 只加载锁定的已发布 SDK 构建；两种 Agent 入口显式使用本地 Anthropic 协议，加载、单次请求和失败终止由 `openAgentService.test.js` 回归。

密码找回由 `services/passwordResetService.js` 处理，使用独立于注册的挑战表、持久配额和SQLite单例写锁；公开发码响应不泄露账号存在性，成功消费与改密、会话版本撤销和审计同事务。`middleware/auth.js` 每请求实时校验状态及版本；`utils/passwordPolicy.js` 统一新密码策略。真实HTTP/SQLite及跨进程消费覆盖在 `integration/password-recovery.integration.js`，浏览器真实后端夹具在 `testHelpers/`，详细约束见 `docs/security/password-recovery.md`。

找回路由直接使用锁定 `express-rate-limit` 并与持久IP配额共用IPv4映射/IPv6 /56归一化。`config/trustedProxies.js` 验证显式代理IP/CIDR，`app.js` 默认不信任转发头；只有经运行环境核实后设置 `TRUSTED_PROXY_CIDRS` 才启用。真实HTTP回归覆盖无信任/非白名单代理头不能绕过、白名单代理停止在首个不可信地址、不同客户端配额独立及IPv6/映射地址跨进程本地计数重置仍受数据库配额保护。

## 采购合同编号与生命周期回归

- `services/purchaseContractNumberService.js` 统一采购创建、编号预览和批量导入的 `CGyy` 序列：按现存合法数字后缀最大值加一，删除早期草稿不会与仍存在的编号碰撞；预览不预留编号
- `agent/commands/purchase/createPurchaseWithItems.js` 在合同与明细事务内分配编号，对自动编号唯一冲突或事务写冲突最多重试三次；不更改用户指定编号，也不重试无关数据库错误
- `services/purchaseImportExportService.js` 的实际 Excel 导入复用统一序列；非空非法金额及不存在的日历日期逐行拒绝，逗号空壳金额及金额/日期 Excel 错误单元格不退化为空值；检测原单元格时计入工作表范围起点。可识别的数值/无类型公式缺少结果缓存时逐行提示重新计算/保存，已有数值、零及空字符串缓存继续使用，不执行公式；字符串空结果与缺缓存的读取歧义见采购 Excel 回归文档。空日期/金额沿用 null/0，保留数值日期、逗号千位分隔的点小数金额和零金额；每行校验通过后原子写入，仅空编号的唯一冲突最多尝试五次，保留显式编号及逐行失败统计
- `integration/purchase-excel-import.integration.js` 以真实 multipart HTTP、合成工作簿和已提交迁移构建的私有 0700/0600 SQLite 验证六类当前采购 Excel 导入：有效值、缺必需表头/文件、逐行错误、非法非空金额/日期拒绝、显式编号与空编号重传、历史完成状态确认。独立只读 SQLite 比较原记录及关联表，不访问生产或宣称浏览器验收。
- `integration/procurement-lifecycle.integration.js` 仅用临时合成 SQLite 和实际 PURCHASE/WAREHOUSE HTTP 请求验证签约、完工回滚/重复、到货与复验幂等、库存列表/详情、删除后编号及同时创建；还验证实际 Excel 导入的自定义编号、五位序列溢出、失败行无写入及四请求并发，由 `npm run test:db` 执行

- `services/batchImportService.js` 的 JSON 采购导入先拒绝非对象行、空白/非文本供应商与商品名称，避免缺省查询条件误选首条目录记录；数量必须有限且大于零，单价必须有限且非负，只接受数字或非空数值字符串，保留零单价。每行事务提交合同与明细；自动编号冲突或事务写冲突最多尝试五次，不更改显式编号，不重试无关错误；失败行回滚且后续行继续
- `integration/purchase-batch-import.integration.js` 通过真实认证 HTTP/30次迁移后的临时 SQLite 验证四请求并发、SQL 明细故障无孤立合同、部分成功、显式/溢出编号及原有 RBAC；补充非法行形状前后继续、缺省名称不误配、数量/单价范围与类型、跨请求显式编号重试，以及编号预览不保存/多明细创建失败全回滚和修正重试。拒绝操作对合同、明细、目录及来源库存使用完整落库快照校验，由 `npm run test:db` 执行；这不是采购页面 Excel 导入或浏览器预览验收

- `integration/purchase-receipt-exceptions.integration.js` 使用实际 PURCHASE HTTP 认证、临时 SQLite 及第二个 HTTP 进程，补充并发同请求/内容冲突、合法到齐/竞争超订、累计复验、跨批引用、整批回滚、真实库存 SQL 故障后原请求重试和既有受限财务/管理 RBAC；不修改既有普通销售与付款权限，由 `npm run test:db` 执行

## 浏览器会话

`services/browserSessionService.js` 与 auth Controller/routes/middleware 提供可选HttpOnly固定期限会话、来源/CSRF验证和逐浏览器撤销，保留Bearer兼容。`integration/browser-session.integration.js` 与 `testHelpers/browser-session-server.js` 使用隔离SQLite验证，不访问生产。设计及回滚：`docs/security/browser-sessions.md`。

`middleware/apiRateLimit.js` 使用已锁定express-rate-limit保留全局100/min和原429/重试响应，挂载在JSON解析与所有路由之前；规范IP但不自动信任代理。`apiRateLimit.test.js` 验证100/101边界、恶意XFF、IPv4/IPv6归一、显式代理与原10/15min登录限制。所有独立认证HTTP测试服务器同样挂载此门槛。

全局及原登录HTTP配额仍按进程内存计数，重启清空、worker独立；数据库持久的邮箱/密码找回配额保持独立，不把HTTP计数当作分布式持久限制。

- `services/threeFormsService.js` 的三表XLSX把报关明细表头追加在独立第4行，并对该行应用原有表头样式，保留第1行合并标题与第2行单据信息。真实角色HTTP下载/ExcelJS字节解析回归在 `testHelpers/role-browser-server.test.js` 的六项 `menu documents HTTP`；原生成/编号追加规则不变，不涉及附件上传或正式申报。
