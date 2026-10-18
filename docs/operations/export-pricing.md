# 出口报价配置

当前配置同时作用于 `exportReadinessService`、`exportPacketService` 和 `prepare_export_packet.py`。
用户已选择统一公式，并接受 readiness 默认推荐价的变化。
readiness 复用 packet 的分档与凑整函数，默认使用调整后的汇率和 30%/10% 加价。
例如成本 6600 CNY、数量 10、现汇 6.8，readiness 有退税推荐价从 126.18 变为 130 USD，
零退税从 126.18 变为 110 USD。packet 和 Python 的默认完整 JSON 输出保持字节一致。
完整合成对照表见 [readiness 统一公式的价格变化](export-pricing-readiness-changes.md)。

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
原始现汇必须是大于零的有限数字。有效汇率为现汇加 exchangeAdjustment，
保留六位小数后也必须大于零才能形成报价。正向调整不能补造缺失或非法现汇。

分档模式对有退税商品使用 refundableMarkup，对零退税商品使用 noRefundMarkup 上限。
乘数模式对全部已核验退税商品使用 multiplier - 1 的目标加价。
两种模式都使用调整后的汇率，并沿用原有整数单价或美元总额尾数 0/5 的凑整选择。
默认 mode 为 tiered，只有管理员主动选择 multiplier 才启用乘数模式。
只修改 multiplier 数值不会改变 tiered 报价。readiness 不再接受请求 profitRate 覆盖。
readiness 的 pricingProfitRate 按行表示 1 + 目标加价，effectiveExchangeRate 为调整后的汇率。
顶层 profitRate 保留为有退税目标倍率，multiplier 模式下为配置的 multiplier。
顶层和行级 exchangeRate 仍表示原现汇，公式说明使用 effectiveExchangeRate。

历史报价仍要求同商品名、规格及当前成本复算通过。
分档零退税历史价为不亏损至上限，其余目标容差仍为 5 个百分点。
人工确认单价的政策检查和提示也读取当前配置。
已保存合同价格不会因修改配置被批量重算，后续预览或生成按新配置计算。
readiness 推荐价只表示公式计算。packet 仍优先使用通过门禁的历史价或人工价，
因此这两种最终报价不要求等于 readiness 公式推荐价。缺少退税证据时沿用 packet 的
有退税目标生成候选价，同时保留资料缺失阻断。有效汇率非正时不提供推荐价。

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
每次 readiness 查询、packet 预览或生成在异步查询前固定一份配置快照。
packet 内部的 readiness 计算使用同一快照，避免查询期间混入新值。

结构化 stderr 事件只保留时间、操作者 ID、改变的字段名、前后 SHA-256。
后端和 Python 对同一文件字节生成相同指纹，不记录配置值、合同数据或密钥。
人工文件编辑在下一次读取时记录新指纹。全部读取进程停止期间的编辑，
编辑者需要保留文件系统操作记录。锁文件不会自动超时抢占。
进程崩溃后需先确认没有活跃写入者，再由管理员清理遗留锁。

运行时应给三个消费者同一可读文件，后端账号还需有目录写权限。
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

回执保存两个服务的完整 JSON，以及 packet 和 Python 各自完整 JSON 的字节等价结果与 SHA-256。
readiness-price-changes.md 包含 27 组输入的旧新推荐价，readiness-price-changes.json 保留原数值。
readiness 除推荐价与公式元数据外，已保存价、汇总、退税估算和准备度问题均与基线相同。
参数矩阵核对全部三个消费者，覆盖各参数同步变更及显式 multiplier 模式。
测试另以全部 27 组输入验证两套 JS 公式价一致，包含小数数量、极低成本、缺成本和无效汇率。
真实应用认证验收只使用临时迁移 SQLite、合成用户和内存测试 JWT，不输出凭据。
React 设置页测试使用 API 桩，不能替代浏览器端到端测试。

## 2026-10-18 本地全量验收

| 全量检查 | 最初基点 56426be | 本轮基线 43543b3 | 改后 | 失败数 |
| --- | --- | --- | --- | --- |
| backend `npm test` | 783 | 790 | 795 | 0 |
| backend `npm run test:db` | 211 | 211 | 211 | 0 |
| frontend `npm test -- --maxWorkers=2` | 1038 | 1052 | 1052 | 0 |
| frontend `./node_modules/.bin/tsc --noEmit` | PASS | PASS | PASS | 0 |
| root `python3 -m unittest discover -s tests` | 19 | 23 | 23 | 0 |

本轮基线和改后五组命令均首次通过。最初基点计数来自此前保存的基线日志。
本次后端新增五个行为用例，其他全量计数保持不变。
