# WPS 历史数据导入待裁决备忘录

更新时间：2026-06-05

## 当前缺失项解决方法

这批剩余缺失项不能继续按“自动补数据”处理；当前自动可写项为 `0`。后续只走三条关闭路径：

1. 精确原件路径：`11-报关记录/20250815禧瑞都/购销合同CG2500045-不锈钢桶-禧瑞都.pdf` 与根目录当前版 `出货汇总.xlsx` 必须取得目标 size/SHA1 精确匹配本机文件后，才运行 `probe_wps_cloud_only_files.py` 和 `close_wps_cloud_only_files.py`。同名旧文件、旧缓存、Downloads 同名文件不能关闭缺口。
2. 正式报关材料路径：`PENDING-威斯敏` 三张 `BGNDING-*` 占位报关单必须补正式 18 位海关编号、正式报关单原件和正式报关明细。当前 WPS 装箱源只能部分命中，不替代正式报关材料。
3. 业务裁决/历史保留路径：零价、零数量、历史占位、门店/数量/价格冲突项继续留在 `wps_remaining_action_matrix.*`。没有原件页证据或业务裁决前，不改价、不删行、不补 note。

最新复核结果：`db_source_gaps=170`、`total_rows=174`、`pending_auto_writes=0`、`decision_items=2`、`cloud_only_files=2`。

最新收件校验包：

- `tmp/wps_11_export_list_raw/parsed/wps_missing_evidence_intake_package.json`
- `tmp/wps_11_export_list_raw/parsed/wps_missing_evidence_intake_package.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_missing_evidence_intake_package.md`

该包覆盖全部 `174` 行剩余事项，并把每项转为材料类型、验收标准、严格字段、校验命令和禁止动作。当前 `ready_for_apply=0`，收到材料后也必须先按包内 validation runner 复跑。

最新本机收件扫描：

- `tmp/wps_11_export_list_raw/parsed/wps_missing_evidence_incoming_scan.json`
- `tmp/wps_11_export_list_raw/parsed/wps_missing_evidence_incoming_scan.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_missing_evidence_incoming_scan.md`

默认扫描 `tmp/wps_missing_evidence_inbox`、`tmp/wps_11_export_list_raw/incoming`、`/Users/helena/Downloads`、`/Users/helena/Downloads/出口外贸`。当前扫描器已做内容级识别和重叠目录去重：扫描 `591` 个文件，内容扫描 `135` 个文件，`cloud_exact_ready_to_close=0`、`formal_candidate_files=3`、`formal_strong_candidate_files=0`、`formal_reference_candidate_files=2`、`ready_for_apply=0`。其中 `出货汇总.xlsx` 和 `出货汇总(1).xlsx` 只归为参考汇总线索，不是正式报关单。

## 可复跑明细包

我已经把本备忘录对应的逐条待裁决事项生成到：

- `tmp/wps_11_export_list_raw/parsed/wps_import_decision_packet.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_import_decision_packet.json`
- `tmp/wps_11_export_list_raw/parsed/wps_import_decision_packet.md`
- `tmp/wps_11_export_list_raw/parsed/wps_remaining_decision_dossier.json`
- `tmp/wps_11_export_list_raw/parsed/wps_remaining_decision_dossier.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_remaining_decision_dossier.md`
- `tmp/wps_11_export_list_raw/parsed/wps_remaining_decision_execution_plan.json`
- `tmp/wps_11_export_list_raw/parsed/wps_remaining_decision_execution_plan.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_remaining_decision_execution_plan.md`
- `tmp/wps_11_export_list_raw/parsed/wps_cloud_only_probe.json`
- `tmp/wps_11_export_list_raw/parsed/wps_cloud_only_probe.md`
- `tmp/wps_11_export_list_raw/parsed/wps_cloud_only_broad_local_search.json`
- `tmp/wps_11_export_list_raw/parsed/wps_cloud_only_broad_local_search.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_cloud_only_broad_local_search.md`
- `tmp/wps_11_export_list_raw/parsed/wps_cloud_only_close_plan.json`
- `tmp/wps_11_export_list_raw/parsed/wps_cloud_only_close_plan.md`
- `tmp/wps_11_export_list_raw/parsed/wps_cloud_only_download_handles.json`
- `tmp/wps_11_export_list_raw/parsed/wps_cloud_only_download_handles.md`
- `tmp/wps_11_export_list_raw/parsed/wps_cloud_only_log_api_clues.json`
- `tmp/wps_11_export_list_raw/parsed/wps_cloud_only_log_api_clues.md`
- `tmp/wps_11_export_list_raw/parsed/wps_import_completion_audit.json`
- `tmp/wps_11_export_list_raw/parsed/wps_import_completion_audit.md`
- `tmp/wps_11_export_list_raw/parsed/wps_db_source_coverage.json`
- `tmp/wps_11_export_list_raw/parsed/wps_db_source_coverage.md`
- `tmp/wps_11_export_list_raw/parsed/wps_source_gap_classification.json`
- `tmp/wps_11_export_list_raw/parsed/wps_source_gap_classification.md`
- `tmp/wps_11_export_list_raw/parsed/wps_source_gap_details.json`
- `tmp/wps_11_export_list_raw/parsed/wps_source_gap_details.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_source_gap_details.md`
- `tmp/wps_11_export_list_raw/parsed/wps_source_gap_disposition.json`
- `tmp/wps_11_export_list_raw/parsed/wps_source_gap_disposition.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_source_gap_disposition.md`
- `tmp/wps_11_export_list_raw/parsed/wps_pending_formalization_blockers.json`
- `tmp/wps_11_export_list_raw/parsed/wps_pending_formalization_blockers.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_pending_formalization_blockers.md`
- `tmp/wps_11_export_list_raw/parsed/wps_remaining_source_gap_execution_plan.json`
- `tmp/wps_11_export_list_raw/parsed/wps_remaining_source_gap_execution_plan.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_remaining_source_gap_execution_plan.md`
- `tmp/wps_11_export_list_raw/parsed/wps_remaining_action_matrix.json`
- `tmp/wps_11_export_list_raw/parsed/wps_remaining_action_matrix.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_remaining_action_matrix.md`
- `tmp/wps_11_export_list_raw/parsed/wps_candidate_source_mapping_review.json`
- `tmp/wps_11_export_list_raw/parsed/wps_candidate_source_mapping_review.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_candidate_source_mapping_review.md`
- `tmp/wps_11_export_list_raw/parsed/wps_candidate_source_ownership_review.json`
- `tmp/wps_11_export_list_raw/parsed/wps_candidate_source_ownership_review.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_candidate_source_ownership_review.md`
- `tmp/wps_11_export_list_raw/parsed/wps_duplicate_source_owner_sales_cleanup_plan.json`
- `tmp/wps_11_export_list_raw/parsed/wps_aggregate_source_owner_sales_cleanup_plan.json`
- `tmp/wps_11_export_list_raw/parsed/wps_operational_source_gap_review.json`
- `tmp/wps_11_export_list_raw/parsed/wps_operational_source_gap_review.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_operational_source_gap_review.md`
- `tmp/wps_11_export_list_raw/parsed/wps_purchase_file_retention_audit.json`
- `tmp/wps_11_export_list_raw/parsed/wps_purchase_file_retention_audit.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_purchase_file_retention_audit.md`
- `tmp/wps_11_export_list_raw/parsed/wps_export_file_retention_audit.json`
- `tmp/wps_11_export_list_raw/parsed/wps_export_file_retention_audit.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_export_file_retention_audit.md`
- `tmp/wps_11_export_list_raw/parsed/wps_export_file_import_plan.json`
- `tmp/wps_11_export_list_raw/parsed/wps_purchase_file_import_plan.json`
- `tmp/wps_11_export_list_raw/parsed/wps_purchase_orphan_file_recovery_plan.json`
- `tmp/wps_11_export_list_raw/parsed/purchase_item_source_note_backfill_plan.json`
- `tmp/wps_11_export_list_raw/parsed/purchase_item_strict_alias_source_note_backfill_plan.json`
- `tmp/wps_11_export_list_raw/parsed/sales_item_shipment_summary_source_note_backfill_plan.json`
- `tmp/wps_11_export_list_raw/parsed/wps_pending_sales_formal_source_cleanup_plan.json`
- `tmp/wps_11_export_list_raw/parsed/wps_pending_packing_formal_source_cleanup_plan.json`
- `tmp/wps_11_export_list_raw/parsed/cg2500013_purchase_contract_repair_plan.json`
- `tmp/wps_11_export_list_raw/parsed/packing_item_source_note_backfill_plan.json`
- `tmp/wps_11_export_list_raw/parsed/customs_placeholder_source_note_backfill_plan.json`
- `tmp/wps_11_export_list_raw/parsed/purchase_mismatch_source_note_backfill_plan.json`
- `tmp/wps_11_export_list_raw/parsed/wps_cloud_metadata.csv`
- `tmp/wps_11_export_list_raw/parsed/wps_cloud_metadata.json`
- `tmp/wps_11_export_list_raw/parsed/wps_cloud_metadata_summary.md`
- `tmp/wps_11_export_list_raw/parsed/root_shipment_cloud/wps_cloud_metadata.csv`
- `tmp/wps_11_export_list_raw/parsed/root_shipment_cloud/wps_cloud_metadata.json`
- `tmp/wps_11_export_list_raw/parsed/root_shipment_cloud/wps_cloud_metadata_summary.md`

生成命令：

```bash
python scripts/build_wps_import_decision_packet.py
python scripts/build_wps_remaining_decision_dossier.py
python scripts/build_wps_remaining_decision_execution_plan.py
python scripts/probe_wps_cloud_only_files.py
python scripts/probe_wps_cloud_only_broad_local_search.py
python scripts/close_wps_cloud_only_files.py
python scripts/probe_wps_cloud_only_download_handles.py
python scripts/probe_wps_cloud_only_log_api_clues.py
node scripts/audit_wps_db_source_coverage.js
node scripts/classify_wps_source_gaps.js
node scripts/build_wps_source_gap_detail_packet.js
python scripts/classify_wps_source_gap_disposition.py
python scripts/classify_wps_pending_formalization_blockers.py
python scripts/build_wps_remaining_source_gap_execution_plan.py
python scripts/build_wps_remaining_action_matrix.py
python scripts/analyze_wps_candidate_source_mappings.py
python scripts/analyze_wps_candidate_source_ownership.py
node scripts/backfill_wps_sales_from_shipment_summary_notes.js
node scripts/cleanup_wps_pending_sales_items_covered_by_formal_sources.js
node scripts/cleanup_wps_pending_packing_items_covered_by_formal_sources.js
node scripts/cleanup_wps_duplicate_source_owner_sales_items.js
node scripts/cleanup_wps_aggregate_source_owner_sales_items.js
python scripts/analyze_wps_operational_source_gaps.py
node scripts/audit_wps_purchase_file_retention.js
node scripts/audit_wps_export_file_retention.js
node scripts/import_wps_export_files.js
node scripts/import_wps_purchase_files.js
node scripts/recover_wps_purchase_orphan_files.js
python scripts/audit_wps_import_completion.py
node scripts/backfill_wps_purchase_item_source_notes.js
node scripts/backfill_wps_purchase_item_strict_alias_source_notes.js
node scripts/repair_wps_cg2500013_purchase_contract.js
node scripts/backfill_wps_packing_item_source_notes.js
node scripts/backfill_wps_customs_placeholder_source_notes.js
node scripts/backfill_wps_purchase_mismatch_source_notes.js
python scripts/inventory_wps_cloud_metadata.py --prefix '11-报关记录/%' --copy-cached
python scripts/inventory_wps_cloud_metadata.py --parsed-dir tmp/wps_11_export_list_raw/parsed/root_shipment_cloud --prefix '出货汇总.xlsx' --prefix '装货清单.xlsx' --prefix '919清单.xlsx' --prefix '0429装货清单-叶总.xlsx' --prefix '0718装货单.xlsx' --copy-cached
```

