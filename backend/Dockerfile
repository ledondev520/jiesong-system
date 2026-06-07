# 捷淞系统后端 Docker 镜像
# 构建: docker build -t jiesong-backend .
# 运行: docker run -p 3001:3001 --env-file .env jiesong-backend

FROM node:20-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --production

# 复制 Prisma schema 并生成客户端
COPY prisma ./prisma
RUN npx prisma generate

# 复制源码
COPY src ./src

# 创建上传目录
RUN mkdir -p uploads

# 暴露端口
EXPOSE 3001

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/v1/health', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# 启动命令
CMD ["node", "src/app.js"]
