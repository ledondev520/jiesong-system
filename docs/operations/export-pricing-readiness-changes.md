# readiness 统一公式的价格变化

基线为 `43543b3658408e981b5dfdec4b7c3cbc039280d8`，即接入 readiness 前的七个本地提交。
用户已选择统一公式并接受以下默认推荐价变化。输入均来自 `tests/fixtures/pricing-synthetic.json`，不含真实业务数据。
最初基点 `56426be209e270024008b761dbd835a54a6c4c47` 的 readiness 推荐价也得到同一张对照表。

| 合成输入 | 成本 CNY | 数量 | 现汇 | 退税率 % | readiness 旧→新 USD/件 |
| --- | --- | --- | --- | --- | --- |
| 13-normal | 6600 | 10 | 6.8 | 13 | 126.18→130 |
| 13-fractional | 6005.54 | 10.24 | 6.8 | 13 | 112.12→115.72 |
| 13-low-cost | 1 | 7 | 6.8 | 13 | 0.03→0.71 |
| 13-history-allowed | 6600 | 10 | 6.8 | 13 | 126.18→130 |
| 13-history-rejected | 6600 | 10 | 6.8 | 13 | 126.18→130 |
| 13-manual | 6600 | 10 | 6.8 | 13 | 126.18→130 |
| 13-missing-cost | null | 10 | 6.8 | 13 | null→null |
| 13-invalid-fx | 6600 | 10 | 0.2 | 13 | 4290→null |
| 13-missing-spec | 6600 | 10 | 6.8 | 13 | 126.18→130 |
| 0-normal | 6600 | 10 | 6.8 | 0 | 126.18→110 |
| 0-fractional | 6005.54 | 10.24 | 6.8 | 0 | 112.12→97.66 |
| 0-low-cost | 1 | 7 | 6.8 | 0 | 0.03→1 |
| 0-history-allowed | 6600 | 10 | 6.8 | 0 | 126.18→110 |
| 0-history-rejected | 6600 | 10 | 6.8 | 0 | 126.18→110 |
| 0-manual | 6600 | 10 | 6.8 | 0 | 126.18→110 |
| 0-missing-cost | null | 10 | 6.8 | 0 | null→null |
| 0-invalid-fx | 6600 | 10 | 0.2 | 0 | 4290→null |
| 0-missing-spec | 6600 | 10 | 6.8 | 0 | 126.18→110 |
| None-normal | 6600 | 10 | 6.8 | null | 126.18→130 |
| None-fractional | 6005.54 | 10.24 | 6.8 | null | 112.12→115.72 |
| None-low-cost | 1 | 7 | 6.8 | null | 0.03→0.71 |
| None-history-allowed | 6600 | 10 | 6.8 | null | 126.18→130 |
| None-history-rejected | 6600 | 10 | 6.8 | null | 126.18→130 |
| None-manual | 6600 | 10 | 6.8 | null | 126.18→130 |
| None-missing-cost | null | 10 | 6.8 | null | null→null |
| None-invalid-fx | 6600 | 10 | 0.2 | null | 4290→null |
| None-missing-spec | 6600 | 10 | 6.8 | null | 126.18→130 |

共 27 组输入，24 组价格变化，3 组缺成本仍为 null。
None 表示缺少当前税则证据。此时公式候选价与 packet 一致，同时继续阻断资料不完整的单证。
现汇 0.2 调整后为零，原推荐价 4290 改为 null。
极低成本仍保留 packet 原有凑整行为，不能保证所有候选价都满足名义零退税比例上限。

表中只比较 readiness 的公式推荐价。历史价与人工价不会覆盖这个字段。
packet 的最终报价仍经过既有历史价、人工价选择和门禁。
除公式推荐价和定价元数据外，readiness 的已保存价、汇总、退税估算、准备度问题均与基线相同。

packet 与 Python 各 27 组完整 JSON 在本轮改前基线与最初基点上均与改后字节一致。
packet 快照 SHA-256 为 `56fda637a8a554c445a4825c00dd40f76a9b4c9d18e419625efaa3977a0be0ae`。
Python 快照 SHA-256 为 `fea580e9008e78ba88cb2be116282dc14fc6b07141be6d96c50b2c3b4e17d41c`。
这里的字节指完整建议 JSON，不包括含动态 ZIP 元数据的 XLSX 文件。

从纯 Git 导出的基线运行以下命令可重建表格、完整快照和回执。

```bash
python3 scripts/verify_pricing_defaults.py --baseline-root /tmp/pricing-base --evidence /tmp/pricing-compare
```
