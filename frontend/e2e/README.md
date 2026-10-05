若本文件夹结构或内容变化，请更新本文件。

`real-role-lifecycle.spec.ts` 增加一项同一用户单条通知已读回归：`notification-state` 场景真实 PURCHASE 登录，只预置该用户的四条通知；双击期间暂缓首条真实 Express 成功响应的交付，不改响应内容。Header 和面板未读数为二，与真实未读 API 及独立只读 SQLite 一致，整页重载仍为二且再点已读行不重写。沿用既有 hosted Playwright 门槛；`--list --grep='repeated notification mark-one'` 仅核对定义，不表示浏览器通过。不涉及生产通知或其他用户权限。

`onboarding.spec.ts`：390/1440px 合成账号核对流程，确认打开/取消不写入、明确开通后保存一次及列表刷新；不访问生产账号。移动注册回执刷新后仍显示，且明确不是实时审批状态。

目的：验收生产构建的页面和客户端交互；多数用合成 API，明确标注的集成用私有 SQLite 与真实 Express。
边界：不发送真实验证码，不读取或提交真实业务记录；合成 API 不构成真实后端证据，隔离集成也不构成生产验收。
职责：夹具遵循服务 DTO，界面变动后同步断言，保留页面异常和视口检查。

| 名字 | 地位 | 功能 |
| --- | --- | --- |
| helpers.ts | 合成夹具 | 认证、业务 API 与状态；采购 receipts 必须返回 typed summary，邮箱注册仅返回待审核结果 |
| mobile.spec.ts | 移动验收 | 320/390/430px 页面及延迟财务明细滚动、邮箱验证码注册申请、登录退出、表单及错误恢复 |
| button-coverage.spec.ts | 交互验收 | 主要页面按钮、弹窗与无运行时异常检查 |
| smoke.spec.ts | 冒烟验收 | 主要页面与业务入口 |
| visual.spec.ts / snapshots | 可选视觉验收 | 平台相关截图，仅在 VISUAL_REGRESSION=1 时运行 |

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

- `real-role-lifecycle.spec.ts` 新增六项1440px FINANCE内部报关/退税表单验收（每种三项）：新建完整草稿经返回取消/刷新/重开零业务与审计写入；真实重复编号拒绝后保留全部输入，纠正编号重试创建一次，整页重载读回及备注编辑保存/重载，报关明细ID不变；已有记录编辑金额/日期/备注后返回取消，重开恢复原始日期与输入。每项独占 `tax-record-forms` 私有迁移SQLite及真实Express，不mock业务响应，独立只读连接核对整条记录与FINANCE审计操作者。退税编辑使用真实API ISO日期以防空白回填。全部保持DRAFT/已退金额0，不调用正式申报、确认、资金结算、导出、上传或外部服务。`playwright test real-role-lifecycle.spec.ts --list --grep='FINANCE (customs|refunds)'` 仅验证六项定义；浏览器执行以既有hosted CI为准。
