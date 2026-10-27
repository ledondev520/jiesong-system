# G-Stack CI/CD 工作流

若本文件夹结构或内容变化，请更新本文件。

GitHub Actions 工作流配置，实现完整的自动化开发循环。

## 📋 工作流列表

| 工作流 | 文件 | 触发条件 | 说明 |
|-------|------|---------|------|
| **CI** | `ci.yml` | PR / Push | 代码质量检查 + 单元测试 |
| **Test And Acceptance** | `test-and-acceptance.yml` | PR / Push | 后端、前端单测/coverage及hosted Playwright验收 |
| **QA & Health** | `qa.yml` | Daily / Push | 自动化测试 + 健康度检查 |
| **PR Review** | `pr-review.yml` | PR | 类型、ESLint、锁定 Prettier 的 PR 源码检查与 Actions 摘要 |
| **Review Freshness** | `review-freshness.yml` | 指向 main 的 PR opened / synchronize / reopened / edited | 只读检查复核标记与 base 后续改动，过期或信息不足则失败 |
| **Security** | `security.yml` | PR / Weekly | 安全扫描 |
| **Weekly Retro** | `weekly-retro.yml` | Weekly | 每周工程回顾 |
| **Deploy** | `deploy.yml` | main Push / Tag / Manual | 部署并核对 PM2 运行目录与公网构建 |

## 🔄 流程图

```
┌─────────────┐
│   Develop   │
└──────┬──────┘
       │ Push
       ▼
┌─────────────┐
│     CI      │ ← lint, type-check, test
└──────┬──────┘
       │ Pass
       ▼
┌─────────────┐
│  PR Review  │ ← Actions review summary
└──────┬──────┘
       │ Merge
       ▼
┌─────────────┐
│   QA/Health │ ← daily automated testing
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Deploy    │ ← tag push or manual
└─────────────┘
```

## 🚀 使用说明

### 复核标记与合并前检查

独立复核通过后，由 PR 作者或仓库 owner 在 PR 的 issue 评论中单独写一行标记（两处 SHA 必须是 40 位小写十六进制）：

```text
review-freshness/v1 pass head=<复核时的 PR head SHA> base=<复核使用的 origin/main SHA>
```

仅这两类作者的评论有效；以创建时间最新的标记评论为准，普通说明评论不覆盖标记。行首尾允许空白；以 `review-freshness/` 开头的行按不区分大小写识别，但合法格式必须严格匹配上式。最新标记评论中必须恰好有一行合法标记；格式错误、多行标记或 `review-freshness/v1 revoke` 均撤销旧标记，不会回退到旧的 pass。

没有有效标记、PR head 变化、标记 base 不是当前 base 的祖先、历史缺失或浅克隆、API/Git 失败都会作废。PR 文件集合取 B0/H、B1/H 两对所有最佳共同祖先（`merge-base --all`）到 H 的 diff 文件并集；任一对没有共同祖先则按信息不足作废。base 自复核后改动的文件只要与 PR 文件有交集也会作废：包括重命名/复制的旧新路径、删除，以及 main 改过又改回的文件。作废后应更新分支、重跑 CI、新的独立复核，再写新标记。检查器只验证标记和历史，独立复核仍由流程保证。

新标记评论不会自动触发此工作流，写完后须在 Actions 中 re-run `review-freshness` job。仓库管理员需将 `review-freshness` 设置为 main 的必过检查才能由 GitHub 阻止合并；本次工作流文件不会自动修改远端分支保护。GitHub 上已绿的检查不会因 main 前进自动变红，因此**合并前本地检查是必做步骤**：在完整历史仓库中，确保已安装并认证 `gh`，且 `origin` 指向目标仓库，再运行：

```bash
node scripts/check-review-freshness.cjs --repo <owner/name> --pr <N>
```

CLI 分页获取全部 issue 评论、读取实时 PR head 和 base 分支 tip，并通过 `git fetch --no-tags origin` 获取两个 tip 所需历史。退出码必须为 0；检查后如 head/base 又前进，必须再运行检查。该命令会更新本地 Git 获取历史，不修改业务文件。

### 手动触发

进入 Actions 标签页，选择工作流，点击 "Run workflow"。

生产手动部署使用 `gh workflow run deploy.yml --ref main -f environment=production`。必须指定 `--ref main`：远端脚本执行 `git checkout <ref>`，其他分支会使服务器切换到该分支。生产回滚及回滚后再部署见 [VPS 生产回滚手册](../../docs/operations/production-rollback.md)。

### 本地测试

```bash
# 运行 CI 检查
act -j quality

# 运行测试
act -j test
```

前端Vitest会运行 `name-lifecycle.test.tsx` 的真实localhost/SQLite夹具，需要同一checkout的锁定backend依赖与Prisma client。`ci.yml` 的 Unit Tests、`test-and-acceptance.yml` 的 Frontend Unit And Coverage、`deploy.yml` 的 Pre-deploy Checks均在前端测试前于backend目录断言 `.env` 文件/符号链接不存在，执行 `npm ci` 和现有 `npm run db:generate`；不为此创建默认业务数据库。已锁定的 `@prisma/client` 5.22.0 postinstall会尝试generate，但会捕获部分失败，显式命令提供可失败的生成门槛。

名称夹具仍由每次测试独占0700目录、0600 SQLite并通过已提交迁移初始化；子进程只接收测试环境，不读取backend/.env，也不复制共享client。CI后端测试复用已安装的依赖/客户端，既有迁移与测试步骤保持原顺序。前端E2E已有自己的backend安装/生成前置；PR Review的工具测试为Node `--test`，不是Vitest。其他现有workflow没有直接运行前端Vitest，无需加入该前置。生产SSH发布步骤与secret/env策略未变。

### 查看报告

工作流运行后，可在以下位置查看报告：

- **Artifacts**: 每个工作流的构建产物
- **Summary**: PR Review 的 Actions 摘要保留类型、lint/格式结果，失败状态仍使检查失败
- **Security**: Security → Code scanning alerts

## 🔧 配置

### 环境变量

在 Settings → Secrets and variables → Actions 中配置：

| 名称 | 说明 | 必需 |
|-----|------|-----|
| `NODE_ENV` | 环境变量 | 否 |

### 分支保护

建议在分支保护规则中启用：

- ✅ Require status checks to pass
  - `Code Quality`
  - `Unit Tests`
  - `Build Test`
- ✅ Require branches to be up to date

## 📊 状态徽章

添加到 README.md：

```markdown
[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
[![QA](https://github.com/OWNER/REPO/actions/workflows/qa.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/qa.yml)
[![Security](https://github.com/OWNER/REPO/actions/workflows/security.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/security.yml)
```

发布流程固定触发提交 SHA，并以 `scripts/verify-vps-runtime.cjs` 验证运行目录、健康、公网 BUILD_ID 和 API 登录边界；PM2 启动成功不能单独作为新版生效的证据。

PR 格式检查使用 `fetch-depth: 0` 和事件的完整 base/head SHA，运行 `scripts/check-pr-format.cjs`；NUL 路径支持空格/换行文件名，重命名目标会检查，历史缺失不能当作无改动。仅修改源码接受 Prettier 3.9.9 格式检查，全部单测/验收照常运行。报告任务使用 `permissions: {}`，通过 `GITHUB_STEP_SUMMARY` 输出结果；上游失败或取消时仍保留失败状态，不调用评论写入 API。