本轮实际处理了采购侧剩余来源缺口中可严格证明的子集：`scripts/backfill_wps_purchase_item_strict_alias_source_notes.js` 只在同采购合同号、总额、单价、数量强一致，且商品名为精确/包含式别名时追加来源 note。写库前备份 `backend/prisma/backups/dev_2026-06-04_06-50-27.db`；实际更新 `18` 条采购明细来源 note，并修正 `3` 条历史数量/单位错位。写库后采购明细来源覆盖为 `277/278`、采购合同来源覆盖为 `191/192`，总 DB 来源缺口从 `223` 降到 `205`。剩余采购缺口只剩 `CG2500013 / 不锈钢屏风` 合同头和明细；该 PDF 当前无可抽取正文，严格别名匹配仍为 `no_strict_alias_match`，不自动写库。

本轮继续处理 `CG2500013`：用带 `pypdf` 的 Codex Python 重新抽取 PDF 正文后，证明此前 `empty_text` 是运行时口径问题。PDF 原文合同号为 `CG2500013`，供应商 `临沂市宏宇艺术腰线有限公司`，日期 `2025-05-26`，商品 `釉面砖`，数量 `70` 平方米，单价 `150.758`，总额 `11925`；同目录 DOCX 正文合同号为 `CG2500014`，对应屏风合同。已新增 `scripts/repair_wps_cg2500013_purchase_contract.js`，写库前备份 `backend/prisma/backups/dev_2026-06-04_11-10-35.db`，并把库中 `CG2500013` 从误重复的屏风合同修正为 PDF 证明的釉面砖合同；`CG2500014` 屏风合同保留不动。修复后采购合同来源覆盖 `192/192`、采购明细来源覆盖 `278/278`，采购侧来源缺口清零，总 DB 来源缺口降为 `203`。

当前明细包共 `2` 条：

- `sales_missing_store`: `1`
- `evidence_customs_declaration_blocked`: `1`

本轮把剩余 `2` 个裁决项升级成结构化 dossier：`EXP2500002 / 瓷砖` 已拆出源销售行、源装箱行、现库销售/装箱行、反证和可选动作；`EXP2400006` 已拆出现库销售/装箱、现库报关空缺、相关保留文件、真实凭证抽取行和正式编号反证。这个 dossier 只读，不写数据库、不复制文件；用途是让后续业务裁决或补正式材料时不用再从长证据字符串里重翻。

本轮继续增强这个 dossier：现库销售行现在列出库存引用数，现库装箱行现在列出报关引用数。`EXP2500002 / 瓷砖` 与 `EXP2400006` 两个裁决项相关行的库存/报关引用合计均为 `0`。这说明后续拿到业务归属或正式报关材料后，技术上可以相对干净地改、删或保留；但引用为 `0` 不是业务裁决，当前仍不自动写库、不自动删除。

本轮进一步把剩余 `2` 个裁决项固化成只读执行方案：`scripts/build_wps_remaining_decision_execution_plan.py` 生成 `wps_remaining_decision_execution_plan.{json,csv,md}`，覆盖 `6` 个分支。`EXP2500002 / 瓷砖` 包括保留现状、归属安纳汉姆、归属 Burbank、拆分 `771.84` 平方米；`EXP2400006` 包括 reference-only 和取得正式材料后创建报关单。该方案只列目标行、必要输入和安全检查，不写库、不复制、不删除；没有业务归属或正式 18 位海关编号前，不能把它当成 apply 授权。

本轮修正完成度审计里的云端原件缺口口径：过去 `cloud_only_files=1` 只统计 `11-报关记录` 主目录；现在完成度审计与出口文件留存审计统一为跨 scope 合计 `2` 个，其中主目录 `1` 个是 `11-报关记录/20250815禧瑞都/购销合同CG2500045-不锈钢桶-禧瑞都.pdf`（size `348470`、SHA1 `c4bfefb55677fdb20e0a249400681ce73c14aa25`），根目录清单 `1` 个是当前版 `出货汇总.xlsx`（size `90013`、SHA1 `d4755f642c13f61a6c9aedec233c31e74f58d0d3`）。两者都不写库、不用旧缓存或相似文件冒充。

本轮继续对这 `2` 个云端原件缺口做窄探测：`scripts/probe_wps_cloud_only_files.py` 反查项目源目录、WPS 团队文档/根目录本机路径、`~/Downloads`、`~/Downloads/出口外贸` 和 WPS `cache.db`。结论是 `ready_to_copy_count=0`：`CG2500045` 只有 WPS metadata 目标记录但无本机文件；根目录 `出货汇总.xlsx` 本机和项目里都是旧 67KB / `92f4...` 版本，Downloads 有 82KB / `f7b...` 同名文件，但都不是 metadata 指向的 90KB / `d4755f...` 当前版。尝试打开旧缓存触发 WPS 同步后，文件仍保持 67KB / SHA1 `92f422118e855cdcc600dea505eb961fd1689773`。

本轮继续对这 `2` 个 cloud-only 原件做 WPS 内部状态深探测：新增 `scripts/probe_wps_cloud_only_deep_state.py`，只读复核 `cache.db`、`syncassistant.db`、`precloudfile.db`、`transferhelper.db`、`datacache.db`、`cachedata` 和 WPS 日志命中。结论仍是没有可关闭缺口的隐藏本机文件：`CG2500045` 只有旧 `20250728禧瑞都` 路径 size `452772` 的失败传输记录，错误 `-5 文件不存在`，不是无年份目标 `348470/c4bf...`；根目录 `出货汇总.xlsx` 只有团队目录旧 `fileId=427264929193`、size `39820` 的 syncassistant 记录，没有当前根目录 `fileId=425927234267`、size `90013/d4755...` 的下载任务或 cachedata 命中。

本轮新增 cloud-only 原件关闭工具：`scripts/close_wps_cloud_only_files.py` 只消费 `wps_cloud_only_probe.json` 中 SHA1 精确匹配的本机候选，默认 dry-run；目标路径已有旧版本时，必须显式 `--replace-existing`，并先保留 `.superseded-<sha1>` 备份。当前关闭计划为 `target_count=2`、`ready_to_copy_count=0`、`not_ready_count=2`、`copied_count=0`，所以没有复制、没有替换旧 `出货汇总.xlsx`、没有关闭两个 cloud-only 缺口。

本轮继续只读探测两个 cloud-only 原件的下载手柄：`scripts/probe_wps_cloud_only_download_handles.py` 抽取 WPS 本机 metadata/cache/transfer 的 `fileId`、`groupId`、`taskId` 和状态，不联网、不输出 token。结论是 `directly_downloadable_count=0`：无年份 `CG2500045` PDF 的 metadata 目标 SHA1/size 明确，但 `fileId=-1`，本机旧 transfer 指向 `20250728禧瑞都` 的不同大小文件；根目录当前版 `出货汇总.xlsx` 有 `fileId=425927234267`，但同 fileId 的 cache 仍是旧 SHA1/旧大小，没有目标 `90013/d4755...` 的 transfer 产物。

本轮继续只读扫描 WPS 本机日志接口线索：`scripts/probe_wps_cloud_only_log_api_clues.py` 扫描最新 `120` 个 WPS 相关日志文件，只输出脱敏后的 URL host/path/query key、接口词和错误码摘要，不输出 token/cookie/authorization/signature、query value 或日志正文。两个 cloud-only 目标均为 `no_api_clues_in_matching_log_lines`，没有可用下载 URL、接口词或错误码线索；因此仍不能关闭原件缺口。

本轮把剩余 `199` 条来源缺口进一步汇总成逐条执行队列：`scripts/build_wps_remaining_source_gap_execution_plan.py` 生成 `wps_remaining_source_gap_execution_plan.{json,csv,md}`，把每条缺口映射为必要输入、禁止动作和安全下一步。当前动作族为：`operational_keep_or_cleanup_decision=60`、`candidate_mapping_review=39`、`candidate_conflict_review=36`、`source_required_no_candidate=24`、`formal_evidence_required=18`、`pending_placeholder_review=14`、`operational_review=8`。该队列只读，`auto_writable=0`，不能作为删除、补 note 或创建报关单的 apply 授权。

本轮继续复核 `candidate_mapping_review=39` 的候选来源占用关系：`scripts/analyze_wps_candidate_source_ownership.py` 检查候选 WPS 来源当前挂接的 DB 行是否有库存/报关引用、是否为聚合门店占用。结果把 39 条拆成 `owner_conflicts_or_partial_match_review=26`、`multi_candidate_still_requires_review=6`、`aggregate_owner_no_refs_transfer_candidate=5`、`duplicate_exact_owner_no_refs_review=2`。其中 5 条聚合占用转移候选和 2 条同字段无引用占用项可作为后续重点复核，但本轮 `auto_writable=0`，不移动 note、不删除行。

本轮继续处理 `duplicate_exact_owner_no_refs_review=2`：新增 `scripts/cleanup_wps_duplicate_source_owner_sales_items.js`，先 dry-run 再备份数据库 `backend/prisma/backups/dev_2026-06-04_14-07-14.db`，最终删除 `EXP250019 / 亚克力板` 两条无来源重复销售行，并把它们唯一额外字段 `unit=张` 合并到带 WPS 来源的保留行。写库后来源覆盖审计从 `199` 降到 `197`，候选映射复核从 `39` 降到 `37`，出口源 merge dry-run 仍为 `0` 新增/更新/未匹配。

本轮继续处理 `aggregate_owner_no_refs_transfer_candidate=5`：新增 `scripts/cleanup_wps_aggregate_source_owner_sales_items.js`，只删除无来源 note、无库存引用、且被带 WPS 来源聚合门店销售行覆盖的拆分销售重复行。写库前备份 `backend/prisma/backups/dev_2026-06-04_14-18-10.db`，随后删除 `EXP250021 / LED吊灯 / 圣荷西2115`、`EXP250021 / 人造石英石台面 / 圣荷西625店`、`EXP250021 / 人造石英石台面 / 红木城店`、`EXP250020 / 椅子 / 圣荷西625店`、`EXP250020 / 椅子 / 红木城店` 这 5 条无来源拆分行，并把单位合并到带 WPS 来源的聚合行。写库后来源缺口降到 `192`，候选映射复核降到 `32`，聚合占用转移候选为 `0`。

