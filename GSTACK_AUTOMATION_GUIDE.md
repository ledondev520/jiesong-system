# G-Stack 自动化系统完整指南

捷淞系统已实现完整的 G-Stack 自动化开发循环。

## ✅ 已完成配置

### 1. 本地开发循环 (.gstack/)

| 组件 | 文件 | 功能 |
|-----|------|-----|
| 主循环脚本 | `autoloop.sh` | 执行 review → qa → health 流程 |
| 配置 | `autoloop.config.json` | 流程阈值和设置 |
| QA测试 | `qa-test-comprehensive.sh` | 前端自动化测试 |
| 每周回顾 | `weekly-retro.sh` | 生成周度工程报告 |
| Git Hooks | `hooks/` | 提交/推送前自动检查 |

### 2. CI/CD 工作流 (.github/workflows/)

| 工作流 | 触发条件 | 功能 |
|-------|---------|-----|
| `ci.yml` | PR / Push | 代码质量、单元测试、构建 |
| `qa.yml` | Daily / Push | 自动化QA测试、健康度检查 |
| `pr-review.yml` | PR | 自动代码审查、PR评论 |
| `security.yml` | PR / Weekly | 安全扫描、依赖审计 |
| `weekly-retro.yml` | Weekly | 每周工程回顾 |
| `deploy.yml` | Tag / Manual | 部署到 Staging/Production |

### 3. 依赖管理

| 组件 | 文件 | 功能 |
|-----|------|-----|
| Dependabot | `dependabot.yml` | 自动依赖更新 |

---

## 🚀 使用方法

### 本地开发

```bash
# 安装 Git Hooks
./.gstack/install-hooks.sh

# 运行完整循环
./.gstack/autoloop.sh full

# 单独阶段
./.gstack/autoloop.sh review    # 代码审查
./.gstack/autoloop.sh qa        # 自动化测试
./.gstack/autoloop.sh health    # 健康度检查

# 每周回顾
./.gstack/weekly-retro.sh
```

### GitHub Actions

```bash
# 手动触发工作流
github.com → Actions → 选择工作流 → Run workflow
```

### 自动触发

- **提交代码** → 自动运行 lint + 类型检查
- **推送代码** → 自动运行 QA 测试
- **创建 PR** → 自动代码审查 + PR评论
- **每天凌晨** → 自动 QA + 健康度检查
- **每周一早** → 自动生成工程回顾报告

---

## 📊 系统状态

### 当前健康度

| 指标 | 数值 | 状态 |
|-----|------|-----|
| 测试文件 | 114 | ✅ |
| 覆盖率 | 43% | ✅ |
| 代码行数 | 47,832 | - |
| 安全漏洞 | 3个 | ⚠️ |
| 健康评分 | 5/10 | ⚠️ |

### QA 测试结果

| 指标 | 数值 |
|-----|------|
| 总测试项 | 17 |
| 通过 | 13 (76%) |
| 警告 | 4 |
| 失败 | 0 |

---

## 🔄 完整循环流程

```
开发 → 提交 → 推送 → PR → 合并 → 部署 → 回顾
  ↑                                    ↓
  └──────── 自动化检查贯穿全程 ←───────┘
```

### 详细流程

1. **开发阶段**
   - 本地编码
   - `./.gstack/autoloop.sh` 自检

2. **提交阶段** (Git Hook)
   - ESLint 检查
   - TypeScript 类型检查

3. **推送阶段** (Git Hook)
   - 快速 QA 测试

4. **PR 阶段** (GitHub Actions)
   - 代码审查
   - 自动 PR 评论
   - 状态检查

5. **合并后** (GitHub Actions)
   - 完整 CI 流程
   - QA 自动化测试
   - 健康度检查

6. **部署** (GitHub Actions)
   - Tag 触发自动部署
   - 或手动触发

7. **定期任务**
   - 每日：QA + Health
   - 每周：工程回顾
   - 每周：安全扫描
   - 每周：依赖更新检查

---

## 🛠️ 自定义配置

### 修改阈值

编辑 `.gstack/autoloop.config.json`：

```json
{
  "stages": {
    "qa": {
      "thresholds": {
        "passRate": 75,      // 修改通过率阈值
        "warnings": 5
      }
    },
    "health": {
      "thresholds": {
        "score": 7.0,        // 修改健康度评分阈值
        "coverage": 20
      }
    }
  }
}
```

### 修改 CI 触发条件

编辑 `.github/workflows/ci.yml`：

```yaml
on:
  push:
    branches: [main, develop, feature/*]  // 添加分支
```

---

## 📈 查看报告

### 本地报告

```bash
# 查看最近的自循环报告
ls -la .gstack/loop-reports/autoloop_*.md | tail -5

# 查看最近的 QA 报告
ls -la .gstack/qa-reports/report_*.md | tail -5

# 查看每周回顾
cat .gstack/loop-reports/weekly_retro_$(date +%Y-W%U).md
```

### GitHub Actions 报告

1. 进入 GitHub → Actions
2. 点击工作流运行记录
3. 查看 Artifacts 下载报告

---

## 🔧 故障排除

### Git Hooks 不生效

```bash
# 检查 hooks 是否正确安装
ls -la .git/hooks/pre-commit
ls -la .git/hooks/pre-push

# 重新安装
./.gstack/install-hooks.sh
```

### CI 检查失败

```bash
# 本地复现 CI 错误
cd frontend
npm run lint
npx tsc --noEmit
npm test
```

### 跳过检查（紧急情况）

```bash
git commit --no-verify    # 跳过 pre-commit
git push --no-verify      # 跳过 pre-push
```

---

## 🎯 下一步建议

1. **提高健康评分**
   - 修复安全漏洞：`npm audit fix`
   - 增加测试覆盖率

2. **增强监控**
   - 集成 Slack 通知
   - 配置 PagerDuty 告警

3. **性能优化**
   - 启用 CI 缓存
   - 并行化测试任务

---

## 📚 相关文档

- [G-Stack 工作流文档](.github/workflows/README.md)
- [G-Stack 自循环文档](.gstack/README.md)
- [QA 测试报告](QA_REPORT_2026-04-02.md)

---

**配置完成时间**: 2026-04-02
**系统版本**: v1.0.0
