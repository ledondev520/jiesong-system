# 后端源码目录

> 若本文件夹结构或内容变化，请更新本文件。

## 目的

存放后端 API 所有源代码文件，实现进销存系统的完整业务逻辑。

## 文件清单

| 文件/目录 | 地位 | 功能 |
|-----------|------|------|
| app.js | 入口 | Express 应用初始化和启动（含定时任务启动） |
| config/ | 配置层 | 权限校验后的环境加载、活动 AI 供应商与常量（含单元测试） |
| controllers/ | 控制层 | 处理 HTTP 请求，调用服务层 |
| integration/ | 集成测试层 | 数据库集成测试（空结构/事务/seed 幂等及真实 HTTP 进销存闭环） |
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
| purchaseController.js | 采购合同 + 经 fileService 收紧权限的附件上传 + 从 UPLOAD_DIR 解析附件下载 |
| salesController.js | 出口合同 + 价格计算 + 源文件附件 |
| fileController.js | 合同附件；退税确认清单含核验行，下载及删除仅允许管理员/财务 |
| taxRefundController.js | 退税记录与工作台、出货材料确认和受限月度导出 |
| containerController.js | 货柜管理 + 装箱明细 |
| inventoryController.js | 库存状态管理 |
| financeController.js | 付款与账款管理 |
| financialStatementsController.js | 月度财务三文件预览、确认导入与账期查询 |
| financialEvidenceController.js | 脱敏财务资料摘要、文档列表与 Sheet 行级下钻 |
| systemController.js | 系统配置（活动 AI 供应商与独立密钥均仅返回脱敏状态）+ 数据导入导出 |
| aiController.js | AI问答 + 辅助录入 + 当前供应商模型说明 + Anthropic 禁止隐式重试 + 统一分页边界的对话历史 |
| aiUsageController.js | AI 用量趋势日期校验、调用明细有界分页与用量汇总 |
| notificationController.js | 统一分页边界的通知列表、已读与生成 |

## 服务清单

| 文件 | 功能 |
|------|------|
| authService.js | 登录验证、Token生成、密码管理、找回密码 |
| financeService.js | 付款幂等、应收应付聚合；已收货/已到港合同按真实款项自动结清，差异重新打开待结清 |
| salesFinanceService.js | 按共享所有权判定查询自有采购合同，聚合单柜收入、成本、退税与现金流 |
| salesService.js | 导入装箱后自动进入装柜；登记到港保留出库，收款齐套自动完成；正式表头金额不被派生金额覆盖 |
| financeImportService.js | 银行流水与发票清单解析、识别标题行后的招商银行中英文币种和脱敏账号、按银行/币种/账号及余额轨迹跨来源去重、税务全量导出的数电发票号码识别、同票多明细聚合及批次写入 |
| bankFlowService.js | 银行流水按币种与脱敏账号查询、人民币发票对账和美元到账汇总 |
| financeMatchService.js | 银行流水/发票与购销合同匹配；人民币只匹配采购、美元收入只匹配销售 |
| invoiceRecordService.js | 发票分页、统计、销方汇总及完整发票号码批量精确查询 |
| invoiceVerificationService.js | 出口退税候选发票的销方、价税合计、品名、状态只读一致性核验 |
| financialStatementsService.js | 会计报表、科目余额、明细账同账期校验，单事务写入与下钻查询 |
| financialEvidenceService.js | 工资、税务、凭证与日记账等资料的分类、脱敏、幂等导入与受限查询 |
| aiService.js | DeepSeek/Kimi 活动供应商、DeepSeek 独立密钥与 flash thinking/high、完整时限、零重试与流式用量 |
| anthropicCompatService.js | Open Agent 的 OpenAI 协议适配，保留思考/工具回合与图像，共用请求时限及模型参数 |
| openAgentService.js | 内部草稿按请求直接执行；其他写操作一次确认；当前 AI 客户端校验与零自动重试、工具角色与执行回放；SDK 错误终止传播为 503/SSE error，不写成功记录 |
| agentReplaySummaryService.js | Agent 回放摘要持久化，支持复用外层事务客户端 |
| importService.js | CSV数据解析与导入 |
| exportService.js | 多格式数据导出（CSV + 出口合同五 Sheet Excel 含商业发票/税务测算） |
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

| 文件 | 功能 |
|------|------|
| prisma.js | Prisma 客户端实例 |
| response.js | 统一响应格式 |
| pagination.js | 统一分页归一化与安全整数 offset 上限 |
| validators.js | 参数验证规则，非法或超大列表页码返回 400 |
| upload.js | 文件上传 (multer) |
| auditLog.js | 操作日志记录 |
| aiCache.js | HS AI 推荐结果缓存；命中直接返回，不模拟等待 |

- WPS同步状态：`services/wpsSyncStatusService.js` 从受限本机回执提供汇总；认证后的 `GET /dashboard/wps-sync` 返回最近成功时间、失败/过期状态及待核对数量，不返回源文件、摘要或业务明细。超过90分钟未核对标记过期。

- 采购模板：`routes/procurementTemplate.js` 的门店列表、通用模板、历史采购明细三个读取入口均先执行 `authenticate`，保持既有响应格式。

- `inventorySnapshot.js`：以自有装箱行扣减对应采购来源、单位的合格库存，旧销售明细兼容不双计；回滚保留验货来源。
- `customsDeclarationDraftService.js`：编号包含出口合同号，原子替换仅限 DRAFT，保留 ID 与编号并拒绝覆盖已放行单。