当前裁决包中已没有装箱歧义。`EXP250027` 已从裁决包移除；`EXP2500001 / 冷冻肉切片机` 本轮也已从裁决包移除，处理方式是只清理错挂来源 note，不合并厂家字段不同的两条装箱行。

本轮继续刷新 WPS 索引、附件盘点、采购抽取、出口源分析和真实凭证抽取：`11-报关记录` 仍为 `579` 个云端文件，其中 `578` 个已有本机正文或项目源目录保留，仅 `1` 个顶层旧副本仍只在云端索引可见。采购抽取首选合同仍为 `192` 份，`ready_missing_contract_count=0`、`header_ready_missing_contract_count=0`；出口源分析 `contracts_missing_in_db=[]`；出口源、采购合同、真实凭证导入 dry-run 均为 `0` 待写入。本轮没有写数据库。

本轮还发现一次运行时误差：如果用缺少 PDF 正文依赖的系统 Python 运行 `extract_wps_export_evidence.py`，真实凭证会被大量误标为 `empty_text`，裁决包会假增到 `35` 条。有效抽取结果以 Codex Python 为准：`status_counts.ok=41`、`mapping_action_counts.blocked=1`，重建裁决包后仍为 `2` 条。

本轮新增完成度审计 `tmp/wps_11_export_list_raw/parsed/wps_import_completion_audit.md`：出口源、真实凭证、采购凭证三条导入计划的自动可写入项合计为 `0`，出口源装箱/销售未匹配均为 `0`，warnings 为 `0`。因此 `import_gap_report.md` 中仍存在的源/库行数差异只作为粗粒度差异线索，不再单独视作待写库依据；当前剩余事项以完成度审计和裁决包为准。

本轮继续推进数据库来源可追溯性：新增 `tmp/wps_11_export_list_raw/parsed/wps_db_source_coverage.md`，并只给合同头回填 WPS 文件来源 note。写库前备份 `backend/prisma/backups/dev_2026-06-03_02-34-38.db`，实际更新出口合同头 `39` 条、采购合同头 `89` 条；没有改金额、日期、状态、门店、供应商或明细业务字段。回填后来源缺口从 `461` 降到 `333`，其中出口合同头已达 `42/42`，采购合同头 `190/192`。完成度审计状态因此更新为 `db_source_gaps_present`，下一步来源追溯工作应集中在明细行和少量报关记录。

本轮继续推进采购明细来源追溯：新增 `tmp/wps_11_export_list_raw/parsed/purchase_item_source_note_backfill_plan.json`，只在采购凭证明细与现库采购明细按合同号、商品、数量、单价或总额唯一匹配时追加 `[WPS_PURCHASE_EVIDENCE]` note。写库前备份 `backend/prisma/backups/dev_2026-06-03_02-42-05.db`，实际更新采购明细 note `87` 条；没有改商品、数量、单价、总额、供应商或合同头字段。回填后采购明细来源覆盖从 `171/278` 提升到 `258/278`，总来源缺口从 `333` 降到 `246`。剩余 `20` 条采购明细因来源歧义或无唯一匹配继续保留，不硬挂来源。

本轮继续推进装箱明细来源追溯：新增 `tmp/wps_11_export_list_raw/parsed/packing_item_source_note_backfill_plan.json`，只在 WPS 装箱源行与现库装箱明细按合同号、商品、门店、数量和可用装箱字段唯一匹配时追加 `[WPS_PACKING_SOURCE]` note。写库前备份 `backend/prisma/backups/dev_2026-06-03_02-48-40.db`，实际更新装箱明细 note `4` 条，全部来自 `_wps_cloud_root/出货汇总.xlsx` 的明确行号；没有改商品、门店、数量、箱数、重量、体积、厂家、规格、采购合同号或价格字段。回填后装箱明细来源覆盖从 `393/445` 提升到 `397/445`，总来源缺口从 `246` 降到 `242`。0 数量、空数量或字段不足的装箱候选继续跳过，不硬挂来源。

本轮继续推进占位报关单来源追溯：新增 `tmp/wps_11_export_list_raw/parsed/customs_placeholder_source_note_backfill_plan.json`，只在整张占位报关单明细集合与同一个 WPS 装箱源集合完全匹配时追加 `[WPS_PROVISIONAL_CUSTOMS_SOURCE]` note。写库前备份 `backend/prisma/backups/dev_2026-06-03_02-54-43.db`，实际只给 `EXP250028 / BGP250028` 回填 `1` 条报关单头 note，来源为 `_wps_cloud_root/出货汇总.xlsx#26-oakland混合` 的 16 条源行；note 明确包含 `not_formal_customs_no`，不代表已取得正式 18 位海关编号。回填后报关单头来源覆盖从 `27/31` 提升到 `28/31`，报关明细继承来源覆盖从 `26/57` 提升到 `42/57`，总来源缺口从 `242` 降到 `225`。`PENDING-威斯敏` 三张占位报关单无法完整匹配同一个 WPS 源集合，继续跳过。

本轮先复核销售明细来源缺口：`137` 条缺来源 note 的销售明细，用当前 `import_plan.json` 的标准化销售源按同合同、同商品、同规格、同数量、同价格、同门店严格匹配，安全可回填数为 `0`；因此没有给销售明细硬挂来源。随后继续推进采购合同号口径冲突来源追溯：新增 `tmp/wps_11_export_list_raw/parsed/purchase_mismatch_source_note_backfill_plan.json`，只在 PDF 文件名合同号与同目录 DOCX 正文合同号不同、但供应商/日期/金额可对齐时追加 `[WPS_PURCHASE_FILENAME_CONTRACT_MISMATCH]` note。写库前备份 `backend/prisma/backups/dev_2026-06-03_03-01-44.db`，实际只给 `CG2400019` 合同头和 `1` 条采购明细回填 note；note 明确包含 `filename_contract_no=CG2400019`、`body_contract_no=CG2400016`、`body_contract_no_mismatch`、`pdf_text_blocked`。没有改合同号、供应商、日期、金额、商品、数量或单价。`CG2500013` 因同目录正文候选不唯一继续跳过。

本轮新增剩余来源缺口分类报告 `tmp/wps_11_export_list_raw/parsed/wps_source_gap_classification.md`。分类脚本用当前标准化销售/装箱源复核剩余缺口：销售明细 `137` 条、装箱明细 `48` 条当前都没有安全唯一回填项；采购合同剩余 `CG2500013`，采购明细剩余 `19` 条，`PENDING-威斯敏` 占位报关相关缺口 `18` 条。本轮没有写数据库；三条导入 dry-run 仍为 `0` 待写入，完成度审计保持 `pending_auto_writes=0`、`db_source_gaps=223`。

本轮继续把剩余来源缺口从汇总分类升级为逐条明细包：新增 `tmp/wps_11_export_list_raw/parsed/wps_source_gap_details.json`、`tmp/wps_11_export_list_raw/parsed/wps_source_gap_details.csv`、`tmp/wps_11_export_list_raw/parsed/wps_source_gap_details.md`。明细包总数与来源覆盖审计一致为 `223` 条，分桶为销售明细缺来源 `137`、装箱明细缺来源 `48`、采购明细缺来源 `19`、报关明细继承父报关单缺来源 `15`、报关单缺来源 `3`、采购合同头缺来源 `1`。每条记录都列出 DB 行、合同/单号、商品、门店、数量、匹配失败原因、候选来源摘要和后续动作；本轮仍不写数据库。

本轮继续把 `223` 条来源缺口从逐条明细升级为处置分层：新增 `tmp/wps_11_export_list_raw/parsed/wps_source_gap_disposition.json`、`tmp/wps_11_export_list_raw/parsed/wps_source_gap_disposition.csv`、`tmp/wps_11_export_list_raw/parsed/wps_source_gap_disposition.md`。分层结果为 `zero_or_operational_review=118`、`candidate_mapping_review=39`、`no_candidate_source_required=28`、`formal_evidence_required=18`、`purchase_unique_evidence_required=16`、`purchase_ambiguous_evidence_required=4`，全部 `auto_writable=false`。这说明当前缺口没有任何一条能仅凭现有文件证据自动写来源 note；后续要么补正式材料/唯一采购凭证，要么逐项复核候选映射，要么确认这些历史操作性行继续保留为无来源 note 状态。

本轮继续深挖 `candidate_mapping_review=39`：新增 `tmp/wps_11_export_list_raw/parsed/wps_candidate_source_mapping_review.json`、`tmp/wps_11_export_list_raw/parsed/wps_candidate_source_mapping_review.csv`、`tmp/wps_11_export_list_raw/parsed/wps_candidate_source_mapping_review.md`，把 DB 行、候选 WPS 源行、候选源是否已出现在其他 DB note 中并排比较。结论仍是 `auto_writable=0`：`33` 条候选源已经挂在其他 DB 行 note 中，不能复用关闭当前缺口；`6` 条是多候选人工复核。典型情形包括同一 WPS 行已经归到组合门店或拆分行，另一个单门店/汇总行虽然能看到同源候选，但复用会造成重复来源链。

本轮继续复核 `zero_or_operational_review=118`：新增 `tmp/wps_11_export_list_raw/parsed/wps_operational_source_gap_review.json`、`tmp/wps_11_export_list_raw/parsed/wps_operational_source_gap_review.csv`、`tmp/wps_11_export_list_raw/parsed/wps_operational_source_gap_review.md`，检查这些零数量、零售价、PENDING 占位、非捷淞/拼船/自行报关历史行是否有库存或报关引用。结论仍是 `auto_writable=0`，且当前 `inventory_refs=0`、`customs_refs=0`；但“无引用”只说明可以进入人工清理/保留口径复核，不代表可以自动删除。分层为：`candidate_conflict_review=36`、`zero_price_no_ref_review=36`、`zero_quantity_price_no_ref_review=24`、`pending_placeholder_review=14`、`operational_marker_no_ref_review=6`、`operational_no_ref_review=2`。

本轮继续复核 `formal_evidence_required=18`：新增 `tmp/wps_11_export_list_raw/parsed/wps_formal_customs_gap_review.json`、`tmp/wps_11_export_list_raw/parsed/wps_formal_customs_gap_review.csv`、`tmp/wps_11_export_list_raw/parsed/wps_formal_customs_gap_review.md`。这 18 条全部来自 `PENDING-威斯敏` 三张占位报关单：`BGNDING-威斯敏`、`BGNDING-威斯敏-2`、`BGNDING-威斯敏-3`。结论仍是 `auto_writable=0`：现有 WPS 装箱源没有任何一个完整集合可覆盖整张占位单，最接近的 `EXP260005 / 31-威斯敏` 也只是部分命中；现有真实凭证抽取和附件清单中，命中 `EXP260005/EXP260006/EXP260007/威斯敏` 的正式报关单候选为 `0`。因此这批不能用近似装箱行、占位海关号或占位 HS 编码自动写库。

