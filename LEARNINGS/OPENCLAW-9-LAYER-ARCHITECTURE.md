# OpenClaw System Prompt 9 层架构学习笔记

**来源**: https://x.com/servasyy_ai/status/2029489020208848966  
**作者**: huangserva (@servasyy_ai)  
**学习时间**: 2026-03-06 01:20  
**学习者**: 小雷

---

## 📊 整体架构图

OpenClaw 的 System Prompt 不是单一文件，而是 **9 层架构** 的精心编排：

```
Layer 1: OpenClaw Framework Core（框架核心层）
Layer 2: Tool Definitions（工具定义层）
Layer 3: Skills Registry（技能注册表）
Layer 4: Model Aliases（模型别名层）
Layer 5: Protocol Specifications（协议规范层）
Layer 6: Runtime Info（运行时信息层）
Layer 7: Workspace Files（工作区文件层）★ 用户可控
Layer 8: Bootstrap Hook System（动态注入层）★ 用户可控
Layer 9: Inbound Context（入站上下文层）
```

---

## 🎯 各层详解

### Layer 1: 框架核心层

**比喻**: 操作手册的"使用说明"

**职责**: 告诉 LLM 你是谁、能做什么、应该怎么回应

**示例**:
```
你正在以「创意伙伴」身份运行，这是一个 AI 内容创作专家 Agent。
当前时间：2026-03-05 14:37:00 CST
运行环境：agent=creative | host=黄宗宁的 MacBook Air
=== 工具调用规范 ===
- 使用 XML 风格的工具调用格式
- 每个工具调用必须包含唯一的 tool_call_id
=== 安全边界 ===
- 严禁执行 destructive 操作
- 处理用户敏感信息时必须加密存储
```

**设计权衡**:
- ✅ 框架层统一生成，保证所有 Agent 基础行为一致
- ❌ 用户无法修改这些核心规则

---

### Layer 2: 工具定义层

**比喻**: 瑞士军刀的工具清单

**职责**: 告诉 LLM 有哪些工具、每个工具是干什么用的、怎么用

**示例**:
```json
{
  "name": "read",
  "description": "读取文件内容。支持文本文件和图片。",
  "parameters": {
    "type": "object",
    "properties": {
      "path": {"type": "string", "description": "文件路径"},
      "offset": {"type": "number", "description": "起始行号"},
      "limit": {"type": "number", "description": "最大读取行数"}
    },
    "required": ["path"]
  }
}
```

**设计权衡**:
- ✅ 使用严格的 JSON Schema，LLM 能准确理解工具用法
- ❌ 添加新工具需要编写完整的 Schema

---

### Layer 3: 技能注册表

**比喻**: 餐厅的"特色菜谱"

**职责**: 告诉 LLM 有哪些专业领域的"配方"可以调用

**设计权衡**:
- ✅ 自动扫描 skills 目录，添加新 Skill 无需修改配置
- ❌ 无法精确控制每个 Agent 可用的 Skill

---

### Layer 4: 模型别名层

**比喻**: 快捷键

**职责**: 给复杂的模型路径起个简短的别名

**示例**:
```
## Model Aliases
- GLM-5: zhipu/glm-5
- Opus 4.6: xiaowang886/claude-opus-4-6-thinking
- Sonnet 4.5: xiaowang886/claude-sonnet-4-5
```

**设计权衡**:
- ✅ 简化模型调用，支持多 Provider 切换
- ❌ 需要维护别名配置文件

---

### Layer 5: 协议规范层

**比喻**: 交通规则

**职责**: 定义 Agent 与系统交互的标准协议

**示例**:
```
Silent Replies:
用户：收到
Agent：NO_REPLY

Heartbeats:
System: [Heartbeat Poll]
Agent: HEARTBEAT_OK

Reply Tags:
Agent：[[reply_to_current]] 已完成任务 ✓
```

**设计权衡**:
- ✅ 保证所有 Agent 行为一致，支持自动化监控
- ❌ 限制了 Agent 的自由表达

---

### Layer 6: 运行时信息层

**比喻**: 仪表盘

**职责**: 告诉 LLM 当前运行环境的实时状态

**示例**:
```
## Runtime
Runtime: agent=thinktank | host=黄宗宁的 MacBook Air | repo=/Users/huangzongning/.openclaw/workspace-thinktank | os=Darwin 25.2.0 (arm64) | node=v25.5.0 | model=xiaowang886/claude-opus-4-6-thinking | shell=zsh | channel=discord | thinking=off
```

**设计权衡**:
- ✅ LLM 知道当前时间/模型/环境，避免错乱
- ❌ 每次请求消耗 ~2KB token

---

### Layer 7: 工作区文件层 ⭐ 用户可控

**比喻**: 你的工作笔记

**职责**: 用户可以直接编辑的静态配置文件

**核心文件**:
- `IDENTITY.md` - Agent 身份标识
- `AGENTS.md` - 参与规则
- `SOUL.md` - 个性风格
- `USER.md` - 用户信息
- `TOOLS.md` - 环境值
- `HEARTBEAT.md` - 心跳检查
- `MEMORY.md` - 综合偏好

**设计权衡**:
- ✅ 用户可以定义 Agent 身份、工作规范、记忆
- ❌ 用户无法修改框架核心行为

**优化建议**:
- ✅ IDENTITY.md: 保留核心 TELOS 框架，使用表格代替段落
- ✅ AGENTS.md: 使用 checklist 代替长段落
- ✅ MEMORY.md: 依赖 MemOS 自动导出，不要手动添加
- ❌ 不要重复描述框架已知的事情
- ❌ 不要把 Skills 详细说明复制到 Workspace Files

