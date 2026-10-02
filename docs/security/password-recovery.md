# 邮箱验证码找回密码

公开找回接口不再接受用户名和手机号作为持有证明。用户向绑定邮箱申请6位一次性验证码，再提交邮箱、验证码、新密码。仅唯一绑定的激活账号可成功；绑定邮箱查询忽略大小写和首尾空格，重复邮箱绝不取第一条。注册验证码不能用于重置。

验证码10分钟有效、最多5次验证；重发冷却60秒，每邮箱5次/小时、每IP10次/小时、全站60次/小时。挑战只保存以JWT私有密钥生成的用途隔离HMAC，IP保存HMAC摘要。未知/停用/重复邮箱与有效邮箱预留同样配额，返回同样的200文案。IP和全站限流仍可返回429，未配置邮件服务则全局返回503。

发码响应不等待DirectMail，避免提供方耗时泄露账号存在性。单次后台投递确认后才激活；无重试、无跨重启恢复队列。失败、不确定或进程退出不会留下可消费代码，需用户冷却后重新申请。新请求即时废弃旧验证码，迟到的投递确认不能重新激活旧码。24小时以前挑战在下一次发码清除；生产数据库仍须按现有Restricted备份/权限策略保护。

SQLite事务先更新迁移初始化的单例写锁，然后读取与预留配额。消费再次验证归属、唯一邮箱、激活状态和签发时会话版本，错误尝试必须提交计数。成功时同事务更新密码、递增版本、废弃所有该用户找回验证码、记录只有用户ID和动作的审计。并发请求跨独立进程最多成功一次；数据库失败拒绝操作并返回固定错误，不输出Prisma参数或云提供方正文。