本轮继续从 `no_candidate_source_required=28` 中找可自动关闭的漏匹配装箱来源：新增 `tmp/wps_11_export_list_raw/parsed/packing_item_all_source_note_backfill_plan.json` 和 `scripts/backfill_wps_packing_item_all_source_notes.js`。`preferred_packing_items.csv` 没包含的 `_wps_cloud_root/出货汇总.xlsx` 全量源里，有 4 条能以同合同、同商品、同门店、同数量、同单位，并且箱数/毛重/净重/体积/厂家等锚点一致来唯一证明现库装箱行。写库前备份 `backend/prisma/backups/dev_2026-06-04_11-28-51.db`，随后只给这 4 条装箱明细补来源 note，不改业务字段。总 DB 来源缺口从 `203` 降到 `199`，`no_candidate_source_required` 从 `28` 降到 `24`。`EXP250017 / 切骨机 / 1` 因源行和 DB 行都缺装箱锚点，继续不补；`PENDING-威斯敏` 和 `PENDING-Burbank` 继续按占位材料缺口保留。

本轮随后复核剩余 `no_candidate_source_required=24` 中的 `13` 条销售来源缺口：新增 `tmp/wps_11_export_list_raw/parsed/sales_item_strict_alias_source_note_backfill_plan.json` 和 `scripts/backfill_wps_sales_item_strict_alias_source_notes.js`。dry-run 结果为 `salesItemUpdates=0`。其中 `EXP2500004 / LED吊灯` 与源文件 `吊灯`、`EXP250020 / 人造石英石制品` 与源文件 `人造石英石板材` 虽能用别名、数量、单价命中，但对应源行已经被其他 DB note 消费，不能复用；`EXP250010 / 餐盘` 有两个同内容 WPS 源副本，不能自动选择；其余销售行没有强一致候选。本轮不写数据库。

本轮继续推进文件留存到系统可访问附件：新增 `tmp/wps_11_export_list_raw/parsed/wps_purchase_file_retention_audit.md` 和 `tmp/wps_11_export_list_raw/parsed/wps_purchase_file_import_plan.json`。审计显示 WPS 首选采购凭证 `192` 份均已在本机源目录保留，但系统附件表写入前只有 `91` 条记录、只覆盖 `91` 份采购合同；因此写库前备份 `backend/prisma/backups/dev_2026-06-03_03-22-15.db`，随后复制 `186` 份 WPS 首选采购凭证到 `backend/uploads/contracts/WPS-*` 并新增 `186` 条 `ContractFile` 记录。写入后采购合同附件覆盖为 `192/192`，`auto_attach_candidates=0`，没有修改采购合同或采购明细业务字段。`backend/uploads/contracts` 中仍有 `75` 个历史物理孤儿文件，后续需单独判断是否恢复附件记录。

本轮继续处理 `backend/uploads/contracts` 中的历史物理孤儿文件：扩展 `tmp/wps_11_export_list_raw/parsed/wps_purchase_file_retention_audit.md` 并新增 `tmp/wps_11_export_list_raw/parsed/wps_purchase_orphan_file_recovery_plan.json`。写库前审计显示 `75` 个物理孤儿文件中，`71` 个能从文件名推断到现有采购合同，`4` 个不可恢复。写库前备份 `backend/prisma/backups/dev_2026-06-03_03-29-30.db`，随后只创建 `71` 条 `ContractFile` 记录，不复制、不删除物理文件，也不修改采购业务字段。写入后 `ContractFile` 总数为 `348`，可恢复物理孤儿为 `0`，剩余不可恢复文件为 `CG000012-1774883281335.pdf`、`CG2400005-1774883281266.pdf`、`CG26000014-1774883282574.pdf`、`CG26000015-1774883282568.pdf`。

本轮继续复核剩余 4 个物理孤儿文件：`CG26000014` 与 `CG26000015` 是旧上传文件名多写一个 `0`，删一个 `0` 后分别唯一命中现有采购合同 `CG2600014`、`CG2600015`，且同目录已有 WPS 首选 DOCX `购销合同CG2600014-大理石桌面-威斯敏店.docx` 与 `购销合同CG2600015-餐桌-威斯敏.docx`。写库前备份 `backend/prisma/backups/dev_2026-06-03_03-35-24.db`，随后恢复 `2` 条 `ContractFile` 记录，不复制、不删除物理文件，也不修改采购业务字段。写入后 `ContractFile` 总数为 `350`，可恢复物理孤儿为 `0`，剩余不可恢复文件为 `CG000012-1774883281335.pdf`（无法推断合同号）和 `CG2400005-1774883281266.pdf`（推断合同号现库不存在）。

本轮继续推进出货源文件留存审计：新增 `tmp/wps_11_export_list_raw/parsed/wps_export_file_retention_audit.md`。审计口径只统计正式 `EXP*` 出口合同，不把 `PENDING-Burbank`、`PENDING-圣荷西2115`、`PENDING-威斯敏` 这 3 个占位合同当作正式出货文件缺口。结果显示现库正式 `EXP*` 出口合同 `42` 个，全部至少有一份已保留的高价值 WPS 出货源文件；已保留出口侧源文件 `198` 个，未归属现有正式 EXP 的保留文件 `26` 个多为模板、根目录汇总、进项发票勾选清单或 POR 旧编号文件。本轮没有写数据库、没有复制或删除文件。需要注意：当前数据库只有采购合同 `ContractFile` 附件 Interface，出口合同、装箱、报关、退税没有同类附件 Interface；所以本轮只证明文件已保留和可追溯，不代表线上出口合同页面已经能像采购合同一样下载附件。

本轮继续把出货源文件推进到线上系统可访问附件：新增 `SalesContractFile` 模型和 `20260603035140_add_sales_contract_files` migration，并在销售详情页新增“源文件附件”卡片。写库前备份 `backend/prisma/backups/dev_2026-06-03_03-52-51.db`，随后运行 `node scripts/import_wps_export_files.js --apply`，把能归属到现有正式 `EXP*` 的 WPS 出货/报关源文件复制到 `backend/uploads/sales-contracts/WPS-*` 并创建 `211` 条 `SalesContractFile` 记录，复制体积 `239158827` bytes。写入后 `42/42` 个正式 `EXP*` 合同都有系统附件记录，`auto_attach_candidates=0`，`db_records_missing_physical=0`。本轮没有修改出口合同、销售明细、装箱明细、报关单、退税等业务字段。`26` 个未归属现有正式 EXP 的保留文件继续跳过，不硬挂。

本轮继续做真实页面验收：创建本地测试账号 `codex_test`（`ADMIN`、启用，仅用于本机验收），启动后端 `3001` 和前端 `3002`，登录后打开 `EXP2400001` 销售详情页。后端接口验证显示 `GET /api/v1/sales/cmn4pd7fx004x1pfe5a6rfg9n/files` 返回 `33` 个附件，首个 PDF 下载接口支持 range 并返回 `206 / application/pdf`。页面验收显示“源文件附件”和 `1-报关单捷淞WHSU6140958.pdf` 可见，截图保留在 `tmp/wps_11_export_list_raw/parsed/sales_contract_files_page_EXP2400001.png`。同时修复后端启动巡检两处旧 Interface 使用：管理员筛选改用 `User.isActive=true`，系统巡检操作日志改用 `actorType=SYSTEM` 与 `newValue`。本轮仍不改任何 WPS 业务字段。

本轮继续复核唯一 WPS 云端原件缺口：`11-报关记录/20250815禧瑞都/购销合同CG2500045-不锈钢桶-禧瑞都.pdf`，metadata size `348470`、sha1 `c4bfefb55677fdb20e0a249400681ce73c14aa25`、`file_id=-1`。本机 WPS 无年份路径 `11-报关记录/20250815禧瑞都/` 目录为空；限定查找只发现已保留的 `2025年8月/20250815禧瑞都/购销合同CG2500045-不锈钢桶-禧瑞都.docx` 和 `2025年8月/20250815禧瑞都/归档-购销合同CG2500045-不锈钢桶-禧瑞都.pdf`。Computer Use 读取 WPS 客户端窗口状态超时，当前不能自动打开或下载这个无年份路径 PDF。因同合同业务数据已由已缓存 DOCX/归档 PDF 覆盖，本轮不写数据库、不创建附件，也不拿其他文件冒充该云端原件副本。

本轮继续处理 `EXP2500001 / 冷冻肉切片机`：现库有两条同合同、同商品、同数量、同重量的装箱行，一条厂家为 `南常` 且带 `_wps_cloud_root/出货汇总.xlsx#出货汇总0315_补充:233` 来源，另一条厂家为 `切肉机` 且带 `11-报关记录/出货汇总(1).xlsx#汇总单:56` 来源。问题是 `出货汇总(1):56` 也误挂在了 `南常` 行上，导致导入计划出现同分假歧义。本轮写库前备份 `backend/prisma/backups/dev_2026-06-03_02-11-50.db`，只从 `南常` 行移除 `出货汇总(1):56` 来源 note；没有删除任一装箱行，也没有改数量、重量、体积、厂家、价格等业务字段。写库后出口源 dry-run 显示 `packingMergeUnmatched=0`，装箱去重脚本 dry-run `updateCount=0/deleteCount=0`，裁决包从 `3` 条降到 `2` 条。

本轮继续处理 `EXP250027 / 窗帘` 混合门店口径：源文件正文中 `EXP250027 1217 米尔皮塔.xlsx#装货:5` 写的是 `米尔皮塔、圣荷西625、禧瑞都 / 混合港口 / 66套`，不能直接建成门店；但 `_wps_cloud_root/出货汇总.xlsx#出货汇总0315_补充:85-86` 把同一发票/采购合同拆成 `米尔皮塔、圣荷西625 / Oakland / 31套` 和 `禧瑞都 / 洛杉矶 / 35套`。本轮只因第 85 行给出了现有真实港口 `Oakland`，才新增组合门店 `米尔皮塔、圣荷西625`，并新增该组合门店 31 套装箱行；`混合港口` 的三门店汇总行仍不自动创建门店。

同一销售合同页 `合 同:11` 的 `窗帘 / 66套 / 50` 已按装箱数量精确拆分为 `米尔皮塔、圣荷西625 / 31套 @50` 和 `禧瑞都 / 35套 @50`，并在销售 note 中标记 `[WPS_SALES_SPLIT_BY_PACKING_QUANTITY]`。旧的弱路径推断销售行 `EXP250027 / 窗帘 / 米尔皮塔 / 66套 @50` 已删除；删除前确认它无库存引用，且同源拆分销售行数量合计等于 66。写库与清理前的回滚点分别包括 `backend/prisma/backups/dev_2026-06-03_01-57-04.db`、`backend/prisma/backups/dev_2026-06-03_02-01-36.db`、`backend/prisma/backups/dev_2026-06-03_02-02-26.db`、`backend/prisma/backups/dev_2026-06-03_02-03-23.db`。最终出口源 dry-run 为 `0` 待写入，清理 dry-run 为 `deleteCount=0`，裁决包从 `6` 条降到 `3` 条。

