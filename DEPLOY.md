# 捷淞系统 线上部署指南

## 当前 VPS 部署

公网入口为 `https://celerada.link`（`www.celerada.link` 同样支持 HTTPS）。Nginx 将页面代理到 3002、API 代理到 3001。

Git 构建目录为 `/opt/jiesong-system`。PM2 的 `jiesong-backend` 和 `jiesong-frontend` 必须分别使用该目录内的 `backend`、`frontend`，不能继续指向 `/opt/jiesong_system/releases/` 中的旧代码。PM2 重启不会自动纠正旧脚本路径；首次切换需要备份配置、使用正确路径重新创建这两个进程，并保留回滚配置。

生产数据库和附件沿用 `/opt/jiesong_system/current/backend/` 下既有数据位置，环境配置中的 DATABASE_URL 与 UPLOAD_DIR 使用绝对路径。迁移时复制现用的私密配置并设为 0600，不使用构建目录里另一份数据库代替生产数据；先创建一致的数据库备份。

每次发布后执行 `node scripts/verify-vps-runtime.cjs https://celerada.link`。它核对 PM2 运行目录、后端健康、公网登录页 BUILD_ID、手机缩放和 API 认证边界；GitHub Actions 已调用此检查。首次切换还应从 VPS 核对根域名及 www 的 DNS、HTTPS 证书、HTTP 跳转，再在手机尺寸下检查公网登录页。

以下保留其他部署方案供参考。

## 方案概览

提供三套部署方案，按推荐优先级排序：

| 方案 | 前端 | 后端 | 数据库 | 月费用 | 推荐度 |
|------|------|------|--------|--------|--------|
| A | Vercel | Render | Render PostgreSQL | ~$0-7 | ⭐⭐⭐ |
| B | Vercel | Fly.io | Fly.io Postgres | ~$0-5 | ⭐⭐⭐ |
| C | Vercel | 自有 VPS | Supabase | ~$5-20 | ⭐⭐ |

---

## 方案 A: Vercel + Render（最简，推荐）

### 1. 创建 Render 账号并部署后端

1. 访问 [render.com](https://render.com)，用 GitHub 账号登录
2. 在 Dashboard 点击 **New +** → **Blueprint**
3. 选择本仓库，Render 会自动读取 `render.yaml`
4. 创建完成后，记下后端域名：`https://jiesong-backend.onrender.com`

### 2. 配置环境变量

在 Render Dashboard → jiesong-backend → Environment 中设置：

```
DATABASE_URL=postgresql://... (Render 自动创建)
JWT_SECRET=your-secure-random-string
JWT_EXPIRES_IN=7d
KIMI_API_KEY=sk-...
KIMI_BASE_URL=https://api.moonshot.cn/v1
UPLOAD_DIR=./uploads
```

### 3. 部署前端到 Vercel

```bash
# 1. 安装 Vercel CLI（已安装可跳过）
npm i -g vercel

# 2. 登录
vercel login

# 3. 进入项目根目录，部署
cd /path/to/jiesong_system
vercel --prod

# 4. 设置环境变量
vercel env add NEXT_PUBLIC_API_BASE_URL
# 输入: https://jiesong-backend.onrender.com
```

---

## 方案 B: Vercel + Fly.io（性能更好）

### 1. 安装 Fly.io CLI

```bash
curl -L https://fly.io/install.sh | sh
flyctl auth login
```

### 2. 创建应用和数据库

```bash
cd backend

# 创建应用
flyctl apps create jiesong-backend

# 创建 PostgreSQL 数据库
flyctl postgres create --name jiesong-db --region sin --vm-size shared-cpu-1x

# 关联数据库到应用
flyctl postgres attach jiesong-db --app jiesong-backend
```

### 3. 设置密钥并部署

```bash
# 设置环境变量
flyctl secrets set JWT_SECRET="your-secure-random-string" \
  JWT_EXPIRES_IN="7d" \
  KIMI_API_KEY="sk-..." \
  KIMI_BASE_URL="https://api.moonshot.cn/v1" \
  --app jiesong-backend

# 部署
flyctl deploy
```

### 4. 部署前端

同方案 A 步骤 3，将 `NEXT_PUBLIC_API_BASE_URL` 设为 Fly.io 后端域名。

---

## 数据迁移: SQLite → PostgreSQL

### 前提条件

- 本地 SQLite 数据库 `backend/prisma/dev.db` 存在且有数据
- 目标 PostgreSQL 数据库已创建

### 执行迁移

```bash
# 1. 设置目标数据库 URL
export TARGET_DATABASE_URL="postgresql://user:password@host:5432/dbname"

# 2. 运行迁移脚本
cd jiesong_system
node scripts/migrate-sqlite-to-postgres.js
```

### 迁移后检查

```bash
# 连接 PostgreSQL 验证数据
npx prisma db execute --url "$TARGET_DATABASE_URL" --stdin <<SQL
SELECT COUNT(*) FROM "User";
SELECT COUNT(*) FROM "PurchaseContract";
SELECT COUNT(*) FROM "SalesContract";
SQL
```

---

## GitHub Actions 自动部署（VPS 方案）

仓库已配置 `.github/workflows/deploy.yml`，支持自动部署到 VPS。

### 需要配置的 Secrets

在 GitHub 仓库 → Settings → Secrets and variables → Actions 中添加：

| Secret | 说明 |
|--------|------|
| `SSH_PRIVATE_KEY` | VPS 的 SSH 私钥 |
| `SSH_HOST` | VPS IP 或域名 |
| `SSH_USER` | SSH 用户名 |
| `SSH_PORT` | SSH 端口（默认 22）|
| `NEXT_PUBLIC_API_BASE_URL` | 生产环境后端地址 |

### 触发部署

- **Staging**: 推送到 `main` 分支自动触发
- **Production**: 推送 `v*` 标签自动触发
- **手动**: GitHub Actions → Deploy → Run workflow

---

## 域名与 SSL

### Vercel 前端

- 自动分配 `*.vercel.app` 域名
- 自定义域名：Vercel Dashboard → Domains → Add

### Render 后端

- 自动分配 `*.onrender.com` 域名
- 自定义域名：Render Dashboard → Settings → Custom Domain

### Fly.io 后端

- 自动分配 `*.fly.dev` 域名
- 自定义域名：`flyctl certs create your-domain.com`

---

## 常见问题

### Q: 为什么后端接口返回 401？

A: 检查 `NEXT_PUBLIC_API_BASE_URL` 是否正确指向了后端域名，以及后端 `JWT_SECRET` 是否配置正确。

### Q: 文件上传失败？

A: Render/Fly.io 的临时文件系统会在重启后丢失。方案 A 已配置 Render Disk 持久化，`fly.toml` 已配置 Volume 挂载。

### Q: 数据库迁移后 ID 不一致？

A: 迁移脚本使用 `skipDuplicates: true`，如果遇到冲突会跳过。迁移完成后建议验证关键表的数据完整性。

### Q: 如何回滚？

A: 
- **Render**: Dashboard → Manual Deploy → 选择之前的部署
- **Fly.io**: `flyctl releases list` + `flyctl releases rollback <version>`
- **Vercel**: Dashboard → Deployments → 选择之前的部署

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
