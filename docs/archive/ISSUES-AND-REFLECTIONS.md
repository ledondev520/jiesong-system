# 问题记录与反思

**创建时间**: 2026-03-05 23:05  
**记录者**: 小雷

---

## 🔴 遇到的问题

### 问题 1: Codex 账户使用限制

**现象**:
- 多个 Session 遇到 `ERROR: You've hit your usage limit for GPT-5.3-Codex-Spark`
- 影响 Session: fix-audit-log, fix-tech-debt, fix-rbac, fix-inventory
- 错误信息：`Switch to another model now, or try again at Mar 6th, 2026 1:55 AM`

**原因**:
- 账户级别的 Codex 使用配额限制
- 每个 Session 消耗的 tokens 累计达到上限
- fix-audit-log: 368,244 tokens
- fix-tech-debt: 565,364 tokens

**影响**:
- 4 个 Session 无法继续执行
- 总体进度卡在 50%
- 需要等待约 3 小时后自动解除

**解决方案**:
1. ✅ 等待限制解除（推荐）
2. ❌ 切换模型（被 Stans 老大否决）
3. ❌ 重启 Session（无效，限制是账户级别的）

**教训**:
- 需要更早监控 tokens 使用量
- 应该在达到 80% 配额时就采取措施
- 需要合理分配 tokens 到关键 Session

---

### 问题 2: 中文字符导致 zsh 命令失败

**现象**:
- 多个 Session 出现 `zsh: command not found: \M-^X\M-^Z...`
- 影响 Session: fix-security, fix-state-machine, fix-rbac, fix-inventory 等

**原因**:
- 使用中文发送 Codex 指令时，特殊字符被 zsh 错误解析
- tmux send-keys 直接发送中文导致编码问题

**影响**:
- 指令无法正确执行
- 需要重新用英文发送指令

**解决方案**:
- ✅ 使用英文发送 Codex 指令
- ✅ 使用单引号包裹指令避免 shell 解析

**教训**:
- 应该从一开始就用英文发送 Codex 指令
- 需要避免在 tmux 中直接发送中文

---

### 问题 3: /compact 指令使用错误

**现象**:
- 尝试使用 `/compact` 指令清理上下文
- 收到错误：`zsh: no such file or directory: /compact`

**原因**:
- `/compact` 不是 zsh 命令，是 Codex 内部指令
- 应该在 Codex 对话中使用，而不是在 shell 中

**影响**:
- 无法通过/compact 解决 token 限制问题

**解决方案**:
- ❌ /compact 对账户级别限制无效
- ✅ 只能等待限制解除

**教训**:
- 需要区分 Codex 内部指令和 shell 命令
- /compact 只能清理上下文，不能解决账户配额限制

---

## 🎯 做得不好的地方（小雷反思）

### 1. Token 使用监控不足 ⚠️

**问题**:
- 没有及时监控每个 Session 的 tokens 使用量
- 等到收到限制错误才发现问题
- 导致 4 个 Session 同时被阻塞

**改进**:
- 应该每 30 分钟检查一次 tokens 使用情况
- 在达到 80% 配额时提前预警
- 优先保证 P0 和 P1 任务的 tokens 分配

---

### 2. 指令发送方式不当 ⚠️

**问题**:
- 一开始用中文发送 Codex 指令
- 导致多个 Session 出现 zsh 解析错误
- 浪费了时间和 Session 配额

**改进**:
- 应该从一开始就用英文发送 Codex 指令
- 使用单引号包裹指令
- 避免在 tmux 中直接发送中文

---

### 3. Session 管理不够精细 ⚠️

**问题**:
- 8 个 Session 同时运行，tokens 消耗过快
- 没有根据优先级分配 tokens
- P2 任务消耗了大量 tokens（fix-tech-debt: 565K）

**改进**:
- 应该按优先级顺序执行 Session
- P0 完成后执行 P1，最后执行 P2
- 给每个 Session 设置 tokens 预算

---

### 4. Review 时机偏晚 ⚠️

**问题**:
- 等到所有 Session 完成才开始 Review
- 发现问题时 tokens 已经用完
- fix-rbac 和 fix-inventory 需要返工但无法立即修复

**改进**:
- 应该在每个 Session 完成后立即 Review
- 发现问题立即修复，不要等到最后
- 边做边 Review，避免集中返工

---

### 5. 风险预案不足 ⚠️

**问题**:
- 没有预料到 Codex 使用限制问题
- 没有准备备选方案
- 导致进度突然中断

**改进**:
- 应该提前了解 Codex 配额限制
- 准备分批次执行计划
- 关键任务优先保证

---

## 📋 待办事项

### 立即执行
- [ ] 继续监控 Session 状态
- [ ] 等待 Codex 限制解除（Mar 6th 1:55 AM）
- [ ] 限制解除后立即修复 fix-rbac 和 fix-inventory

### 限制解除后
- [ ] 优先修复 P1 问题（fix-rbac, fix-inventory）
- [ ] 完成 P1 日志审计（fix-audit-log）
- [ ] 完成 P2 技术债（fix-tech-debt）
- [ ] 最终 Review 所有产出

### 长期改进
- [ ] 建立 tokens 监控机制
- [ ] 制定 Session 执行优先级策略
- [ ] 准备风险预案和备选方案
- [ ] 优化 Review 流程（边做边 Review）

---

## 💡 经验总结

1. **Token 配额是有限资源**，需要精细管理
2. **优先级驱动**，P0/P1 优先保证
3. **边做边 Review**，避免集中返工
4. **英文指令**，避免编码问题
5. **风险预案**，提前了解限制

---

*记录时间：2026-03-05 23:05*