两个找回HTTP路由直接使用锁定 `express-rate-limit`（发码10次/小时、验证20次/15分钟），不影响独立持久配额；HTTP与数据库请求摘要共用IP归一化，IPv4映射归为IPv4、IPv6按/56聚合。CodeQL的默认模型识别该库；原手写Map限流不在默认模型中，新增告警通过实际替换限流实现与HTTP回归解决，不关闭扫描或dismiss告警。[模型依据](https://github.com/github/codeql/blob/main/javascript/ql/lib/semmle/javascript/security/dataflow/MissingRateLimiting.qll)。

## 代理身份与发布配置

`TRUSTED_PROXY_CIDRS` 默认空，后端不信任外部转发头，未知链路宁可共享代理配额而不接受伪造IP。配置仅接受明确IP/CIDR白名单，不接受true、跳数、命名网段、通配符或/0；坏配置在启动时拒绝。只信任当前TCP对端及转发链中列出的代理，按右到左停止在首个不可信地址，注入的左侧X-Forwarded-For不能替换由代理追加的真实客户端。[Express信任规则](https://expressjs.com/en/guide/behind-proxies/)。

本次不更改生产配置。同机Nginx直连后端的**候选值**为 `TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128`；仅在维护者确认实际Nginx upstream为loopback、转发头追加或覆盖真实远端地址、3001不对公网暴露、没有需另行信任的CDN/负载均衡代理后批准设置。若存在上游代理，先列明实际可信地址范围及每跳头部规则，不使用跳数信任。更新后重启所有后端进程；如PM2已有同名环境键覆盖.env，须明确更新该键，不能仅编辑文件后假定生效。未批准配置时，代理后的用户仍可能共享每小时10次额度，应视为发布前待确认的可用性条件。

`User.sessionVersion` 初始0；登录JWT携带版本，认证每请求读取数据库实时状态。旧无版本JWT按0兼容，到首次改密后永久拒绝；重置、主动改密、管理员重设均递增版本。管理员通过 `/auth/users/:id` 更换绑定邮箱同样递增版本。认证不再依赖60秒用户缓存，增加每请求的数据库读取成本，后续发布前应确认容量。独立Agent credential授权不属于此变更。

新密码统一至少8个Unicode字符且UTF-8不超过72字节；不修改旧密码登录规则。后端服务层和HTTP边界均验证，前端注册/找回/管理员弹窗使用相同规则。没有额外字符类别要求。密码哈希仍使用bcrypt cost12。

## 旧账号处理

没有邮箱、失去邮箱访问、重复绑定或停用账号不能自助找回。页面统一引导联系管理员。管理员需通过既有可信渠道核实真实持有人身份，不能仅比对容易获知的用户名/手机号；核实后通过已认证且ADMIN授权的 `/api/v1/users/:id` 设置符合规则的新密码，或通过 `/api/v1/auth/users/:id` 绑定确认的邮箱后由用户完成OTP。绑定邮箱可访问不等于账号已获开通，停用账号仍须按管理员审核政策处理。此PR不添加公开补绑接口、不自动迁移邮箱、不修改真实账户。

## 迁移及后续发布前条件

`20261002113919_email_password_recovery` 只增加两张挑战/锁表、索引与 `users.sessionVersion` 列，使用 `ALTER TABLE ADD COLUMN` 保留所有历史用户、密码哈希及外键。不能使用 `prisma db push`。

发布由另行人工批准，本PR不合并/部署。后续维护者需先停止服务写入并按现有SQLite备份流程保存受保护快照（目录0700/文件0600），验证备份可读，再应用已审阅迁移、生成Prisma Client并重启所有后端worker。保持现有JWT签名密钥和私有DirectMail环境配置；不要打印配置值。邮件配置缺失应拒绝找回。

具体备份前置：先只读确认当前部署SHA、实际绝对DATABASE_URL、所有writer、磁盘容量与迁移状态，再进入批准的维护窗口停全部writer（后端停机也停止其内置定时任务）。使用SQLite backup API对确认的实际路径创建独立快照，权限0700/0600；验证快照 `PRAGMA quick_check` 为ok、大小/时间/校验和，必要时对受保护恢复副本做只读完整性检查，绝不输出业务行。上次部署日志的实际路径为 `/opt/jiesong_system/current/backend/prisma/dev.db`，不能未经再次确认就照抄。

仓库自动Deploy直接执行migrate deploy，没有备份步骤，main合并会更新当前celerada.link；必须**先验收一致备份，再合并触发部署**。migrate deploy应只剩本次已审阅迁移pending。`backend/scripts/db-backup.js`只复制固定构建目录prisma/dev.db，不保证实际生产路径/WAL一致性；`scripts/backup.sh`直接cp且校验函数定义顺序有问题，均不作为本次生产保障。不要执行有db push回退和pm2 delete all的旧deploy.sh。

在已授权维护窗口且实际路径确认后，最小快照命令如下（本PR未执行）：

```sh
set -eu
umask 077
RECOVERY_DB_PATH=/confirmed/absolute/production.db
RECOVERY_BACKUP_DIR=/confirmed/protected/release-backup
test -s "$RECOVERY_DB_PATH"
install -d -m 700 "$RECOVERY_BACKUP_DIR"
test ! -e "$RECOVERY_BACKUP_DIR/pre-release.sqlite3"
sqlite3 -readonly "$RECOVERY_DB_PATH" ".backup '$RECOVERY_BACKUP_DIR/pre-release.sqlite3'"
chmod 600 "$RECOVERY_BACKUP_DIR/pre-release.sqlite3"
test "$(sqlite3 "$RECOVERY_BACKUP_DIR/pre-release.sqlite3" 'PRAGMA journal_mode=DELETE;')" = delete
test "$(sqlite3 -readonly "$RECOVERY_BACKUP_DIR/pre-release.sqlite3" 'PRAGMA quick_check;')" = ok
sha256sum "$RECOVERY_BACKUP_DIR/pre-release.sqlite3" > "$RECOVERY_BACKUP_DIR/pre-release.sqlite3.sha256"
```

以上需每步成功且quick_check精确为ok后才能继续，不能仅看到文件存在就合并。journal_mode仅在**新快照**上设为DELETE，归档为无需WAL/SHM的单文件，不修改源库；临时合成WAL库已验证已提交且尚未checkpoint的行能进入快照并通过只读校验。维护窗口保持停写直至新版本迁移、Client、所有进程与只读健康校验完成；失败继续停写。仅在另行指定并授权的受控测试邮箱/账号验证真实投递，不能用真实用户密码做实验。尚未核实有可靠生产备份，不代表断言没有备份。

如确需回滚，先停写并恢复批准前数据库快照及匹配代码。回滚到旧代码会重新开放不安全的手机号重置接口，必须在网关关闭该公开入口，不能在未封堵时恢复旧版本。恢复快照也会恢复旧会话版本和旧密码状态，应由运营明确评估会话撤销和数据回滚影响。

优先修正新版本并保留增量schema与sessionVersion。旧认证忽略版本，单纯回退代码可能重新接受未过期旧JWT；若必须回退，先封堵 `/api/v1/auth/reset-password` 及直连入口，并另行确认会话失效策略。整库快照恢复会丢失快照后的业务/密码写入，全站JWT密钥轮换会使所有登录失效，两者均不得包含在默认发布授权中。

## 隔离验证

- `backend/src/utils/passwordPolicy.test.js`：Unicode与bcrypt字节边界。
- `backend/src/integration/password-recovery.integration.js`：迁移保留历史账号/日志；真实HTTP、SQLite及独立进程并发；错误/过期/超次/重放/跨用途验证码；未知邮箱/停用/重复/无邮箱拒绝；持久邮箱/IP/全站限流与并发预留；账号状态/邮箱变更；旧JWT即时失效；改密/管理员重设；敏感日志。
- `backend/src/services/emailRegistration.test.js`：注册继续正常，DirectMail注册/重置邮件用途正确且失败不泄露。
- `frontend/src/app/(auth)/forgot-password/page.test.tsx`：发码提示、冷却、提交、错误恢复和字节边界。
- `frontend/e2e/password-recovery.spec.ts`：真实浏览器表单转发至临时Express/SQLite服务，仅邮件传输使用合成邮箱文件；验证一次消费和旧JWT401。无生产测试路由。

运行后端 `npm run test:all`、前端lint/type/unit/coverage/build及 `npm run test:e2e`。CI的E2E作业安装锁定后端依赖并生成Client以运行隔离夹具。工程ByteRover工具在本环境不可用，仓库无`.agents/skills`及`.brv/context-tree`；安全结论已写入仓库指引与本文档。
