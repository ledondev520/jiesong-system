# G-Stack CI/CD 工作流

GitHub Actions 工作流配置，实现完整的自动化开发循环。

## 📋 工作流列表

| 工作流 | 文件 | 触发条件 | 说明 |
|-------|------|---------|------|
| **CI** | `ci.yml` | PR / Push | 代码质量检查 + 单元测试 |
| **QA & Health** | `qa.yml` | Daily / Push | 自动化测试 + 健康度检查 |
| **PR Review** | `pr-review.yml` | PR | PR 代码审查 |
| **Security** | `security.yml` | PR / Weekly | 安全扫描 |
| **Weekly Retro** | `weekly-retro.yml` | Weekly | 每周工程回顾 |
| **Deploy** | `deploy.yml` | Tag / Manual | 部署工作流 |

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
│  PR Review  │ ← automated comments
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
- **Annotations**: PR 中的自动评论
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
