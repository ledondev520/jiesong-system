# ClawPi Domain Sweep Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 清扫仓库内 ClawPi 旧域名或旧 API 基址残留，并验证关键运行时入口不会继续误打旧地址。

**Architecture:** 先做全仓字符串盘点与运行入口分类，再只修改会影响真实运行时的 API 基址解析层；文档与示例仅在会误导部署时更新。保留本地 `/api/v1` 反向代理与容器内相对路径场景，避免把线上域名硬编码进本地部署路径。

**Tech Stack:** Next.js, Axios, Vitest, Shell grep/find, Markdown checkpoint files

---

### Task 1: Repository Sweep

**Files:**
- Inspect: `frontend/src/lib/axios.ts`
- Inspect: `frontend/src/components/ai/AIAssistant.tsx`
- Inspect: `frontend/next.config.ts`
- Inspect: `README.md`
- Inspect: `DEPLOY.md`
- Inspect: `deploy.sh`
- Inspect: `frontend/Dockerfile`
- Inspect: `scripts/backup.sh`
- Inspect: `scripts/health-check.sh`

**Step 1: Search for old domain literals**

Run: `grep -RIn --binary-files=without-match --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude-dir=coverage --exclude-dir=PATCHES --exclude-dir=RESULTS --exclude-dir=logs 'clawpi-v2\.vercel\.app\|vercel\.app' .`

Expected: 明确是否存在旧域名字面量，以及是否只出现在构建产物或报告文件中。

**Step 2: Search API base handling**

Run: `grep -RIn --binary-files=without-match --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next 'NEXT_PUBLIC_API_URL\|NEXT_PUBLIC_API_BASE_URL\|baseURL' frontend README.md DEPLOY.md deploy.sh`

Expected: 确认前端运行时、Next.js rewrite、Docker/部署文档是否使用同一套环境变量。

### Task 2: Runtime-Safe Fix

**Files:**
- Modify: `frontend/src/lib/axios.ts`
- Modify: `frontend/src/components/ai/AIAssistant.tsx`
- Modify: `frontend/next.config.ts`
- Test: `frontend/src/lib/axios.test.ts`

**Step 1: Add backward-compatible API base resolution**

实现要求：
- 运行时优先识别 `NEXT_PUBLIC_API_BASE_URL`
- 兼容旧的 `NEXT_PUBLIC_API_URL`
- 都未设置时继续使用 `/api/v1`

**Step 2: Update tests**

Run: `cd frontend && npm run test -- src/lib/axios.test.ts`

Expected: 覆盖默认值、`NEXT_PUBLIC_API_URL`、`NEXT_PUBLIC_API_BASE_URL` 三类场景。

### Task 3: Checkpoint And Evidence

**Files:**
- Modify: `PLAN.md`
- Modify: `TASKS.md`
- Modify: `RISKS.md`
- Modify: `METRICS.md`
- Create: `logs/task-OPS-DOMAIN-01.md`
- Create: `RESULTS/OPS-DOMAIN-01.md`
- Create: `PATCHES/OPS-DOMAIN-01.diff`

**Step 1: Record search conclusions and residual risks**

要求：
- 明确“未发现旧域名字面量”与“仍需人工确认的非运行时文档/外部系统”
- 记录 API 环境变量不一致的修复原因

**Step 2: Capture verification evidence**

Run:
- `cd frontend && npm run test -- src/lib/axios.test.ts`
- `grep -RIn --binary-files=without-match --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build --exclude-dir=.next --exclude-dir=coverage --exclude-dir=PATCHES --exclude-dir=RESULTS --exclude-dir=logs 'clawpi-v2\.vercel\.app' .`
- `grep -RIn --binary-files=without-match --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=.next 'NEXT_PUBLIC_API_URL\|NEXT_PUBLIC_API_BASE_URL' frontend/src frontend/next.config.ts`

Expected:
- 测试通过
- 仓库内无旧域名字面量
- 前端关键 API 入口均已对齐/兼容 API 基址变量
