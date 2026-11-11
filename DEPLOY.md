# 捷淞系统 线上部署指南

## 当前 VPS 部署

公网入口为 `https://celerada.link`（`www.celerada.link` 同样支持 HTTPS）。Nginx 将页面代理到 3002、API 代理到 3001。

Git 构建目录为 `/opt/jiesong-system`。PM2 的 `jiesong-backend` 和 `jiesong-frontend` 必须分别使用该目录内的 `backend`、`frontend`，不能指向已停用的旧目录 `/opt/jiesong_system`（A88 于 2026-11-09 完成切换）。PM2 重启不会自动纠正旧脚本路径；首次切换需要备份配置、使用正确路径重新创建这两个进程，并保留回滚配置。

服务器 Node.js 基线为 **>=22.23.4**，生产 PM2 已使用 `/opt/jiesong-system/runtime/node-v22.23.4-linux-x64`。SSH 部署及 `deploy.sh` 共用 `scripts/require-node-runtime.sh`，在 npm/npx、Prisma、构建和部署验证前将 `NODE_RUNTIME/bin` 放在 PATH 首位，并校验 node 可执行、`command -v node` 与指定路径一致及版本达标；失败立即退出，不回退系统 Node。SSH 部署从 runner 的目标提交（DEPLOY_SHA）检出读取守卫，以仅含 base64 字母表的参数传到远端，解码后 source，在定价配置备份和任何 Git 命令前完成运行时校验，不依赖服务器旧检出是否含守卫。runner 缺少/无法读取守卫立即失败。手动 deploy.sh 仍从自身目录加载守卫。专用运行时须提前安装；`deploy.sh` 不再安装系统 Node。

`NODE_RUNTIME` 默认使用上述目录；Actions 可通过仓库变量 `NODE_RUNTIME` 覆盖，手动执行 `deploy.sh` 时通过环境变量传入。值须为不含冒号的绝对目录；SSH 以编码参数传递后作为引用数据读取，不拼接为可执行代码。手动运行 `scripts/verify-vps-runtime.cjs` 前也应先在仓库根目录执行 `. scripts/require-node-runtime.sh`。

生产数据库位于 `/opt/jiesong-system/data/prod/dev.db`，环境配置中的 DATABASE_URL 与 UPLOAD_DIR 使用 `/opt/jiesong-system` 下的绝对路径。迁移时复制现用的私密配置并设为 0600，不使用构建目录里另一份数据库代替生产数据；先创建一致的数据库备份。

每次发布后执行 `node scripts/verify-vps-runtime.cjs https://celerada.link`。它核对 PM2 运行目录、后端健康、公网登录页 BUILD_ID、手机缩放和 API 认证边界；GitHub Actions 已调用此检查。首次切换还应从 VPS 核对根域名及 www 的 DNS、HTTPS 证书、HTTP 跳转，再在手机尺寸下检查公网登录页。

GitHub Actions 在 `sudo nginx -t` 成功并重载 Nginx 后才调用此检查；配置测试失败会显式以非零退出，跳过重载和发布验证。

生产 SQLite 为 WAL 模式，运行中的 `jiesong-backend` 会使 `prisma migrate deploy` 报 "database is locked"。SSH 发布脚本因此先用只读的 `npx prisma migrate status` 判断：已是最新则跳过 `migrate deploy`，仅构建并重启；仅当输出为"有待应用迁移"时，在前后端构建完成后才 `pm2 stop jiesong-backend` → `migrate deploy` → 重启，并以 EXIT trap 保证失败时先重新启动后端再以非零退出。迁移失败/历史不一致/其他错误一律硬失败，且不停止后端。未假定 `pm2 reload`（仓库无 ecosystem 配置），仍用 `pm2 restart`。待应用迁移的发布现在在 `pm2 stop` 之后、`migrate deploy` 之前自动用 `sqlite3 "$DB" ".backup $SNAP"` 对生产库做在线快照（`DATABASE_URL` 取自 `backend/.env` 的 `file:` 路径，无法解析则在停后端前中止；目录 `/opt/jiesong-system/deploy-backups/auto-premigrate-<SHA前7位>-<UTC时间>/` 为 0700、文件 0600，并做 `PRAGMA integrity_check`，打印路径）。迁移失败时 trap 仍会重启后端（保持 API 不宕），随后打印 `MIGRATION FAILED: ... snapshot at <路径>` 并以非零退出，按 `docs/operations/production-rollback.md` 处理。注意：失败后重启的后端运行在部分迁移的库上，此后的写入不在快照内，回滚恢复快照会丢失这些写入；同一时间只允许一个生产发布（`deploy-production` concurrency 组，不取消进行中的发布）。自动快照不替代 AGENTS.md 要求的发布前人工在线快照。

