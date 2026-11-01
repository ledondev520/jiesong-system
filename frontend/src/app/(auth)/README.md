# 认证页面

登录保留旧用户名/密码兼容。注册通过邮箱验证码申请待审核账号。

找回密码仅接受绑定邮箱的一次性验证码与新密码，发码反馈统一、60秒重发冷却；成功后清理当前标签认证并要求重新登录。无邮箱、邮箱失效或停用账号提示联系管理员核实，用户名/手机号不能直接重置。新密码策略在 `../../lib/password-policy.ts`，与后端策略同步，至少8个Unicode字符且UTF-8不超过72字节。

隔离交互测试在各页面旁，真实浏览器+临时后端验收在 `frontend/e2e/password-recovery.spec.ts`；完整方案见 `docs/security/password-recovery.md`。

登录页新增默认关闭的“保持登录”，只保留至现有会话到期，退出/改密失效，提示共用设备勿勾选。不保存密码，不向JS返回持久凭据。进入时验证已有会话，不续期；登录禁止重复提交，取消/离开后忽略延迟结果。真实Cookie/Next代理验收：`frontend/e2e/browser-session.spec.ts`。

注册与找回密码页使用 `components/auth/AuthShell.tsx`（与登录页一致的品牌头部/页脚），卡片标题是各页唯一 `h1`；每个认证页在同目录 `layout.tsx` 设置独立页面标题（根布局模板 `%s · 捷淞`）。常显密码提示为 `PASSWORD_HINT`（至少8位），72字节上限仅在校验失败的 `PASSWORD_MESSAGE` 中说明。