本轮继续处理装箱组合门店源行：`EXP250020 / 椅子 / 圣荷西625店和红木城店`、`EXP250021 / 人造石英石台面 / 圣荷西625店和红木城店`、`EXP250021 / LED吊灯 / 圣荷西2115和625` 的源门店均已在现库存在；这些源行的最高分旧装箱候选都是单门店候选，没有精确组合门店装箱行。因此不把源行硬塞给任一单门店，而是新增 3 条组合门店装箱源行，完整保留 WPS 文件正文门店、数量、箱数、毛重/净重/体积和厂家。写库前备份 `backend/prisma/backups/dev_2026-06-03_01-25-58.db`。裁决包从 `11` 条降到 `8` 条，装箱歧义从 `5` 条降到 `2` 条。

此前已收紧销售门店推断规则：如果同合同同商品的装箱来源已经出现多个门店，销售行不再使用文件名路径推断单一门店。随后本轮继续用更强的同源证据收口：当同一源文件、同一合同、同一商品、同一数量能唯一命中装箱行门店时，允许用该装箱行门店修正销售行，并在 note 中标记 `[WPS_PACKING_QUANTITY_STORE]`。本轮写库更新 `13` 条销售行，其中 `8` 条为门店修正、`5` 条为补充 WPS 来源 note；写库前备份 `backend/prisma/backups/dev_2026-06-02_20-26-39.db`。销售门店待裁决从 `19` 条降到 `7` 条。

本轮继续收口销售门店推断：当同合同、同商品、同数量的全量装箱证据全部指向同一个已知门店时，即使销售合同 sheet 与装箱行不在同一个 WPS 文件，也允许作为门店证据。`EXP2500002 / 瓷砖 / 合同:14` 的 `300` 平方米行由 `_wps_cloud_root/出货汇总.xlsx`、`出货汇总(1).xlsx`、`出货汇总.xlsx` 三处装箱证据共同指向 `安纳汉姆`，因此从销售门店待裁决中移出；现库已有同源销售行且门店正确，本轮没有写数据库。裁决包中的 `sales_missing_store` 证据现在同步展示销售源行、同商品装箱候选和现库同商品销售行。

本轮继续处理 `EXP250028 / 铁艺屏风`：销售合同第 10、12 行均为 `铁艺屏风 / 2 套 / 4800`，装箱证据和现库已存在两个对应的 2 套门店行（`米尔皮塔`、`圣马特店`），且两个销售源行商品、数量、单价完全同质，因此无需强行指定“第 10 行对应哪个门店”。写库前备份 `backend/prisma/backups/dev_2026-06-02_23-51-14.db`，已只给这两个现有门店销售行补入售价 `4800` 和两个 WPS 来源 note；`安纳汉姆` 1 套行未命中销售合同 2 套同质组，保持不动。裁决包从 `22` 条降到 `20` 条，`sales_missing_store` 从 `6` 条降到 `4` 条。

本轮继续处理 `EXP250025 / 瓷砖`：同一 WPS 文件中只有两条瓷砖销售行和两条瓷砖装货行；`合 同:12` 的 `72` 平方米已由同源同数量装货行唯一证明为 `Westminster`，所以剩余的 `合 同:10 / 181.44` 平方米行可与剩余装货行 `装货:3 / Burbank / 201.6` 做同源同商品残余配对。该规则只补门店证据，不改销售数量；写库前备份 `backend/prisma/backups/dev_2026-06-03_00-33-46.db`，已给现有 `Burbank` 销售行补充 `[WPS_PACKING_RESIDUAL_PRODUCT_STORE] Burbank`。裁决包从 `20` 条降到 `18` 条，`sales_missing_store` 从 `4` 条降到 `3` 条，路径门店推断复核从 `9` 条降到 `8` 条。

本轮继续清理 `EXP250014` 的旧路径门店重复行：只删除 `[WPS_SOURCE_PATH_STORE]` 行中已经被同一 WPS source、同合同、同商品、同数量、同售价的非路径推断销售行完全覆盖，且无库存引用的记录。写库前备份 `backend/prisma/backups/dev_2026-06-03_00-50-11.db`，已删除 `餐桌 / 49 / 805`、`瓷砖 / 705 / 12`、`电磁炉 / 100 / 28`、`烤盘 / 300 / 13` 这 4 条旧重复行。`电烤炉`、`新型无烟火锅`、`地膜` 因同源非路径行售价不一致，未删除。裁决包从 `18` 条降到 `14` 条，路径门店推断复核从 `8` 条降到 `4` 条。

本轮继续处理 `EXP250014` 剩余 3 条价格不一致的路径门店行：销售合同/发票页明确 `电烤炉=170`、`新型无烟火锅=370`、`地膜=10`，而现库 `圣荷西2115` 的非路径推断行同源同数量但价格分别为 `28`、`390`、`105.71`。由于这些 `圣荷西2115` 行带 `[WPS_CONTRACT_STORE]`，门店证据强于文件名路径；弱路径行无库存引用且价格正好等于源文件价格。本轮写库前备份 `backend/prisma/backups/dev_2026-06-03_01-06-07.db`，已把 3 条 `圣荷西2115` 行价格校正为源文件价格，并删除对应 `圣荷西` 弱路径重复行。裁决包从 `14` 条降到 `11` 条，路径门店推断复核从 `4` 条降到 `1` 条。

本轮继续复核 `EXP2400006` 的正式报关编号缺口：`_wps_cloud_root/出货汇总.xlsx#出货汇总0315_补充:58` 中确有 `invoice_no=25312000000011328975`，但这是出货汇总的 `invoice_no` 列值，不是正式 18 位海关编号；同时 `EXP2500006.xlsx` 的发票汇总页仍能看到复制自 `EXP2400005` 的大量发票号模板污染。因此本轮没有创建报关单，只把这条反证写入裁决包，避免后续误把 invoice 列或模板污染当成正式海关编号。

## 当前已自动处理到的状态

