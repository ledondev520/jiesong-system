# HSCODE-RAW-01 Result

## Delivery
- 新增真实站点原始抓取测试：
  - `backend/scripts/test_scrape_hscode_raw.py`
- 新增真实站点原始抓取器：
  - `backend/scripts/scrape_hscode_raw.py`
- 新增 CSV 导出测试与脚本：
  - `backend/scripts/test_export_hscode_csv.py`
  - `backend/scripts/export_hscode_csv.py`
- 新增计划文档：
  - `docs/plans/2026-03-08-hscode-live-capture.md`
- 新增原始数据输出目录：
  - `backend/data/hscode-live/records/*.json`
  - `backend/data/hscode-live/chapters/**/*`
  - `backend/data/hscode-live/manifest.json`
  - `backend/data/hscode-live/hscode-live.csv`

## Current Snapshot
- 当前累计原始记录：908
- 当前已见章节前缀分布：
  - `01`: 147
  - `02`: 143
  - `03`: 400
  - `04`: 70
  - `05`: 90
  - `69`: 58

## Verification
- `python3 -m unittest backend/scripts/test_scrape_hscode_raw.py backend/scripts/test_export_hscode_csv.py` => 3/3 pass
- `python3 backend/scripts/scrape_hscode_raw.py --request-delay 0.02 --workers 6` => 908 条快照、0 抓取异常退出
- `python3 backend/scripts/export_hscode_csv.py` => 导出 `hscode-live.csv`，908 行

## Notes
- 当前结果已形成“原始快照 + 总 CSV”两层产物，但尚未做数据库入库映射。
- 源站当前章节搜索返回结果主要集中在 `01/02/03/04/05/69` 前缀；这份 CSV 反映的是当前可抓取范围。
