#!/bin/bash

# =============================================================================
# 捷淞进销存系统 - VPS 一键部署脚本
# 适用系统：Ubuntu 20.04+ / Debian 11+
# =============================================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 日志函数
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查是否以 root 运行
if [ "$EUID" -ne 0 ]; then
  log_error "请使用 sudo 运行此脚本"
  exit 1
fi

log_info "开始部署捷淞进销存系统..."

# =============================================================================
# 1. 安装系统依赖
# =============================================================================
log_info "正在安装系统依赖..."
apt-get update
apt-get install -y \
  curl \
  git \
  ufw \
  fail2ban \
  postgresql \
  postgresql-contrib

# =============================================================================
# 2. 安装 Node.js (LTS 版本)
# =============================================================================
log_info "正在安装 Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 验证 Node.js 版本
NODE_VERSION=$(node -v)
NPM_VERSION=$(npm -v)
log_info "已安装 Node.js $NODE_VERSION, npm $NPM_VERSION"

# =============================================================================
# 3. 安装 PM2 进程管理器
# =============================================================================
log_info "正在安装 PM2..."
npm install -g pm2

# =============================================================================
# 3.5 配置 PostgreSQL
# =============================================================================
log_info "配置 PostgreSQL..."
systemctl start postgresql
systemctl enable postgresql

# 创建数据库用户和数据库
sudo -u postgres psql -c "CREATE USER jiesong WITH PASSWORD 'jiesong_pass';" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE jiesong OWNER jiesong;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE jiesong TO jiesong;" 2>/dev/null || true

# =============================================================================
# 4. 创建应用目录和用户
# =============================================================================
APP_DIR="/opt/jiesong-system"
log_info "创建应用目录：$APP_DIR"
mkdir -p $APP_DIR
chown -R $SUDO_USER:$SUDO_USER $APP_DIR

# =============================================================================
# 5. 复制项目文件
# =============================================================================
log_info "复制项目文件..."
# 如果是从本地部署，使用 rsync；如果是从 git 部署，使用 git clone
if [ -d "/Users/helena/Cursor/jiesong_system/.git" ]; then
  # 本地部署场景 - 从当前目录复制
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cp -r "$SCRIPT_DIR"/* "$APP_DIR/"
  cp -r "$SCRIPT_DIR"/.[!.]* "$APP_DIR/" 2>/dev/null || true
else
  # Git 部署场景
  log_info "请提供 Git 仓库地址，或手动复制文件到 $APP_DIR"
fi

cd $APP_DIR

# =============================================================================
# 6. 安装后端依赖
# =============================================================================
log_info "安装后端依赖..."
cd $APP_DIR/backend
npm ci --production

# 初始化 Prisma
npx prisma generate

# =============================================================================
# 7. 安装前端依赖并构建
# =============================================================================
log_info "构建前端..."
cd $APP_DIR/frontend
npm ci --production
npm run build

# =============================================================================
# 8. 创建生产环境配置
# =============================================================================
log_info "创建环境配置文件..."

# 后端环境变量
cat > $APP_DIR/backend/.env << 'EOF'
# JWT 配置
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# 数据库配置 (PostgreSQL)
DATABASE_URL="postgresql://jiesong:jiesong_pass@localhost:5432/jiesong?schema=public"

# 服务器配置
PORT=3001
NODE_ENV=production
EOF

# 后端环境变量示例
cat > $APP_DIR/backend/.env.example << 'EOF'
# JWT 配置
JWT_SECRET=
JWT_EXPIRES_IN=7d

# 数据库 (PostgreSQL)
DATABASE_URL=postgresql://jiesong:jiesong_pass@localhost:5432/jiesong?schema=public

# 服务器
PORT=3001
NODE_ENV=production

# Kimi API
KIMI_API_KEY=
KIMI_BASE_URL=https://api.moonshot.cn/v1

# CORS
CORS_ORIGIN=http://localhost:3000

# 文件上传
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10mb
EOF

# 前端环境变量
cat > $APP_DIR/frontend/.env.production << 'EOF'
NEXT_PUBLIC_API_BASE_URL=/api/v1
EOF

# =============================================================================
# 9. 创建 PM2 配置文件
# =============================================================================
log_info "创建 PM2 配置文件..."

cat > $APP_DIR/ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'jiesong-backend',
      cwd: './backend',
      script: 'src/server.js',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '500M',
    },
    {
      name: 'jiesong-frontend',
      cwd: './frontend',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3002,
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      max_memory_restart: '1G',
    },
  ],
};
EOF

# 创建日志目录
mkdir -p $APP_DIR/backend/logs
mkdir -p $APP_DIR/frontend/logs

# =============================================================================
# 10. 启动应用
# =============================================================================
log_info "启动应用..."
cd $APP_DIR

# 运行数据库迁移
cd backend
log_info "执行数据库迁移..."
npx prisma migrate deploy || npx prisma db push

# 使用 PM2 启动
pm2 delete all 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# =============================================================================
# 11. 配置 Nginx 反向代理
# =============================================================================
log_info "安装并配置 Nginx..."

if ! command -v nginx &> /dev/null; then
  apt-get install -y nginx
fi

# 创建 Nginx 配置文件
cat > /etc/nginx/sites-available/jiesong-system << 'EOF'
server {
    listen 80;
    server_name _;

    # 日志
    access_log /var/log/nginx/jiesong-access.log;
    error_log /var/log/nginx/jiesong-error.log;

    # 前端静态文件
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 文件上传大小限制
    client_max_body_size 50M;
}
EOF

# 启用站点
ln -sf /etc/nginx/sites-available/jiesong-system /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# 测试并重载 Nginx
nginx -t
systemctl restart nginx
systemctl enable nginx

# =============================================================================
# 12. 配置防火墙
# =============================================================================
log_info "配置防火墙..."

ufw --force enable
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS (预留)
ufw status

# =============================================================================
# 13. 完成
# =============================================================================
log_info "=============================================="
log_info "🎉 部署完成！"
log_info "=============================================="
log_info ""
log_info "访问地址：http://$(hostname -I | awk '{print $1}')"
log_info ""
log_info "常用命令："
log_info "  查看状态：pm2 status"
log_info "  查看日志：pm2 logs"
log_info "  重启服务：pm2 restart all"
log_info "  Nginx 状态：systemctl status nginx"
log_info ""
log_info "⚠️  重要："
log_info "  1. 请修改 backend/.env 中的 JWT_SECRET"
log_info "  2. 默认管理员账号：admin / admin123"
log_info "  3. 建议尽快修改默认密码"
log_info ""
