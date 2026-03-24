# HSCODE-BF-01 Results

## 结论
- 这轮 HSCode 补抓任务已经收口。
- 关键结果不是“55 章又抓到很多新编码”，而是确认了 `55` 章本身就是边界到 `5516`，旧 `400` 阈值把它误判成缺口。

## 数据结果
- 原始快照：`14161`
- CSV：`14161`
- 正式库 `hs_codes`：`14161`

## 现场核验
- `5501`：有结果（`11`）
- `5516`：有结果（`20`）
- `5517`：无结果（`0`）
- `5599`：无结果（`0`）

## 产出
- `backend/scripts/backfill_hscode_prefixes.py` 增加 `--verify-source`
- `backend/scripts/scrape_hscode_raw.py` 支持保留 4 位前缀输入
- 完成 `manifest -> CSV -> DB` 三层同步
