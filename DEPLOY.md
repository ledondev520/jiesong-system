# 捷淞系统部署指南

> 本文档覆盖：本地开发 → Docker部署 → VPS生产部署 → 数据迁移

---

## 一、本地开发

```bash
# 1. 启动后端
cd backend
npm install
npm run db:generate   # 生成 Prisma Client
npm run db:push       # 同步数据库 schema
npm run db:seed       # 可选：导入种子数据
npm run dev           # 开发模式启动（:3001）

# 2. 启动前端（新终端）
cd frontend
npm install
npm run dev           # 开发模式启动（:3000）
```

访问：http://localhost:3000

---

## 二、Docker 部署（推荐测试环境）

### 前置要求
- Docker + Docker Compose

### 部署步骤

```bash
# 1. 构建并启动（含 PostgreSQL）
docker compose up -d

# 2. 执行数据库迁移
docker compose exec backend npx prisma migrate deploy

# 3. 查看状态
docker compose ps
```

访问：http://localhost（Nginx 反向代理）

### 数据持久化
- PostgreSQL 数据：`docker volume ls | grep postgres`
- 上传文件：`./backend/uploads/`

---

## 三、VPS 生产部署（推荐生产环境）

### 前置要求
- Ubuntu 20.04+ / Debian 11+
- 域名已解析到 VPS IP（可选）

### 一键部署

```bash
# 1. 上传项目文件到 VPS
rsync -avz --exclude=node_modules --exclude=.git ./ root@your-vps-ip:/opt/jiesong-system/

# 2. SSH 登录并执行部署脚本
ssh root@your-vps-ip
cd /opt/jiesong-system
bash deploy.sh
```

部署脚本会自动完成：
- 安装 Node.js 20 + PM2 + Nginx
- 安装 PostgreSQL
- 构建前端
- 配置反向代理
- 启动服务

### 手动部署（如需更精细控制）

```bash
# 1. 安装 PostgreSQL
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER jiesong WITH PASSWORD 'your_strong_password';"
sudo -u postgres psql -c "CREATE DATABASE jiesong OWNER jiesong;"

# 2. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入：
#   DATABASE_URL=postgresql://jiesong:your_strong_password@localhost:5432/jiesong?schema=public
#   JWT_SECRET=<随机生成的长字符串>
#   KIMI_API_KEY=<你的 Moonshot API Key>

# 3. 构建
cd backend && npm ci && npx prisma generate && npx prisma migrate deploy
cd ../frontend && npm ci && npm run build

# 4. 启动（PM2）
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

---

## 四、数据迁移：SQLite → PostgreSQL

### 场景
本地开发使用 SQLite，线上使用 PostgreSQL。需要将本地数据同步到线上。

### 方案 A：SQL 导出导入（推荐）

```bash
cd backend

# 1. 生成迁移 SQL 文件
node scripts/migrate-sqlite-to-postgres.js

# 2. 确保 PostgreSQL 数据库已初始化
DATABASE_URL="postgresql://jiesong:pass@localhost:5432/jiesong?schema=public" npx prisma db push

# 3. 执行迁移
psql -U jiesong -d jiesong -f prisma/migration-to-postgres.sql
```

### 方案 B：Prisma 数据库迁移（干净环境）

```bash
# 1. 导出 SQLite 数据为 JSON
sqlite3 prisma/dev.db ".mode json" "SELECT * FROM users" > users.json
# ... 对每个表重复

# 2. 切换到 PostgreSQL
export DATABASE_URL="postgresql://..."
npx prisma db push

# 3. 编写导入脚本写入 PostgreSQL
```

### 方案 C：持续同步（开发→线上）

开发环境定期导出数据，线上导入：

```bash
# 开发机执行
sqlite3 prisma/dev.db .dump > backup.sql
scp backup.sql root@vps-ip:/tmp/

# VPS 执行
psql -U jiesong -d jiesong -f /tmp/backup.sql
```

---

## 五、环境变量配置

### 后端 `.env`

```bash
# 必须配置
JWT_SECRET=                      # 随机长字符串（生产环境必须修改）
DATABASE_URL=                    # SQLite 或 PostgreSQL 连接字符串

# 推荐配置
KIMI_API_KEY=                    # Moonshot API Key（AI助手功能）
KIMI_BASE_URL=https://api.moonshot.cn/v1

# 可选配置
PORT=3001
NODE_ENV=production
CORS_ORIGIN=http://localhost:3000
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10mb
```

### 前端 `.env.local` / `.env.production`

```bash
# 开发环境
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001/api/v1

# 生产环境（Docker/VPS）
NEXT_PUBLIC_API_BASE_URL=/api/v1
```

---

## 六、常见问题

### Q: 部署后前端白屏
- 检查 `NEXT_PUBLIC_API_BASE_URL` 是否正确
- 检查 Nginx 配置中的 proxy_pass 是否正确

### Q: 数据库连接失败
- 检查 `DATABASE_URL` 格式
- PostgreSQL: 确认用户、数据库、权限已创建
- SQLite: 确认文件路径可写

### Q: AI助手无法使用
- 检查 `KIMI_API_KEY` 是否配置
- 检查后端日志中的 API 调用错误

### Q: 文件上传失败
- 检查 `UPLOAD_DIR` 目录是否存在且可写
- 检查 Nginx `client_max_body_size` 配置

---

## 七、服务管理命令

```bash
# PM2 管理
pm2 status              # 查看状态
pm2 logs                # 查看日志
pm2 restart all         # 重启全部
pm2 reload jiesong-backend  # 零停机重启后端

# Nginx
nginx -t                # 测试配置
systemctl reload nginx  # 重载配置

# PostgreSQL
sudo -u postgres psql   # 进入 psql
pg_dump -U jiesong jiesong > backup.sql  # 备份
```
