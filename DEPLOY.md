# 捷淞进销存系统 - 部署指南

## 📋 目录

- [方案一：VPS 一键部署（推荐）](#方案一 vps 一键部署推荐)
- [方案二：Docker 部署](#方案二 docker 部署)
- [方案三：PaaS 平台部署](#方案三 paas 平台部署)
- [常见问题](#常见问题)

---

## 方案一：VPS 一键部署（推荐）

### 1. 准备 VPS

**推荐配置：**
| 配置项 | 最低要求 | 推荐配置 |
|--------|----------|----------|
| CPU | 1 核 | 2 核 |
| 内存 | 1GB | 2GB |
| 硬盘 | 20GB | 40GB+ |
| 系统 | Ubuntu 20.04 | Ubuntu 22.04 |

**推荐服务商：**
- 阿里云 ECS
- 腾讯云 CVM
- AWS EC2
- DigitalOcean Droplet

### 2. 上传代码

```bash
# 方式 1：使用 Git
git clone https://github.com/ledondev520/jiesong-system.git
cd jiesong-system

# 方式 2：使用 SCP
scp -r ./* root@your-vps-ip:/opt/jiesong-system
```

### 3. 执行部署脚本

```bash
cd /opt/jiesong-system
chmod +x deploy.sh
sudo ./deploy.sh
```

### 4. 访问系统

部署完成后，访问：`http://你的 VPS-IP`

**默认账号：**
- 用户名：`admin`
- 密码：`admin123`

---

## 方案二：Docker 部署

### 前置要求

- Docker 20.10+
- Docker Compose 2.0+

### 1. 克隆代码

```bash
git clone https://github.com/ledondev520/jiesong-system.git
cd jiesong-system
```

### 2. 配置环境变量

```bash
# 创建 .env 文件
cat > .env << EOF
JWT_SECRET=your-super-secret-jwt-key-$(openssl rand -hex 32)
EOF
```

### 3. 启动服务

```bash
docker compose up -d
```

### 4. 查看状态

```bash
docker compose ps
docker compose logs -f
```

### 5. 访问系统

访问：`http://你的服务器-IP`

---

## 方案三：PaaS 平台部署

### Railway 部署（推荐）

1. 访问 [railway.app](https://railway.app)
2. 点击 "New Project" → "Deploy from GitHub repo"
3. 选择 `jiesong-system` 仓库
4. 添加环境变量：
   ```
   JWT_SECRET=your-secret-key
   NODE_ENV=production
   ```
5. Railway 会自动构建并部署

### Vercel 部署（仅前端）

1. 访问 [vercel.com](https://vercel.com)
2. 导入 `frontend` 目录
3. 设置环境变量：
   ```
   NEXT_PUBLIC_API_BASE_URL=https://your-backend-url.railway.app
   ```

---

## 🔧 常用运维命令

### PM2 管理

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs

# 重启服务
pm2 restart all

# 停止服务
pm2 stop all

# 删除服务
pm2 delete all
```

### Nginx 管理

```bash
# 查看状态
systemctl status nginx

# 重启
systemctl restart nginx

# 查看日志
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Docker 管理

```bash
# 重启所有服务
docker compose restart

# 查看日志
docker compose logs -f

# 停止所有服务
docker compose down

# 清理并重建
docker compose down -v && docker compose up -d
```

---

## 🔒 安全建议

### 1. 修改默认密码

登录后立即修改管理员密码！

### 2. 配置 HTTPS

```bash
# 使用 Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 3. 配置防火墙

```bash
# 仅开放必要端口
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

### 4. 定期备份

```bash
# 备份数据库
sqlite3 backend/prisma/dev.db ".backup 'backup-$(date +%Y%m%d).db'"
```

---

## ❓ 常见问题

### Q1: 无法访问页面

**检查服务状态：**
```bash
pm2 status
systemctl status nginx
```

**检查端口：**
```bash
netstat -tlnp | grep -E '80|3001|3002'
```

### Q2: 登录提示网络错误

**检查后端日志：**
```bash
pm2 logs jiesong-backend
```

**检查 API 连通性：**
```bash
curl http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

### Q3: 数据库迁移失败

```bash
cd backend
npx prisma migrate deploy
# 或者
npx prisma db push
```

### Q4: 前端构建失败

```bash
cd frontend
rm -rf node_modules package-lock.json .next
npm install
npm run build
```

---

## 📞 技术支持

如遇问题，请检查：
1. 服务器日志
2. 应用日志
3. 网络连接

如需协助，请提供：
- 错误信息截图
- 相关日志内容
- 服务器配置信息
