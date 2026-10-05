# 隔离测试夹具

若本文件夹结构或内容变化，请更新本文件。所有夹具仅用于合成测试，不能指向业务数据库。

- `password-recovery-server.js`：真实认证/SQLite找回流程，邮件仅写入私有合成邮箱文件
- `browser-session-server.js`：真实浏览器会话与认证服务，私有数据库与测试账号
- `purchase-receipt-server.js`：第二个采购HTTP进程，校验多客户端事务
- `reset-consumer.js`：找回验证码消费的独立测试进程
- `role-browser-server.js`：真实Express应用、登录、采购收验货、销售出库、收款池分配、BOSS只读边界；以 migrate diff 创建空的临时SQLite，不运行db push，也不声称验证完整迁移部署。测试用户另含现有 FINANCE 角色；不新增角色政策或生产访问授权。固定账号和密钥明确为测试专用，禁止在生产启用；0700目录/0600数据库，127.0.0.1随机端口，无测试HTTP路由、无生产配置或邮件/AI/外部供应商请求
- `role-browser-server.test.js`：4项原角色流程、自定义临时根目录与3项收款池无浏览器夹具合同测试，使用真实HTTP角色认证和独立只读SQLite核对到货、验货、发运回滚/守恒/重放、BOSS拒写，以及FINANCE美元部分拆分与余额耗尽、人民币拒绝重试零写入、BOSS收款池可读与分配/自动匹配403；运行 `node --test src/testHelpers/role-browser-server.test.js`，也纳入 `npm test`。父子进程仅显式传递同一 `TMPDIR` 与 `TZ=UTC`，不继承数据库或供应商凭据；自定义根目录仍执行0700/0600与真实路径校验

浏览器验收位于 `frontend/e2e/real-role-lifecycle.spec.ts` 与 `frontend/e2e/real-receipt-pool.spec.ts`，由既有 hosted Playwright CI 执行。本地HTTP/DB测试与测试定义检查不代表浏览器通过。初始化仅预置创建表单所需的合成业务；收验货来源与销售装箱按现有领域服务构造，收款池仅预置合同和未分配来源，所有分配都经过真实事务，不放宽认证、限流或权限。完整迁移链另由 `receivable-allocation.integration.js` 等后端集成门槛覆盖。
