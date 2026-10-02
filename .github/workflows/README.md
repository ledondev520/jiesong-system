# G-Stack CI/CD 工作流

GitHub Actions 工作流配置，实现完整的自动化开发循环。

## 📋 工作流列表

| 工作流 | 文件 | 触发条件 | 说明 |
|-------|------|---------|------|
| **CI** | `ci.yml` | PR / Push | 代码质量检查 + 单元测试 |
| **QA & Health** | `qa.yml` | Daily / Push | 自动化测试 + 健康度检查 |
| **PR Review** | `pr-review.yml` | PR | 类型、ESLint、锁定 Prettier 的 PR 源码检查与 Actions 摘要 |
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

### 手动触发

进入 Actions 标签页，选择工作流，点击 "Run workflow"。

### 本地测试

```bash
# 运行 CI 检查
act -j quality

# 运行测试
act -j test
```

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
