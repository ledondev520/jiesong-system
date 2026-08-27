# WeChat Group Agent

本 Module 是普通微信群 AI 小秘书的本地 MVP。它复用当前已登录的微信账号，但不修改微信二进制、不关闭 SIP，也不读取微信加密数据库。

## Interface

- 输入：白名单群的规范化消息，或 macOS Vision OCR 快照。
- 触发：只有识别为当前账号发出的“总结一下 / 帮我总结 / 群聊总结 / 需求总结”才生成摘要。
- 记忆：独立 JSONL 消息存储，目录 `0700`、文件 `0600`；不进入正式业务数据库。
- 输出：默认写入 `latest-summary-draft.json`，不自动发微信。
- 模型：只有显式设置 `WECHAT_GROUP_AGENT_ALLOW_REMOTE=true` 才允许把群消息发送到已配置的 Kimi；否则失败关闭。
- 群范围：所有采集与摘要命令都要求群名精确匹配 `WECHAT_GROUP_AGENT_GROUP_ALLOWLIST`。

## CLI

```bash
cd backend

# 必填；多个群用英文逗号分隔。建议先只放内部测试群。
export WECHAT_GROUP_AGENT_GROUP_ALLOWLIST="测试群"

# 查看安全状态
node src/agent/wechat-group/index.js doctor

# 模拟采集消息
node src/agent/wechat-group/index.js ingest \
  --group "测试群" --sender "客户A" --text "需要100个纸箱，周五前交"

# 模拟当前账号触发总结；未显式允许远程模型时会失败关闭
node src/agent/wechat-group/index.js ingest \
  --group "测试群" --sender "我" --text "总结一下" --own

# 导入 Vision OCR JSON 快照
node src/agent/wechat-group/index.js snapshot \
  --group "测试群" --file /absolute/path/to/snapshot.json

# 只读抓取当前可见微信窗口；首次运行会在受限 state 目录编译本机 OCR Helper
node src/agent/wechat-group/index.js capture --group "测试群"

# 常驻轮询；微信必须停留在该群，顶部群名必须与白名单精确匹配
node src/agent/wechat-group/index.js watch --group "测试群" --interval 4
```

## Safety

- 群消息是 Confidential，不打印正文或模型 prompt 到运行日志。
- 当前账号代发时，群成员看到的仍是用户本人，不是独立机器人身份。
- 报价、付款、合同和交期承诺不允许自动确认。
- 自动发送 Adapter 尚未启用；接入前必须补充群白名单、当前群标题复核和速率限制。
- 每次采集都复核微信顶部群标题；标题缺失、白屏或切到其他群时只报错，不采集。
- OCR 只能读取当前可见窗口；锁屏、微信最小化或群未打开时失败关闭。