---

### Layer 8: Bootstrap Hook 系统 ⭐ 用户可控

**比喻**: 可编程的注射器

**职责**: 可以写脚本在运行时动态注入内容到 System Prompt

**四种 Hook 机制**:

#### 1. agent:bootstrap Hook（内部 Hook）
**能力**: 完全控制 bootstrapFiles 数组
```javascript
registerInternalHook("agent:bootstrap", (event) => {
  const context = event.context;
  context.bootstrapFiles = [
    { path: "CUSTOM.md", content: "自定义内容" }
  ];
});
```

#### 2. bootstrap-extra-files Hook（Bundled Hook）
**能力**: 只追加文件，不修改现有文件
```json
{
  "hooks": {
    "bootstrap-extra-files": {
      "enabled": true,
      "paths": ["extra/*.md", "docs/CONTEXT.md"]
    }
  }
}
```

#### 3. before_prompt_build Hook（Plugin Hook）
**能力**: 修改最终 prompt（在系统提示词构建后、发送给 LLM 前）
```javascript
on("before_prompt_build", (event, ctx) => {
  return {
    prependContext: `当前时间：${new Date().toISOString()}`
  };
});
```

#### 4. bootstrapMaxChars / bootstrapTotalMaxChars（配置项）
**能力**: 控制字符预算
- 单文件默认 20K
- 总计默认 150K
- 超出部分按头 70% + 尾 20% 截断

**实战建议**:
- 场景 1（添加项目文档）→ bootstrap-extra-files
- 场景 2（根据任务类型动态加载）→ agent:bootstrap Hook
- 场景 3（注入实时上下文）→ before_prompt_build Hook

---

### Layer 9: 入站上下文层

**比喻**: 实时路况信息

**职责**: 每次请求都会动态注入当前对话的上下文信息

**组成内容**:
- 消息元信息（message_id, timestamp）
- 发送者信息（sender_id, sender_name）
- 对话历史（最近 N 条消息）
- 聊天类型（DM/group/channel）

**设计权衡**:
- ✅ LLM 知道当前是谁在说话、对话历史、是否被@
- ❌ 每次请求消耗 ~3KB token

---

## 📊 大小对比表

| 层 | 大小估算 | 是否用户可控 |
|----|---------|------------|
| Layer 1: 框架核心 | ~5KB | ❌ |
| Layer 2: 工具定义 | ~10KB | ❌ |
| Layer 3: 技能注册 | ~20KB | ❌ |
| Layer 4: 模型别名 | ~2KB | ❌ |
| Layer 5: 协议规范 | ~8KB | ❌ |
| Layer 6: 运行时信息 | ~2KB | ❌ |
| Layer 7: 工作区文件 | ~15-50KB | ✅ |
| Layer 8: Hook 注入 | ~5-30KB | ✅ |
| Layer 9: 入站上下文 | ~3KB | ❌ |
| **总计** | **~70-130KB** | - |

---

## 🎯 关键收获

### 1. 用户可控层有 2 个（不是 1 个！）
- **Layer 7**（Workspace Files）- 静态配置文件
- **Layer 8**（Bootstrap Hook System）- 动态注入脚本

### 2. 优化策略
**Layer 7 优化**:
- ✅ 使用表格/ checklist 代替长段落
- ✅ 删除冗余描述
- ✅ 依赖系统自动维护（如 MEMORY.md）

**Layer 8 优化**:
- ✅ 优先使用 bootstrap-extra-files（简单场景）
- ✅ 需要条件判断时使用 agent:bootstrap
- ✅ 需要实时上下文时使用 before_prompt_build

### 3. 提示词裁剪策略
如果 System Prompt 过大：
1. 精简 Layer 7（静态文件）
2. 优化 Layer 8（Hook 注入）
3. 调整 bootstrapMaxChars 配置

---

## 💡 应用到我当前的工作

### 已实现的功能对照

| 功能 | 对应层 | 状态 |
|------|--------|------|
| AGENTS.md 安全规则 | Layer 7 | ✅ 已实现 |
| 数据分级 | Layer 7 | ✅ 已实现 |
| 写作风格约束 | Layer 7 | ✅ 已实现 |
| 两消息模式 | Layer 5 | ✅ 已实现 |
| Silent Replies (NO_REPLY) | Layer 5 | ✅ 已实现 |
| Heartbeats | Layer 5 | ✅ 已实现 |
| Reply Tags | Layer 5 | ✅ 已实现 |
| Runtime Info | Layer 6 | ✅ 已实现 |
| 模型别名 (gpt-5.3-codex) | Layer 4 | ✅ 已实现 |

### 可以优化的地方

1. **精简 AGENTS.md**
   - 使用 checklist 代替长段落
   - 删除冗余描述

2. **使用 Hook 系统**
   - 考虑使用 bootstrap-extra-files 注入项目文档
   - 考虑使用 before_prompt_build 注入实时上下文

3. **优化 token 使用**
   - 检查 Layer 7 文件大小
   - 确保不超过 bootstrapMaxChars 限制

---

## 📚 总结

OpenClaw 的 System Prompt 是一个 **9 层架构** 的精心编排：

- **Layer 1-6**: 框架自动生成，保证一致性和稳定性
- **Layer 7**: 用户可编辑的静态配置文件
- **Layer 8**: 用户可编程的动态注入脚本
- **Layer 9**: 框架自动注入的实时上下文

**理解这些层的区别和联系，才能真正掌握 OpenClaw 的配置能力！**

---

*学习时间：2026-03-06 01:20*
*来源：https://x.com/servasyy_ai/status/2029489020208848966*