- WPS 云盘已缓存的 `2026年4月/5月` 出货源文件已同步到本项目临时目录并纳入解析；`EXP260005`、`EXP260006`、`EXP260007` 三个原先缺失的出口合同头已创建。
- `EXP260005/006/007` 已写入 `25` 条装箱明细和 `22` 条销售明细；出口源分析中的 `contracts_missing_in_db` 已收口为 `[]`。
- 已核查 WPS 客户端和 WPS metadata：没有发现名为 `11-出货清单` 的目录；当前可证明的云端历史出货主目录仍是 `11-报关记录`。宽搜 `出货清单` 只命中 `11-报关记录/2024年/0802 C店第二柜/0802出货清单.xlsx`，该文件已保留在项目源目录。
- 本轮把 `0802出货清单.xlsx` 从普通表格附件升级为 `shipment_list` 参考凭证抽取来源；它能唯一归属到 `EXP2400002 / 531620240161954788`，并抽出 `6` 条 HS/申报要素明细。
- 写库前备份 `backend/prisma/backups/dev_2026-06-02_22-06-29.db`，随后用 `0802出货清单.xlsx` 安全补充 `4` 条正式报关明细的 `declarationElements`：`电磁炉`、`电烤炉`、`不锈钢圈`、`铁艺屏风`。写库后真实凭证 dry-run 为 `0`。
- 本轮继续把 `2024年/0802 C店第二柜/出口申报信息.xlsx` 纳入同一 `shipment_list` 参考凭证抽取；它同样能唯一归属到 `EXP2400002 / 531620240161954788`，并且第 5 行名称为 `瓷砖`，与正式报关明细一致。写库前备份 `backend/prisma/backups/dev_2026-06-02_22-16-59.db`，随后补入 `瓷砖` 1 条正式报关明细 `declarationElements`。写库后真实凭证 dry-run 为 `0`。
- 本轮继续从正式出口退税联 PDF 正文抽取申报要素，只写入能形成完整分段、且与现有正式报关明细 itemNo/品名/HS 完全对齐的空字段。写库前备份 `backend/prisma/backups/dev_2026-06-02_22-31-30.db`，实际补入 `11` 条正式报关明细申报要素：`530420240040849246` 10 条、`531620240161954788` 的 `烤盘` 1 条。写库后真实凭证 dry-run 为 `0`。
- 本轮继续复核正式 PDF 坐标文字，确认 `530420240040849246` 的 `支撑柱` item 10 是完整 5 段申报要素 `0|0|支撑用途|304不锈钢|支撑柱`，不是半截字段。写库前备份 `backend/prisma/backups/dev_2026-06-02_22-41-29.db`，实际补入 `1` 条正式报关明细申报要素。写库后真实凭证 dry-run 为 `0`。
- WPS 云盘缓存新增的 `CG2600036` 已导入采购合同和 `1` 条采购明细：供应商 `广州高邦装饰材料有限公司`，商品 `金属蜂窝板`，数量 `22.8` 平方米，总额 `10629`。
- 已从 WPS 本机 `cache.db` 固化全量 `11-报关记录` 云端文件索引：共 `579` 个云端文件，其中 `578` 个已有本机可用正文或已在项目源目录保留，`1` 个仍仅云端可见。
- WPS 索引现在能区分 `filecache`、`direct-local`、`source-root` 三类本机可读来源；通过 WPS 客户端打开/下载和源目录大小校验，当前仅云端可见文件已从 `42` 个压到 `1` 个。
- WPS 云端盘点已补充 metadata 外 filecache 线索：当前额外记录 `5` 条不在 metadata tree 里的 filecache 条目，以及 `4` 条真实失败下载记录；这些失败下载均指向 `20250728禧瑞都` 下的旧合同文件，错误为 `-5 文件不存在`，不作为当前可下载文件写库。
- 本轮继续从 WPS 根目录补取清单类文件：已下载并保留 `919清单.xlsx`、`0429装货清单-叶总.xlsx`、`0718装货单.xlsx` 到 `_wps_cloud_root`。解析器现在会识别根目录清单类工作簿；`919清单.xlsx` 的 `8` 条 `EXP250016` 装箱行已被现有来源覆盖，无需写库；`0429装货清单-叶总.xlsx` 新增证明 `EXP260005` 1 条装箱行，并已写库；`0718装货单.xlsx` 的 `9` 条 `EXP250012` 装箱源行已被现有来源覆盖，无需写库。
- 本轮已导入此前缺失但 DOCX 正文可证明的 `16` 份采购合同、`16` 条采购明细，并新增 `7` 个供应商、`3` 个产品；写库前已备份 `backend/prisma/backups/dev_2026-06-02_16-11-44.db`，写库后采购导入 dry-run 为 `0`。
- 本轮新增导入的采购合同为 `CG2600013`、`CG2600020`、`CG2600021`、`CG2600022`、`CG2600023`、`CG2600025`、`CG2600026`、`CG2600027`、`CG2600028`、`CG2600029`、`CG2600032`、`CG2600033`、`CG2600034`、`CG2600037`、`CG2600038`、`CG2600039`。
- 经过扫描 PDF 图片页和中文 OCR 复核，本轮继续导入 `4` 份此前挂起的采购合同：`CG2400027`、`CG2600024`、`CG2600030`、`CG2600031`；新增 `18` 条采购明细、`3` 个供应商、`17` 个商品/费用行。写库前已备份 `backend/prisma/backups/dev_2026-06-02_16-34-47.db`，写库后采购导入 dry-run 为 `0`。
- WPS 索引中此前没有 `filecache_data` 记录但已按团队文档本机路径或 SHA1/源目录回收的文件，均已重跑抽取；当前没有新的可自动导入采购合同。
- 此前 WPS 客户端打开的 `出货汇总` 是根目录版本；本轮已进一步用 WPS 云文档搜索下载 `11-报关记录/出货汇总.xlsx` 顶层副本，并按独立来源纳入解析。
- WPS 云端没有发现单独名为 `11-出货清单` 的顶层文件夹；当前可证明的团队历史出货主目录是 `11-报关记录`。另有 WPS 根目录 `出货汇总.xlsx` 和团队根目录 `捷淞/装货清单.xlsx`，已作为 `_wps_cloud_root` 独立来源保留。
- WPS 根目录当前 `出货汇总.xlsx` 已纳入解析：它有 `出货汇总0315_补充` sheet、`343` 行；本轮据此把源合同从 `41` 个补到 `42` 个，并把 `EXP250018` 纳入源合同集合。
- 本轮已按 `_wps_cloud_root/出货汇总.xlsx` 证据写库：商品字段更新 `22`，合同汇总更新 `19`，装箱更新 `124`，装箱新增 `38`，销售新增 `2`；写库后 dry-run 已为 `0`。
- WPS 根目录清单盘点已独立生成到 `root_shipment_cloud`：当前 5 个根目录出货/装货/清单候选中，`4` 个已有本机正文并已复制到 `_wps_cloud_root`，仅 `出货汇总.xlsx` 的当前版本仍未缓存。WPS metadata 里根目录 `出货汇总.xlsx` 当前版本已刷新为 `90013` 字节、SHA1 `d4755f642c13f61a6c9aedec233c31e74f58d0d3`，但本机缓存和 WPS 搜索当前只能取得旧缓存版本 `67152` 字节、SHA1 `92f422118e855cdcc600dea505eb961fd1689773`。业务已按已保留的旧缓存版本和团队目录 `11-报关记录/出货汇总.xlsx` 导入；当前 90KB 版本仍作为未缓存线索保留，不写库。
- 全 WPS 本机文件缓存额外扫到一个私人空间同名候选 `CG2600022` DOCX；它与团队文档索引中的 `CG2600022` 大小不同，当前只作为候选线索，不伪装成 `11-报关记录` 正式来源写库。
- 出口源文件中可由 Excel 直接证明的装箱/销售明细，已完成 merge 导入并验证幂等。
- 对销售行缺门店但源文件路径中能唯一匹配现有门店名的行，已补充导入 `56` 条路径门店推断记录；这些行的销售明细 note 带 `[WPS_SOURCE_PATH_STORE]` 标记，便于后续复核。
- 对销售行缺门店但合同聚合中只有一个现有门店可匹配的行，已补充导入 `23` 条销售明细，并更新 `7` 条旧销售明细；这些行的 note 带 `[WPS_CONTRACT_STORE]` 标记。写库前已备份 `backend/prisma/backups/dev_2026-06-02_16-46-40.db`，写库后出口源 merge dry-run 为 `0`。
- 对销售行缺门店但能由同源装箱行“同合同、同商品、同数量”唯一证明门店的行，本轮已修正 `8` 条旧销售明细门店，并给 `5` 条被早期去重折叠的销售明细补充 WPS 来源 note；这些行带 `[WPS_PACKING_QUANTITY_STORE]` 标记。写库前已备份 `backend/prisma/backups/dev_2026-06-02_20-26-39.db`，写库后出口源 merge dry-run 新增/更新为 `0`。
- 对已经被当前裁决包证明为不可靠的路径门店销售行，本轮新增 `scripts/cleanup_wps_ambiguous_sales_store.js` 并清理 `1` 条：`EXP250028 / 铁艺屏风 / 合同:10` 原先由文件路径猜到 `圣荷西625`，但当前装箱候选门店只有 `米尔皮塔`、`圣马特店`、`安纳汉姆`。写库前已备份 `backend/prisma/backups/dev_2026-06-02_20-36-41.db`，清理后脚本 dry-run `deleteCount=0`。
- 本轮进一步全量审计 `[WPS_SOURCE_PATH_STORE]` 销售行：写库前备份 `backend/prisma/backups/dev_2026-06-02_23-03-05.db`，删除 `19` 条由文件名路径猜门店造成的重复污染行。这些行均满足：同合同、同商品、同数量的装箱证据唯一指向另一个门店；库里已存在同源、同商品、同数量、同价格且门店正确的销售行；待删行无库存引用。清理后路径推断销售行从 `59` 条降到 `40` 条，复核脚本显示同数量装箱门店冲突为 `0`。
- 本轮继续把路径门店推断审计接入裁决包：剩余 `40` 条路径推断销售行中，`27` 条已有同数量装箱证据支持，`3` 条已在主销售门店待裁决中，另有 `10` 条缺少同数量装箱证据或存在多个同数量候选，已作为 `sales_path_store_inference_review` P2 项列入裁决包。当前没有自动删除这些行，因为它们没有被文件证据明确反证。
- 本轮继续从 P2 路径门店推断复核中自动收口 `1` 条：`EXP250016 / 玻璃瓶 / 合 同:14` 的销售合同数量为 `5250`，同一 WPS 文件装货页 `装货:7` 写明 `玻璃酒瓶`、数量 `5250`、门店 `圣荷西2115`，且装货 note 为 `提前送达的玻璃瓶`。写库前备份 `backend/prisma/backups/dev_2026-06-02_23-29-03.db`，已将该销售行门店从路径推断的 `圣荷西` 修正为 `圣荷西2115`，并补充 `[WPS_PACKING_QUANTITY_ALIAS_STORE]` 证据标记；同时给 14 条已由同源装货数量支持的销售行补充证据 note。写库后出口源 dry-run 为 `0`，裁决包从 `23` 条降到 `22` 条。
- 本轮继续清理 `EXP250014` 的 4 条旧路径门店重复行：这些行均有同一 WPS source、同合同、同商品、同数量、同售价的非路径推断销售行覆盖，且没有库存引用。写库前备份 `backend/prisma/backups/dev_2026-06-03_00-50-11.db`，删除后清理 dry-run 为 `0`。售价不一致的 3 条 `EXP250014` 路径行未删除，继续留待业务裁决。
- 本轮继续处理 `EXP250014` 的 3 条同源价格错位：保留 `圣荷西2115` 强门店行，把价格改回销售合同/发票页的 `170/370/10`，删除 `圣荷西` 弱路径重复行。写库前备份 `backend/prisma/backups/dev_2026-06-03_01-06-07.db`，删除后清理 dry-run 为 `0`。
- 本轮补强 `EXP2400006` 的 blocked 证据：同合同出货汇总里的 `25312000000011328975` 是 `invoice_no` 列，不是正式 18 位海关编号；发票汇总页存在 `EXP2400005` 模板污染，继续不写报关单。
- 对销售行缺门店但能由“同合同、同商品、同数量”的全量装箱证据唯一证明门店的行，本轮新增 `[WPS_PACKING_QUANTITY_CONSENSUS_STORE]` 推断口径；`EXP2500002 / 瓷砖 / 合同:14` 的 `300` 平方米行被证明归属 `安纳汉姆`，且现库已正确记录，所以本轮只减少裁决项，不写数据库。
- 真实报关单/退税联中可由 PDF/XLSX 直接证明的数据，已写入本地数据库并验证幂等。
- `12-报关单` 独立文件夹中的 `24` 份 PDF 已归档到项目临时目录并纳入真实凭证抽取；其中 `23` 个新报关单头已写入数据库，`EXP250013` 两份同号 PDF 已去重。
- 对退税用途确认发票明细中缺报关单号、但合同在数据库中只有一个现有报关单的凭证，已按唯一报关单补映射；本轮新增 `EXP2500001 / 531620250160484436` 退税草稿 `1` 条，金额保持 `0`、状态 `DRAFT`，仅保留来源 note，不编造可退税额。写库前已备份 `backend/prisma/backups/dev_2026-06-02_17-00-12.db`，写库后真实凭证 dry-run 为 `0`。
- 两个旧 `.xls` 报关底稿现在已可通过前端现有 `xlsx` 依赖读取，不再是技术不可读：`1单.xls` 能看到底稿商品、重量、金额，但缺正式 18 位海关编号且缺唯一 EXP 归属；`2单空运.xls` 已识别合同号 `EXP2400006`、客户 `Sp food trading LLC`、商品/重量/金额，但仍缺正式 18 位海关编号，所以不创建报关单。
- 本轮新增 `scripts/dedupe_wps_packing_duplicates.js`，并在写库前备份 `backend/prisma/backups/dev_2026-06-02_17-40-18.db` 后删除 `29` 条可证明重复的 WPS 装箱旧行；删除条件为无报关明细引用、保留行已覆盖来源证据、字段兼容且保留行来源覆盖更完整。
- 去重后出口源 merge dry-run 仍为 `0` 新增、`0` 更新；装箱 merge 只剩 `5` 条无法唯一匹配的真实歧义，去重脚本二次 dry-run 的 `deleteCount=0`。
- `CG2400013` 的 DOCX 正文已补抽合同头总额 `172370`，并在写库前备份 `backend/prisma/backups/dev_2026-06-02_17-52-53.db` 后创建 DRAFT 采购合同头；未抽到逐项明细，所以没有创建采购明细，note 已标明“未抽到逐项明细，未创建采购明细”。
- `EXP250018 925圣荷西.xlsx` 的文件名与正文合同号不一致已经按正文收口：合同页 `NO.: EXP250019`，装货页每行合同号也是 `EXP250019`；该来源已归入 `EXP250019`，并在写库前备份 `backend/prisma/backups/dev_2026-06-02_18-01-51.db` 后写入 `1` 条装箱、`9` 条销售和 `1` 个合同汇总更新。
- 修复销售 merge 的来源自校正逻辑：当销售行 note 已记录同一 WPS 来源时，允许同一来源修正自身售价；写库前备份 `backend/prisma/backups/dev_2026-06-02_18-05-03.db`，本轮按原文件修正 `40` 条销售售价。
- `EXP2400001` 的一条装箱歧义已收口：两个候选业务字段完全一致、均无报关明细引用且无来源 note；写库前备份 `backend/prisma/backups/dev_2026-06-02_18-11-17.db` 后删除 `1` 条重复装箱行，再备份 `backend/prisma/backups/dev_2026-06-02_18-13-19.db` 并给保留行补充 WPS 来源 note。
- `CG2400008` 已用签章 PDF 图片页复核乙方为 `云浮市锦德石业有限公司`；同目录 XLSX 保留 16 条明细和总额 `215466.14`。写库前备份 `backend/prisma/backups/dev_2026-06-02_18-25-45.db`，实际新增 `1` 份采购合同、`16` 条采购明细、`7` 个商品；没有新增或更新供应商资料。
- 两份原先 blocked 的“发票”PDF 已经按页面标题和右上编号复核为 `COMMERCIAL INVOICE`：`POR2400003` 与 `EXP2400001` 均为商业发票编号，不是正式 20 位税票号；抽取状态已改为 `reference_only`，不再进入退税/税票写库，也不再要求你补税票号。
- `2024年/1201 安纳汉姆 吴物流/一般贸易报关发票 合同 装箱单 出口报关单-1单.xls` 已与正式报关 PDF `222920240004561873` 对照：商品 `密胺餐盘`、件数 `8`、毛重 `147.9`、净重/数量 `145.4`、金额 `894.3` 均一致；已降级为 `reference_only` 的旧底稿副本，不再要求你补报关号或合同归属。
- 已通过 WPS 客户端下载并保留此前仅云端可见的 `11-报关记录/91310000MAD74FYH58-20250604235840-出口退税用途确认发票明细..xlsx`；该表含 `14` 个进项发票号，但没有报关单号或唯一出口合同归属，已作为 `tax_refund_invoice_list_reference_only` 保留，不写退税草稿。
- 已通过 WPS 客户端下载并保留此前仅云端可见的 `11-报关记录/出货汇总.xlsx`；它与根目录 `_wps_cloud_root/出货汇总.xlsx` 不是同一文件，已纳入出口源分析。源行去重后没有新的可写库项，出口源 dry-run 仍为 `0`。
- 采购合同中 DOCX/XLSX 字段齐全的数据，已写入本地数据库并验证幂等。
- `EXP250027` 的 `66` 套窗帘混合门店汇总行已用 `_wps_cloud_root/出货汇总.xlsx` 中 `31+35` 两条拆分源行覆盖：写库前备份 `backend/prisma/backups/dev_2026-06-02_19-43-14.db`，删除无门店汇总装箱行 `1` 条，并补记 `禧瑞都` 35 套行的 WPS 来源；复跑去重 `deleteCount=0`。
- 当前自动导入 dry-run 结果：
- 出口源 merge：待写入 `0`，装箱未匹配歧义 `0`，销售缺门店 `1`
  - 不可靠路径门店清理：待删除 `0`
  - 真实凭证报关/退税：待写入 `0`
  - 采购合同：待写入 `0`
