# 捷淞进销存系统 - SQLite → Supabase 迁移指南

> 若本文件夹结构或内容变化，请更新本文件。
> 
> 创建时间: 2026-02-21

---

## 一、迁移背景

将数据库从本地 SQLite 文件迁移至 Supabase（托管 PostgreSQL），以获得：
- 云端持久化、多端同步
- Supabase 内置 Auth、Storage、Realtime 等生态
- 生产级 PostgreSQL 能力（ACID、并发、Full-Text Search 等）

---

## 二、前置准备

### 2.1 已完成的代码变更

1. **Prisma schema**（`backend/prisma/schema.prisma`）
   - `provider` 由 `"sqlite"` 改为 `"postgresql"`
   - 新增 `directUrl` 字段（用于 migrate 直连）

2. **环境变量模板**（`backend/env.example`）
   - 新增 `DATABASE_URL`（连接池 URL，端口 6543）
   - 新增 `DIRECT_URL`（直连 URL，端口 5432）

3. **Cursor MCP**（`.cursor/mcp.json`）
   - 新增 Supabase MCP：`https://mcp.supabase.com/mcp`

### 2.2 Supabase 账号与项目

1. 前往 [supabase.com](https://supabase.com) 注册/登录
2. 创建一个新项目（**记录 Project Ref 和数据库密码**）
3. 在 Cursor 中重启 MCP，按提示在浏览器中完成 Supabase OAuth 授权

---

## 三、迁移步骤

### Step 1：获取连接字符串

在 Supabase Dashboard → 项目 → Settings → Database → **Connection String** 中获取：

| 类型 | 用途 | 端口 | 填入变量 |
|------|------|------|----------|
| Transaction (Pooler) | 运行时查询 | 6543 | `DATABASE_URL` |
| Direct Connection | prisma migrate | 5432 | `DIRECT_URL` |

### Step 2：配置本地 .env

复制 `env.example` 为 `.env`，填入真实连接字符串：

```bash
cd backend
cp env.example .env
# 编辑 .env，填写 DATABASE_URL 和 DIRECT_URL
```

示例（替换 `[project-ref]` 和 `[password]`）：

```env
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"
```

### Step 3：生成 Prisma Client 并推送 Schema

```bash
cd backend
npx prisma generate
npx prisma db push
```

> `db push` 会将当前 schema 直接同步到 Supabase，适合开发/迁移初期。
> 生产环境推荐使用 `prisma migrate deploy`（需先有 migration 历史）。

### Step 4：种子数据（可选）

若需要初始化管理员和基础数据：

```bash
cd backend
npm run db:seed
```

### Step 5：验证

```bash
# 启动后端，验证连接
cd backend && npm run dev

# 访问 http://localhost:3000/api/v1/system/configs
# 应返回系统配置列表（需 Token）
```

---

## 四、旧数据迁移（如需保留 SQLite 数据）

如需将本地 SQLite 数据迁移到 Supabase：

1. 使用 `backend/scripts/importData.js` 或 `importIncremental.js` 脚本
2. 或者使用 Prisma 官方迁移工具从 SQLite 导出并导入 PostgreSQL
3. 推荐方式：通过系统内"数据导入"功能（CSV）重新导入历史数据

---

## 五、Supabase MCP 使用说明

已在 `.cursor/mcp.json` 配置 Supabase Remote MCP：

```json
{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp"
    }
  }
}
```

**使用方式**：在 Cursor 聊天中，可直接用自然语言操作数据库：
- "列出所有数据库表"
- "查询最近 10 条采购合同"
- "执行 SQL：SELECT * FROM users LIMIT 5"

**首次使用**：Cursor 会自动弹出浏览器，引导完成 Supabase OAuth 授权。

---

## 六、注意事项

- `DATABASE_URL` 使用连接池（`pgbouncer=true`）时，Prisma 不支持 `queryRaw` 的某些功能，必要时使用 `DIRECT_URL`
- Supabase 免费套餐在 7 天无活动后会暂停项目，需手动恢复
- 生产环境建议开启 Supabase RLS（Row Level Security）做数据隔离
- 不要将 `.env` 提交到 Git（已在 `.gitignore` 中忽略）

---

## 七、回滚方案

若需回滚至 SQLite：
1. 将 `backend/prisma/schema.prisma` 中 `provider` 改回 `"sqlite"`，删除 `directUrl` 行
2. 将 `.env` 中 `DATABASE_URL` 改回 `"file:./dev.db"`
3. 执行 `npx prisma db push` 重新生成本地库
