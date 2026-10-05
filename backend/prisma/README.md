# 数据模型与迁移

使用仓库的 `npm run db:migrate` 备份后生成迁移，不运行 `db push`。数据库和备份均为Restricted，不进入Git。

`20261002113919_email_password_recovery` 是增量迁移：新增重置挑战表、单例写锁和用户会话版本，保留用户、原密码和外键；锁行必须初始化，否则找回服务拒绝工作。认证每请求实时验证会话版本，改密后旧JWT失效。测试覆盖真实旧结构上增加版本列并保留历史用户/日志。完整运维和回滚条件见 `docs/security/password-recovery.md`。

`20261005070032_browser_sessions` 只新增摘要化浏览器会话表、用户外键和索引，保持现有用户/业务数据及Bearer会话。上线前由发布预检验证真实DATABASE_URL的一致性在线快照，不能仅依赖开发备份脚本默认路径。回滚保留新增表及后续业务写入，详见 `docs/security/browser-sessions.md`。
