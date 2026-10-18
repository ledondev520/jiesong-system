# 出口报价配置

当前配置作用于 `exportPacketService` 和 `prepare_export_packet.py`。
`exportReadinessService` 的推荐价尚未接入，因为旧默认公式为未调整汇率 ×1.3，
与 packet 的默认分档公式不同。统一结果会改变 readiness 默认输出。
在用户明确这项冲突前，本轮保留其旧行为，不把它宣称为已统一。

## 配置与校验

唯一值来源是仓库根目录 `config/pricing.json`。
后端和 Python 可通过相同的 `JIESONG_PRICING_CONFIG` 选择同一完整 JSON 文件。
路径默认为仓库文件，与进程工作目录无关。不会读取 `.env`。

| 字段 | 默认 | 允许值 |
| --- | --- | --- |
| mode | tiered | tiered 或 multiplier |
| exchangeAdjustment | -0.2 | -2 至 2 的有限数字 |
| refundableMarkup | 0.3 | 0 至 1 的有限数字 |
| noRefundMarkup | 0.1 | 0 至 1 的有限数字 |
| multiplier | 1.3 | 1 至 5 的有限数字 |

校验范围以 `config/pricing.schema.json` 为准。必须提供所有字段。
字符串数字、布尔值、null、未知字段、NaN、Infinity 和超范围值均拒绝。
文件不存在、损坏或不合法时停止计算，不使用隐藏默认或旧缓存。
有效汇率为现汇加 exchangeAdjustment，必须大于零才能形成报价。

分档模式对有退税商品使用 refundableMarkup，对零退税商品使用 noRefundMarkup 上限。
乘数模式对全部已核验退税商品使用 multiplier - 1 的目标加价。
两种模式都使用调整后的汇率，并沿用原有整数单价或美元总额尾数 0/5 的凑整选择。
这不是默认切换口径，只有管理员主动选择 multiplier 才启用乘数模式。

历史报价仍要求同商品名、规格及当前成本复算通过。
分档零退税历史价为不亏损至上限，其余目标容差仍为 5 个百分点。
人工确认单价的政策检查和提示也读取当前配置。
已保存合同价格不会因修改配置被批量重算，后续预览或生成按新配置计算。

原凑整算法对极低采购成本有既存边界。最低整数单价候选可能超过名义零退税上限。
本轮为保持默认输出等价保留该行为，不能把上限描述为任意输入都成立的数学保证。
合成反例和完整前后输出保存在本轮证据目录。

## 管理员保存与日志

现有设置页增加独立的出口报价卡片。百分比显示为 30/10，文件存储为 0.3/0.1。
`GET/PUT /api/v1/system/pricing-config` 均要求当前认证用户为 ADMIN。
普通 SystemConfig 的 profitRate 不参与此文件的覆盖或回退。

保存提交完整配置及最后读取的 revision。过期版本或正在写入的文件返回 409，
非法字段返回 400，文件读写失败返回明确错误。
服务使用独占 `.lock` 和同目录临时文件后原子替换，保存文件权限为 0600。
一次 packet 预览或生成固定使用一份快照，避免异步资料查询期间混入新值。

结构化 stderr 事件只保留时间、操作者 ID、改变的字段名、前后 SHA-256。
后端和 Python 对同一文件字节生成相同指纹，不记录配置值、合同数据或密钥。
人工文件编辑在下一次读取时记录新指纹。全部读取进程停止期间的编辑，
编辑者需要保留文件系统操作记录。锁文件不会自动超时抢占。
进程崩溃后需先确认没有活跃写入者，再由管理员清理遗留锁。

运行时应给两个消费者同一可读文件，后端账号还需有目录写权限。
使用外部持久文件时必须显式设置相同路径，仓库升级不应覆盖运行时配置。
Python 旧的三个报价 CLI 参数仅允许与文件一致，防止形成第二份报价来源。

## 复核

`tests/fixtures/pricing-synthetic.json` 含 27 组固定输入。
从本轮基点 `56426be209e270024008b761dbd835a54a6c4c47` 导出纯 Git 副本，
为其提供原后端依赖后，从当前仓库执行：

```bash
python3 scripts/verify_pricing_defaults.py --baseline-root /tmp/pricing-base --evidence /tmp/pricing-compare
NODE_ENV=test JWT_SECRET=test-only-jwt-secret-for-ci-123456 node --test backend/src/services/exportPricing.configuration.test.js backend/src/services/pricingConfigService.test.js backend/src/routes/pricingConfig.test.js backend/src/routes/pricingConfig.auth.test.js
python3 -m unittest discover -s tests
```

回执分别保存两个服务的完整 JSON 和 Python 完整建议 JSON、字节等价结果与 SHA-256。
参数矩阵核对 packet 和 Python。readiness 与 packet 参数变更后的结果统一尚未验收。
真实应用认证验收只使用临时迁移 SQLite、合成用户和内存测试 JWT，不输出凭据。
React 设置页测试使用 API 桩，不能替代浏览器端到端测试。