- 路径门店推断复核：清理后 `32` 条；当前没有路径门店推断复核项进入裁决包，清理脚本 dry-run `deleteCount=0`
- 当前数据库关键计数：出口合同 `45`，销售明细 `440`，装箱明细 `445`，采购合同 `192`，采购明细 `278`，报关单 `31`，报关明细 `57`，退税 `5`，商品 `199`，供应商 `93`。
- 当前来源覆盖审计：缺少 WPS/文件来源标记的 DB 记录为 `199`；自动导入/回填 dry-run 均为 `0` 待写入。

本轮继续修正销售源解析和门店证据口径：销售合同页的 `包装/Package` 现在作为规格字段，不再把 `货物名称及规格` 商品名误当规格；销售门店推断只在同源装箱或已入库装箱 note 中能用同合同、同商品、同数量、同规格唯一指向一个门店时补证据。写库前备份 `backend/prisma/backups/dev_2026-06-03_01-34-23.db` 和 `backend/prisma/backups/dev_2026-06-03_01-40-24.db`；已补强 `EXP250013` 两条自助餐台门店证据（`2149*1150*1100 -> 安纳汉姆`，`2654*1160*1100 -> 禧瑞都`），并补强 `EXP250028` 两条铁艺屏风现有销售行的规格数量装箱证据（`2480*1350*1180 -> 米尔皮塔`，`2330*1350*1180 -> 圣马特店`）。

本轮继续收口 `EXP250019 / 瓷砖 / 合 同:18`：冲突根因是 Westminster 的 `501.12` 平方米装箱行误挂了 `2025年9月/EXP250018 925圣荷西.xlsx#装货:11` 来源；该源装货行在文件正文中明确门店为 `Burbank`。写库前备份 `backend/prisma/backups/dev_2026-06-03_01-48-12.db`，已从 Westminster 装箱行移除错挂来源，并新增 `Burbank / 501.12 平方米 / 261 箱 / 11500/11400/6.8 / 800*800*40` 装箱行。写库后出口源 dry-run 再次为 `0` 新增/更新，`sales_store_conflict` 已从裁决包消失，待裁决包从 `7` 条降到 `6` 条。

本轮继续处理组合门店别名漏判：新增 `scripts/cleanup_wps_aggregate_alias_source_owner_items.js`，识别 `圣荷西2115和625` 对 `圣荷西625`、`圣荷西625店和红木城店` 对两个拆分门店的覆盖关系。写库前备份 `backend/prisma/backups/dev_2026-06-04_14-45-16.db`，随后删除 `7` 条无来源、无下游引用、且已由带 WPS 来源组合门店行覆盖的拆分重复行：销售 `1` 条、装箱 `6` 条。写库后来源缺口从 `192` 降到 `185`，候选映射复核从 `32` 降到 `25`；二次 dry-run `deleteCount=0`，出口源 merge dry-run 仍为 `0` 新增/更新/未匹配。

本轮继续扩展组合门店别名清理口径：对于 `multi_candidate`，不再因为存在多个候选就整行跳过，而是要求“唯一兼容组合门店 owner”存在，且其他候选数量/门店不兼容。写库前备份 `backend/prisma/backups/dev_2026-06-04_14-56-23.db`，随后删除 `EXP250027 / 窗帘 / 米尔皮塔 / 31` 和 `EXP250027 / 窗帘 / 圣荷西625 / 31` 两条无来源装箱拆分行，保留带 WPS 来源的 `米尔皮塔、圣荷西625 / 31` 组合门店行。写库后来源缺口从 `185` 降到 `183`，候选映射复核从 `25` 降到 `23`；二次 dry-run `deleteCount=0`，出口源 merge dry-run 仍为 `0` 新增/更新/未匹配。

本轮继续把剩余 `23` 条候选映射复核项做阻断原因分类：新增 `scripts/classify_wps_remaining_candidate_blockers.py`，输出 `wps_remaining_candidate_blockers.{json,csv,md}`。横向扫描未发现“无来源聚合行被多个带来源拆分行完整覆盖”的可写候选；剩余项分布为 `quantity_conflict=14`、`price_conflict=6`、`multi_candidate_quantity_sum_price_conflict=3`。其中 3 条虽然源数量加总等于目标数量，但候选单价不一致，不能自动删除或合并；需要业务确认保留聚合行、删除聚合行或按源价格拆分。

本轮继续把 `source_required_no_candidate=24` 的缺失原因固化成只读关闭清单：新增 `scripts/classify_wps_no_candidate_source_blockers.py`，输出 `wps_no_candidate_source_blockers.{json,csv,md}`。结论是这 24 条仍没有自动写库项：`sales_contract_has_sources_but_no_product_match=10` 需要商品别名证据或销售合同原文页，不能用同合同相似商品补 note；`pending_contract_placeholder=10` 需要正式合同/装箱/报关材料或业务确认继续保留为无来源历史行；`sales_contract_missing_from_standardized_sources=3` 需要重新取得原件或旧线下清单；`packing_contract_has_sources_but_no_product_match=1` 需要装货页/装箱页原文或商品别名证据。完成度审计仍为 `db_source_gaps=183`、`pending_auto_writes=0`、`cloud_only_files=2`。

本轮继续把 `candidate_conflict_review=36` 的操作性来源缺口做阻断原因分类：新增 `scripts/classify_wps_operational_candidate_conflict_blockers.py`，输出 `wps_operational_candidate_conflict_blockers.{json,csv,md}`。结论是这 36 条仍没有自动写库项：`quantity_conflict_same_store=22` 是同合同/同商品/同门店但数量不一致，需要拆分或聚合数量证据；`zero_quantity_candidate_quantity_conflict=6` 是 DB 历史行数量为 0 但 WPS 源有数量，需要确认是否历史占位或补修正证据；`store_conflict_same_product=6` 需要门店归属裁决或组合门店拆分证据；`same_quantity_price_conflict=2` 是数量一致但零价/源价冲突，需要确认零价行保留、改价、删除或合并。无引用不等于可删除授权，本轮不写库、不改价、不改数量、不补 note。

本轮继续把 `formal_evidence_required=18` 的正式报关材料缺口固化成关闭清单：复跑 `scripts/analyze_wps_formal_customs_source_gaps.py` 后，`PENDING-威斯敏` 仍只有 `BGNDING-威斯敏`、`BGNDING-威斯敏-2`、`BGNDING-威斯敏-3` 三张占位单，正式报关候选为 `0`，最近 WPS 装箱源均不能完整覆盖占位明细集合。新增 `scripts/classify_wps_formal_evidence_blockers.py`，输出 `wps_formal_evidence_blockers.{json,csv,md}`，把 18 条拆为 `placeholder_declaration_missing_formal_original=3` 和 `item_inherits_placeholder_without_complete_source_set=15`。这些缺口只能通过正式 18 位海关编号、正式报关单原件和正式报关明细关闭；不能用 `BGNDING-*` 占位号、近似装箱源或采购合同文件替代正式报关材料。

本轮继续把 `operational_keep_or_cleanup_decision=60`、`pending_placeholder_review=14`、`operational_review=8` 的操作性历史行固化成保留/清理关闭清单：新增 `scripts/classify_wps_operational_retention_blockers.py`，输出 `wps_operational_retention_blockers.{json,csv,md}`。结论是这 82 条仍没有自动写库项，且此前严格来源覆盖重复候选为 `0`：`nonzero_quantity_zero_price_no_refs=36` 需要确认零价是否真实、是否应改价、删除或继续保留；`zero_quantity_zero_price_no_refs=24` 需要确认删除、保留为历史占位或补来源；`pending_contract_placeholder=14` 需要正式合同/报关/装箱材料或确认占位合同继续保留；`operational_marker_no_refs=6` 带非捷淞、拼船、自行报关等历史语义，需运营口径裁决；`operational_no_refs_unspecified=2` 需要补来源材料或确认保留/清理口径。无库存/报关引用不是自动删除授权。