手动部署使用 `gh workflow run deploy.yml --ref main -f environment=production`；必须指定 `--ref main`，因为远端脚本执行 `git checkout <ref>`，使用其他分支会切换到该分支。服务器必须预装 `/opt/jiesong-system/runtime/node-v22.23.4-linux-x64` 专用运行时目录；#104 解决了运行时守卫来源问题，不负责安装运行时。

生产回滚见 [VPS 生产回滚手册](docs/operations/production-rollback.md)。

以下保留其他部署方案供参考。

## GitHub Actions 自动部署（VPS 方案）

仓库已配置 `.github/workflows/deploy.yml`，支持自动部署到 VPS。

### 需要配置的 Secrets

在 GitHub 仓库 → Settings → Secrets and variables → Actions 中添加：

| Secret | 说明 |
|--------|------|
| `SSH_PRIVATE_KEY` | VPS 的 SSH 私钥 |
| `SSH_KNOWN_HOSTS` | **必填**：VPS 的 known_hosts 行（在可信网络执行 `ssh-keyscan -p <端口> <主机>`，并带外核对指纹后粘贴）。为空则部署失败，不再运行时 ssh-keyscan |
| `SSH_HOST` | VPS IP 或域名 |
| `SSH_USER` | SSH 用户名 |
| `SSH_PORT` | SSH 端口（默认 22）|
| `NEXT_PUBLIC_API_BASE_URL` | 生产环境后端地址 |

### 触发部署

- **Staging**: 暂无(同主机无法隔离,push main 只做检查,见下方"触发规则")
- **Production**: 推送 `v*` 标签(不含 rc)自动触发
- **手动**: GitHub Actions → Deploy → Run workflow,选 production

---

## 常见问题

### Q: 为什么后端接口返回 401？

A: 检查 `NEXT_PUBLIC_API_BASE_URL` 是否正确指向了后端域名，以及后端 `JWT_SECRET` 是否配置正确。

### Q: 如何回滚？

A: 
- **VPS 生产**：[VPS 生产回滚手册](docs/operations/production-rollback.md)。

---

## 联系方式

部署遇到问题？检查以下日志：
- Render: Dashboard → Logs
- Fly.io: `flyctl logs`
- Vercel: Dashboard → Functions → Logs

## 邮箱注册

私有后端环境配置 `ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`、`JIESONG_EMAIL_FROM`，可选 `ALIBABA_CLOUD_SECURITY_TOKEN`。发信地址必须已在阿里云中国杭州邮件推送中验证，RAM权限只需 `dm:SingleSendMail`。不配置时注册发码返回服务不可用；部分配置在启动时拒绝。

上线前备份实际 `DATABASE_URL` 指向的SQLite，权限0700/0600，然后运行迁移新增 `email_registration_challenges` 表。不要执行 db push。重启后访问 `/register`，完成邮件验证码注册并由管理员在用户管理开通角色和状态；现有账号登录不变。

阿里云受理回执不等于收件箱送达；必须使用用户指定邮箱确认真实收信。接口依据：[SingleSendMail](https://help.aliyun.com/zh/direct-mail/api-dm-2015-11-23-singlesendmail)。

## 触发规则(fix/deploy-split 起)

- push main:只跑 `pre-deploy` 检查,**不部署任何环境**。staging 与生产目前同主机同目录 `/opt/jiesong-system`,无法安全隔离,所以已移除自动 staging 部署。
- push `v*` tag(tag 名不含 rc):部署生产。
- 手动 `workflow_dispatch` 选 `production`:部署生产(不再被 staging 连带跳过)。
- 部署状态回写只在 production job 声明 `statuses: write`,workflow 默认 `contents: read`。
- 以后需要 staging:先在服务器上建独立目录、`.env`/数据库、端口、pm2 进程和 nginx 站点,并为其写专用运行验证,再单独开 PR 加回 staging job。
