# Task HSCODE-BF-01 Log

- 时间: 2026-03-24 15:30:00 +0800
- 目标: 完成 HSCode `400` 截断章节补抓收口，重点确认 `55` 章是否仍有真实缺口，并同步 raw / CSV / 正式库。

## 执行步骤
1. 读取 `manifest.json`、`records/*.json`、CSV 与正式库，确认当前三层数量差异。
2. 对 `55` 章运行 dry-run，发现旧逻辑仍把 `5517-5599` 视作候选缺失前缀。
3. 现场抽查源站边界前缀：
   - `5501`、`5516` 有结果
   - `5517`、`5599` 无结果
4. 将 `backfill_hscode_prefixes.py` 增强为支持 `--verify-source`。
5. 将 `scrape_hscode_raw.py` 调整为支持 4 位前缀输入。
6. 重建 manifest、重建 CSV、重新入库 `hs_codes`。

## 关键结论
- `55` 章不是“还漏了 `5517-5599` 没抓”，而是旧 `==400` 阈值规则的假阳性。
- 原始数据、CSV、正式库当前已同步到同一数量：`14161`。

## 验证命令
- `python3 -m unittest backend/scripts/test_backfill_hscode_prefixes.py backend/scripts/test_scrape_hscode_raw.py`
- `python3 backend/scripts/scrape_hscode_raw.py --rebuild-manifest-only`
- `python3 backend/scripts/export_hscode_csv.py`
- `node backend/scripts/import-hscode-live.js`
- 边界核验：`5501 / 5516 / 5517 / 5599`

## 结果
- 脚本测试：`10/10` 通过。
- manifest：`14161`
- CSV：`14161`
- DB：`14161`