本轮新增剩余导入关闭总台账：`scripts/build_wps_remaining_closure_register.py` 汇总五个来源缺口阻断报告、剩余裁决执行方案和 cloud-only 探测报告，输出 `wps_remaining_closure_register.{json,csv,md}`。总台账与完成度审计已对齐：总行数 `187`，其中 DB 来源缺口 `183`、业务/正式材料裁决项 `2`、cloud-only 原件 `2`，自动可写项 `0`。后续验收或继续执行时以该总台账为主；任何写库、删除、改价、改数量、补 note 或复制 cloud-only 原件，都必须先满足台账中的关闭条件，再另起 apply 任务备份并验证。

## 需要你裁决或补材料的事项

| 优先级 | 事项 | 当前证据 | 需要你做的判断 |
|---|---|---|---|
| P1 | 1 条销售行缺门店 | `EXP2500002 / 瓷砖 / 合 同:13` 销售合同 sheet 本身缺门店；同合同同商品装箱来源在不同出货汇总副本中分别指向 `Burbank` 与 `安纳汉姆`，不能自动裁决 | 指定这条销售行归属哪个门店、如何拆分，或确认暂不导入/保留现状 |
| P2 | 2 条零价/非零价同数量价格冲突 | `WPS-IMPORT-108` 复核了 118 条操作性来源缺口，严格带来源重复覆盖候选为 `0`；但发现 `EXP250025 / 瓷砖 / Westminster / 72` 存在零价行与带来源 `15` 单价行并存，`EXP250013 / 自助餐台 / 安纳汉姆 / 3` 存在零价行与带来源 `7450` 单价行并存。两组均同合同/商品/门店/数量，但价格事实不同 | 确认零价行是否应保留为历史运营占位，或补充能证明零价行应删除/改价的文件证据；没有裁决前不自动删除、不自动合并 |
| P2 | `EXP2400006` 旧 `.xls` 空运报关底稿 | `2单空运.xls` 已识别 `EXP2400006`、客户 `Sp food trading LLC`、商品 `密胺餐盘`、件数 `8`、毛重 `125`、净重/数量 `110`、金额 `676.5`，但海关编号为空。已复核同目录云端索引：`EXP2400006` 只有销售合同 PDF/XLSX 和该旧空运底稿；同目录正式报关单/放行单均为 `222920240004561873`，且正文毛净重 `147.9/145.4`、金额 `894.3` 对应 `EXP2400005`。出货汇总里的 `25312000000011328975` 是 `invoice_no` 列，不是正式 18 位海关编号；`EXP2400006.xlsx` 发票汇总页还存在复制自 `EXP2400005` 的模板污染。因此仍缺 `EXP2400006` 的正式 18 位海关编号 | 补充 `EXP2400006` 的正式 18 位海关编号或正式报关单原件；没有正式编号前不创建报关单 |
| P2 | `PENDING-威斯敏` 三张占位报关单 | `BGNDING-威斯敏` 9 项、`BGNDING-威斯敏-2` 3 项、`BGNDING-威斯敏-3` 3 项均为占位报关记录。最近 WPS 源集合是 `EXP260005 / 31-威斯敏`，但主占位单只命中 3 项、缺 6 项、多 3 项；两个 3 项占位单只命中 1 项、缺 2 项、多 5 项。现有真实凭证和附件清单中没有命中 `EXP260005/006/007/威斯敏` 的正式报关单候选 | 补充对应正式报关单或正式海关编号；没有正式材料前继续保留占位，不补来源 note、不替换 HS 编码 |
| P2 | WPS 云盘仍未缓存的顶层副本 | WPS 本机 metadata 只剩 `20250815禧瑞都/购销合同CG2500045-不锈钢桶-禧瑞都.pdf` 这 1 个仅云端可见文件；同合同号在 `2025年8月/20250815禧瑞都` 下已有 DOCX 和归档 PDF，并已抽取入库；WPS 搜索 `CG2500045 不锈钢桶` 和精确文件名都只返回已缓存的 `归档-购销合同CG2500045-不锈钢桶-禧瑞都.pdf`，未返回该 348KB 顶层旧副本；metadata 外另有 `20250728禧瑞都` 旧 filecache 线索，但下载记录显示 `-5 文件不存在` | 若必须保留顶层副本原件，需要在 WPS 中打开该副本；业务数据已由 2025 年 8 月目录合同正文覆盖 |

## 已降级为参考或后续可补强

- `CG2400013`：DOCX 已证明乙方 `佛山市顺德区盈顺澳电器实业有限公司`、日期 `2024-09-28`、总额 `172370`，合同头已作为 DRAFT 入库；若后续要完整采购明细，需要另补带产品、数量、单价、金额的明细页。
- `2024年/0423 集中采购，陶瓷，屏风/归档-发票POR2400003.pdf`：页面标题为 `COMMERCIAL INVOICE`，编号为 `POR2400003`，仅作为商业发票参考件，不写入税票/退税链路。
- `2024年/0530 C店第一柜/4-销项材料/发票.pdf`：页面标题为 `COMMERCIAL INVOICE`，编号为 `EXP2400001`，仅作为商业发票参考件，不写入税票/退税链路。
- `2024年/1201 安纳汉姆 吴物流/一般贸易报关发票 合同 装箱单 出口报关单-1单.xls`：已证明是正式报关单 `222920240004561873 / EXP2400005` 的旧底稿副本，仅作为参考证据保留。
- `91310000MAD74FYH58-20250604235840-出口退税用途确认发票明细..xlsx`：已抽取 `14` 个进项发票号；没有报关单号或唯一出口合同归属，仅作为进项发票勾选清单参考件保留。
- `2024年/0802 C店第二柜/0802出货清单.xlsx`：已作为 `shipment_list` 参考凭证保留并补入 4 条正式报关明细申报要素；`陶瓷/瓷砖` 名称不一致行已由同目录 `出口申报信息.xlsx` 提供一致名称后补入。
- `2024年/0802 C店第二柜/出口申报信息.xlsx`：已作为 `shipment_list` 参考凭证保留并补入 `瓷砖` 1 条正式报关明细申报要素；其 `烤盘` 行因 HS 与库内正式报关明细不一致未直接采用。
- `2024年/0802 C店第二柜/出口退税联.pdf`：正式报关/退税正文已证明 `烤盘` item 3 的 HS 为 `7323930000`，申报要素为 `0|0|餐桌用|不锈钢|未搪瓷|无品牌`；该行已补入正式报关明细。该票 `531620240161954788` 现在 6 条明细均已有申报要素。
- `2024年/0530 C店第一柜/5-出口退税联.pdf`：正式 PDF 正文已补入 11 条完整申报要素；另外 8 条因 PDF 抽取出的申报要素分段不完整，继续留空，不硬写半截字段。

## WPS 云盘仍未缓存的文件

完整清单已生成到 `tmp/wps_11_export_list_raw/parsed/wps_cloud_metadata_summary.md`。当前 `11-报关记录` 只剩 `1` 个云端索引文件没有本机正文：

- `11-报关记录/20250815禧瑞都/购销合同CG2500045-不锈钢桶-禧瑞都.pdf`

其中 `CG2500045` 的业务合同证据已由 `2025年8月/20250815禧瑞都/购销合同CG2500045-不锈钢桶-禧瑞都.docx` 覆盖并入库，乙方为 `潮州市富雅猴不锈钢有限公司`，金额 `3915.15`。云端缺的是另一个顶层旧副本：元数据大小 `348470`、SHA1 `c4bfefb55677fdb20e0a249400681ce73c14aa25`，与已保留归档 PDF 大小 `2458679`、SHA1 `0d7f3333f1c72622d4de903b99ba691bb8a6efaf` 不同。

本轮还补充了 WPS filecache 侧的非 metadata 线索：`tmp/wps_11_export_list_raw/parsed/wps_cloud_metadata_summary.md` 现在列出 `5` 条 metadata 外 filecache 记录和 `4` 条失败下载记录。其中 `20250728禧瑞都/购销合同CG2500045-不锈钢桶-禧瑞都.pdf` 的 filecache 记录大小为 `452772`、SHA1 为 `07238bd61da87ff50b52cff1e03c1af3c97b1de4`，对应下载任务错误为 `-5 文件不存在`。这些记录说明旧路径被 WPS 记录过，但当前无法作为可读正文导入。

此前缺失的 `11-报关记录/出货汇总.xlsx` 已通过 WPS 搜索下载并保留，大小 `39820`、SHA1 `e5044cdf4d9b307a0f427b18bf344539728447d4`；它与根目录版本 `_wps_cloud_root/出货汇总.xlsx` 不同，但重跑出口源 merge 后没有新增或更新写库项。

根目录清单盘点中当前只剩一个未缓存正文：

- `出货汇总.xlsx`：metadata 当前大小 `90013`、SHA1 `d4755f642c13f61a6c9aedec233c31e74f58d0d3`。本机已保留的是旧缓存版本，大小 `67152`、SHA1 `92f422118e855cdcc600dea505eb961fd1689773`，不能冒充当前版本。

## 出货汇总里的乙方核对结论

对本轮导入的 16 份缺失采购合同，已核对项目内全部同名出货汇总来源：

- `tmp/wps_11_export_list_raw/11-报关记录/_wps_cloud_root/出货汇总.xlsx`
- `tmp/wps_11_export_list_raw/11-报关记录/出货汇总.xlsx`
- `出货汇总0315.csv`
- `出货汇总0315_补充.csv`
- `tmp/wps_11_export_list_raw/11-报关记录/出货汇总(1).xlsx`

结论：出货汇总里没有可靠写明这些缺失采购合同的具体乙方。只有 `CG2600013` 在 `出货汇总0315_补充` 第 `337` 行出现，但该行 `供应商名称` 是 `云浮市锦德石业有限公司`，与合同正文乙方 `福建裕豪门业有限公司` 不一致；其余 15 个合同号在这些出货汇总文件中没有出现。`出货汇总(1).xlsx` 的工作表没有 `购销合同号` 列，不能作为乙方判断依据。

## 处理原则

- 文件名不覆盖正文内容。
- 出货汇总里的“厂家/装货厂家”简称不等于采购合同乙方。
- OCR 只作为复核线索；只有图片页能复核到乙方、日期、逐项金额明细和总额时才写库，缺正式发票号时仍不写入发票/退税链路。
- 缺门店的销售行不使用默认门店。
- 旧 `.xls` 可作为底稿证据读取，但没有正式 18 位海关编号时不创建报关单；底稿里的商业发票号、合同号、金额不能替代正式海关编号。
- 真实凭证抽取使用 Codex Python 运行时；系统 Python 缺 `pypdf` 时产生的 `empty_text` 结果不作为裁决依据。
- `PENDING-*` 报关占位单不能用近似装箱源关闭；只有整张占位明细集合完整匹配同一个 WPS 源集合，或拿到正式报关单/海关编号，才允许补来源或转正式记录。
