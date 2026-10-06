# 隔离测试夹具

若本文件夹结构或内容变化，请更新本文件。所有夹具仅用于合成测试，不能指向业务数据库。

`role-browser-server.js` 的 `notification-state` 场景只给当前合成 PURCHASE 用户预置四条现有通知（三条未读），不调用通知生成器或访问生产。新增同场景夹具合同测试通过真实登录、重复单条已读请求和独立只读 SQLite 核对未读数为二；可用 `node --test --test-name-pattern='own notification mark-one' src/testHelpers/role-browser-server.test.js` 单独执行。角色及其他场景语义不变。

- `password-recovery-server.js`：真实认证/SQLite找回流程，邮件仅写入私有合成邮箱文件
- `browser-session-server.js`：真实浏览器会话与认证服务，私有数据库与测试账号
- `purchase-receipt-server.js`：第二个采购HTTP进程，校验多客户端事务
- `reset-consumer.js`：找回验证码消费的独立测试进程
- `role-browser-server.js`：真实Express应用、登录、采购收验货、销售出库、收款池分配、BOSS只读边界；原有场景以 migrate diff 创建空的临时SQLite；`tax-record-forms` 场景通过已提交迁移的 migrate deploy 初始化同类私有数据库，不运行db push，也不声称验证完整迁移部署。测试用户另含现有 FINANCE 角色；不新增角色政策或生产访问授权。固定账号和密钥明确为测试专用，禁止在生产启用；0700目录/0600数据库，127.0.0.1随机端口，无测试HTTP路由、无生产配置或邮件/AI/外部供应商请求
- `role-browser-server.test.js`：4项原角色流程、自定义临时根目录与3项收款池无浏览器夹具合同测试，使用真实HTTP角色认证和独立只读SQLite核对到货、验货、发运回滚/守恒/重放、BOSS拒写，以及FINANCE美元部分拆分与余额耗尽、人民币拒绝重试零写入、BOSS收款池可读与分配/自动匹配403；运行 `node --test src/testHelpers/role-browser-server.test.js`，也纳入 `npm test`。父子进程仅显式传递同一 `TMPDIR` 与 `TZ=UTC`，不继承数据库或供应商凭据；自定义根目录仍执行0700/0600与真实路径校验

浏览器验收位于 `frontend/e2e/real-role-lifecycle.spec.ts` 与 `frontend/e2e/real-receipt-pool.spec.ts`，由既有 hosted Playwright CI 执行。本地HTTP/DB测试与测试定义检查不代表浏览器通过。初始化仅预置创建表单所需的合成业务；收验货来源与销售装箱按现有领域服务构造，收款池仅预置合同和未分配来源，所有分配都经过真实事务，不放宽认证、限流或权限。完整迁移链另由 `receivable-allocation.integration.js` 等后端集成门槛覆盖。

`tax-record-forms` 仅预置一个草稿出口合同、一条草稿报关及退税记录供表单选择、取消与重复编号测试。数据库先以0600创建，迁移子进程暂用022 umask，目录保持0700；不生成共享Prisma client。FINANCE普通CRUD经过真实认证/服务/SQLite；两项无浏览器合同测试覆盖重复编号500零写入、纠正编号后201、日期ISO读回、备注编辑200、报关商品明细ID保留和真实用户审计。运行 `node --test --test-name-pattern='FINANCE internal' src/testHelpers/role-browser-server.test.js`。浏览器的六项创建取消、失败保留/重试/创建及编辑保存、编辑返回取消在既有 `real-role-lifecycle.spec.ts`；本地HTTP通过不代表浏览器通过。所有记录均为合成DRAFT，不调用正式申报、确认、资金结算、附件或外部服务。

`menu-export-documents` 在已提交迁移初始化的同类私有SQLite中，只预置一份PACKING出口合同、自有采购来源装箱行及合成当前HS/13%退税证据。六项同名HTTP合同测试覆盖缺证据预检/拒绝生成/放弃零写入，三表关联DRAFT/PENDING读回与实际XLSX标题/明细/金额，明确再次生成沿用追加版本与精确ID导出，商业三单只读预检/放弃，确认后0700/0600归档及重复下载同字节，资料变化导致真实400零生成后明确修复重试。不改变追加版本语义或税则规则；不上传附件、正式申报、确认退税、签约/资金/实际出货，也不调用外部服务。运行 `node --test --test-name-pattern='menu documents HTTP' src/testHelpers/role-browser-server.test.js`；浏览器定义另在 `real-menu-export-documents.spec.ts`，本地HTTP通过不代表浏览器通过。

- `role-browser-header.test.js`：两项独立合同头HTTP夹具检查，不扩展已达500行的原合同测试文件。`sales-header` 场景通过已提交迁移初始化0700目录/0600 SQLite，仅预置PACKING合同、现有金额及采购来源装箱事实和两港口/门店选项。真实SALES登录后保存全部四项已有头字段；独立只读SQLite逐行核对金额、采购/装箱、库存、付款及单据事实不变，真实GET重复读回。汇率0导致真实400且零业务/审计写入，明确纠正重试只记一次SALES审计。运行 `node --test src/testHelpers/role-browser-header.test.js`，随 `npm test` 自动发现。不存在付款、发运、单据生成/签约、上传、生产或外部供应商操作；不改变空日期/港口既有语义，不声称浏览器通过。
