# =============================================================================
# 捷淞进销存系统 - 前端 Dockerfile
# =============================================================================

FROM node:20-alpine AS base

# 安装必要的系统依赖
RUN apk add --no-cache python3 make g++

# 工作目录
WORKDIR /app

# =============================================================================
# 构建阶段
# =============================================================================
FROM base AS builder

COPY package*.json ./
RUN npm ci

COPY . .

# 构建参数
ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# 构建 Next.js 应用
RUN npm run build

# =============================================================================
# 生产阶段
# =============================================================================
FROM base AS production

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制构建产物
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 设置权限
RUN chown -R nextjs:nodejs /app

USER nextjs

# 暴露端口
EXPOSE 3002

# 环境变量
ENV NODE_ENV=production
ENV PORT=3002

# 启动命令
CMD ["node", "server.js"]
