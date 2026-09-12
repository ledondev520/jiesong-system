# scripts 目录

若本文件夹结构或内容变化，请更新本文件。

## 目的
存放数据导入、修复、提取等脚本。

## 文件清单

| 文件名 | 地位 | 功能 |
|--------|------|------|
| fix_export_contracts.js | 数据修复 | 修复出口合同的美元金额 + 创建装箱明细（已修正箱数逻辑） |
| fix_boxes_data.js | 数据修复 | 修复EXP25合同中被错误填充的箱数数据（置空处理） |
| import_contracts_data.js | 数据导入 | 导入采购合同数据 |
| import_declaration_data.js | 数据导入 | 导入报关单数据 |
| import_export_contracts.js | 数据导入 | 导入出口合同数据 |
| import_formal_sales_contract_amounts.js | 数据修复 | 从受限 JSON 导入已核验的正式 EXP 美元合同金额并锁定金额来源，防止装箱明细覆盖；默认 dry-run，`--apply` 写库，日志不输出合同金额 |
| import_prices_from_excel.js | 数据修复 | 从历史发票表补装箱单价和货值；已锁定的正式合同金额保持不变 |
| extract_contracts.py | 数据提取 | Python脚本，提取合同数据 |
| extract_export_contracts.py | 数据提取 | 提取出口合同数据 |
| extract_export_complete.py | 数据提取 | 完整提取出口数据 |
| analyze_wps_export_sources.py | 数据核对 | 解析 WPS 11-报关记录源文件，生成出口合同/装箱/发票汇总与现库差异报告；销售合同页会把 `包装/Package` 抽为规格，以便和装货页规格对齐；根目录保留到 `_wps_cloud_root` 的出货/装货/清单类工作簿也会按表头解析；混合门店汇总行如被更细拆分源行加总覆盖，会优先选用拆分源行；不直接落库 |
| inventory_wps_export_attachments.py | 数据核对 | 盘点 WPS 11-报关记录附件，按报关单、退税联、发票、提单、采购合同等类别归属到 EXP 合同，不解析正文 |
| extract_wps_export_evidence.py | 数据核对 | 从 `11-报关记录` 真实报关单/退税联/发票附件、正式 PDF 明细申报要素、出货清单/出口申报信息参考表、旧 `.xls` 底稿和 `12-报关单` 独立 PDF 抽取正文与关键字段；图片型 PDF 会优先用本机 Tesseract 中文+英文+数字 OCR 并标记复核状态；`COMMERCIAL INVOICE` 只作为 reference-only 商业发票证据，不进入报关/退税写库；已能把可证明被正式报关 PDF 覆盖的旧 `.xls` 底稿降级为 reference-only；openpyxl 读不全的 WPS `.xlsx` 会用前端 `xlsx` 依赖兜底；无报关号/唯一合同归属的进项发票勾选清单只作为 reference-only 保留；出货/申报清单和正式 PDF 只补可安全命中的正式报关明细申报要素；生成数据库映射 dry-run，不写库 |
| inventory_wps_cloud_metadata.py | 数据核对 | 从 WPS 本机 `cache.db` 只读盘点 `11-报关记录` 云端文件索引，并回查 WPS 缓存、团队文档路径和项目源目录，标记文件是已缓存、直接本地可见、源目录已保留还是仅云端可见；summary 会列出通用 `cloud_only_files` 以及采购合同专用缺口；同时记录 metadata 外 filecache 线索和真实失败下载记录；可选把已缓存文件复制到项目临时源目录 |
| import_wps_export_sources.js | 数据导入 | 基于 WPS 解析产物生成幂等导入计划；默认 dry-run，显式 `--apply` 后才写库；报关/退税写入会先审计发票汇总污染；销售行可选用合同聚合门店、同源装箱规格+数量唯一命中门店、已入库装箱 note 的同源规格+数量唯一命中门店、同源装箱数量唯一命中门店、同源装货备注商品别名数量证据、同源同商品残余唯一配对、同合同同商品同数量全证据唯一门店，或源文件路径唯一匹配现有门店；同一销售行已有不同装箱门店标记时不自动改门店；同质多门店销售行只在现库同数量门店行集合与装箱门店集合完全一致时补售价和来源 note，不按行号猜门店；但同合同同商品装箱来源已有多门店且无法由数量/残余配对证据唯一命中时，不再用文件路径猜销售门店；缺失 EXP 合同头可由 `contracts.csv` 证据显式创建；文件名/正文合同号错配但解析器已判定“按工作簿内容归集”的来源会按正文合同号导入；多门店混合名称只有在源行给出已存在的真实港口且不是 `混合港口` 时才自动创建门店；若源组合门店已存在且最高分旧装箱候选都不是该门店，则新增独立源装箱行以保留文件正文；销售合计行只有在同合同/同商品/同规格装箱候选跨至少两个门店且数量精确加总等于源销售数量时，才按装箱数量拆分销售行；若已记录来源的旧装箱行门店与源行门店冲突且无报关引用，会移除错挂来源并按源门店新增或匹配装箱行；装箱歧义只输出最高同分候选 |
| dedupe_wps_packing_duplicates.js | 数据修复 | 基于 WPS 出口源导入计划清理可证明重复的装箱明细和错挂来源 note；只删除无报关明细引用、来源已由保留行覆盖且字段兼容的旧行，或被拆分源行加总覆盖的无门店汇总行；如果同一来源同时挂在字段冲突的多条候选行上，只在唯一候选与源字段兼容且冲突候选无报关引用时移除冲突候选的来源 note；默认 dry-run |
| cleanup_wps_ambiguous_sales_store.js | 数据修复 | 基于当前出口源导入计划和同数量装箱证据清理已被证明不可靠的 WPS 路径门店销售行；支持同源装货备注商品别名数量证据；只删除 `[WPS_SOURCE_PATH_STORE]` 门店不在当前装箱候选门店集合内、与同数量唯一装箱门店冲突且已有正确重复行、同源正确价格已转移到强门店行，或已被同源装箱数量拆分销售行完整覆盖的记录；默认 dry-run |
| cleanup_wps_duplicate_source_owner_sales_items.js | 数据修复 | 基于候选来源占用复核，删除无库存引用、无来源 note、且已被同合同/商品/门店/数量/价格的带 WPS 来源销售行覆盖的重复行；默认 dry-run |
| cleanup_wps_aggregate_source_owner_sales_items.js | 数据修复 | 基于候选来源占用复核，删除无库存引用、无来源 note、且已被带 WPS 来源的聚合门店销售行覆盖的拆分重复行；默认 dry-run |
| cleanup_wps_pending_sales_items_covered_by_formal_sources.js | 数据修复 | 删除已被唯一正式 `EXP*` WPS 销售来源覆盖的零价无引用 `PENDING-*` 销售占位，并可用正式装箱单位补齐正式销售行单位；默认 dry-run |
| cleanup_wps_pending_packing_items_covered_by_formal_sources.js | 数据修复 | 删除已被唯一正式 `EXP*` WPS 装箱来源覆盖的无报关引用 `PENDING-*` 装箱占位，并把占位备注追加到正式装箱行；默认 dry-run |
| import_wps_export_evidence.js | 数据导入 | 基于真实凭证抽取结果幂等写入报关单、报关明细、退税草稿，以及可由正式 PDF 或出货/申报清单安全命中的报关明细申报要素；申报要素必须完整分段并与现有正式报关明细 itemNo/品名/HS 完全匹配，5 段正式字段仅在末段不是明显断句时放行，只补空字段不覆盖；会去重同一报关单重复底单，且只有退税联明细才生成退税草稿；默认 dry-run，显式 `--apply` 后才写库 |
| extract_wps_purchase_evidence.py | 数据核对 | 从 WPS 采购合同 DOCX/XLSX/PDF 附件抽取供应商、合同头和采购明细；DOCX 图片 CRC 损坏或异常条目导致 `python-docx` 失败时可退回读取正文 XML；PDF 文本合同可抽表格明细和乙方税号/地址/银行信息；对已人工复核的扫描 PDF 保留路径级 OCR 兜底；同合同号签章 PDF 可回填 XLSX 空乙方但不回填税号/地址/银行；无逐项明细但合同头完整时标记 `header_ready_for_import`；生成缺失采购合同差异报告，不写库 |
| build_supplier_directory.py | 数据核对 | 汇总当前 SQLite 供应商、采购合同证据和本机独有 Word；按合同号/正式名称/唯一税号定位主体，清洗长文本污染候选，输出字段建议、名称差异、来源和 SHA-256 文档去重清单；只写受限 JSON，不回填数据库、不删除外部文件 |
| import_wps_purchase_evidence.js | 数据导入 | 基于采购合同凭证抽取结果幂等补齐供应商字段、商品、采购合同和采购明细；默认 dry-run，显式 `--apply` 后才写库；显式 `--allow-header-only-contracts` 后可只创建合同头 DRAFT、不创建明细 |
| import_wps_202607_update.js | 数据导入 | WPS 2026-07 增量幂等导入：EXP260008/EXP260009 出口合同全量（明细/装箱/附件）、EXP260004 头修复、CG2600035/CG2600040 采购补建、招行 2026-05/06 流水付款收款登记（按 idempotencyKey 去重）；源文件在 `docs/wps-import/2026-07/`；默认 dry-run，`--apply` 写库；本地与 VPS 各跑一次即两侧一致 |
| import_shipment_summary_incremental.js | 数据导入 | 对受限归档的最新 `出货汇总.xlsx` 做严格 SHA-256 校验，只新增 EXP260010/EXP260011、已裁决的 PENDING 异常占位与对应装箱行；不覆盖现有合同/明细，不把人民币采购金额写成 USD 装箱售价；默认 dry-run，`--apply` 单事务写库 |
| sync_shipment_summary.js | 数据同步 | WPS 并行期完整下载表的差异同步；调用者确认云端版本，以 SHA-256 和预览摘要锁定输入，备份后指定 `--apply-plan` 写入；唯一匹配装箱行与实际发运日期可更新，报关/库存关联冲突保留；新合同沿用系统默认参考汇率并标注待确认，无日期不标发运；不删除、不改已有财务金额；结果目录 0700、文件 0600 |
| verify_tax_refund_invoices.js | 数据核对 | 按出货汇总的发票号码精确查询本地发票记录或税务数字账户导出清单，核验销方、价税合计、品名与状态；只读，输出受限 JSON/CSV，不绕过验证码 |
| import_tax_refund_customs_xml.js | 数据导入 | 解析海关解密 XML，按报关品名、数量、已有 HS 与已有金额唯一命中装箱明细后，幂等关联报关单和出口合同；XML 合同号错位必须用 `--map` 显式传入业务确认映射；默认 dry-run，不创建退税草稿 |
| build_wps_import_decision_packet.py | 数据核对 | 聚合 WPS 导入剩余待业务裁决事项，补充旧装箱候选、销售源行、同商品装箱候选、现库销售摘要、销售门店冲突、路径门店推断复核项，以及真实凭证缺口的同目录云端索引/正式编号对照，输出 CSV/JSON/Markdown 裁决包，不写库 |
| build_wps_remaining_decision_dossier.py | 数据核对 | 把 WPS 剩余 2 个裁决项结构化为源文件、现库、库存/报关引用、反证和可选动作证据包，输出 JSON/CSV/Markdown，不写库 |
| build_wps_remaining_decision_execution_plan.py | 数据核对 | 为 WPS 剩余 2 个裁决项生成只读执行方案，列出收到业务裁决或正式材料后可能操作的目标行、必要输入和安全检查；不写库 |
| audit_wps_import_completion.py | 数据核对 | 汇总出口源、真实凭证、采购凭证导入 dry-run、WPS 主目录与根目录清单云端正文覆盖、数据库来源覆盖和裁决包，生成当前 WPS 导入完成度审计报告；不写库 |
| probe_wps_cloud_only_files.py | 数据核对 | 只针对当前完成度审计中的 cloud-only 原件目标，反查本机候选、Downloads 和 WPS cache.db，只有 SHA1 精确匹配才标记可复制；不写库不复制 |
| probe_wps_cloud_only_broad_local_search.py | 数据核对 | 只读广域搜索当前 cloud-only 原件目标，按文件名、目标大小和 SHA1 扫描常见本机目录、WPS 缓存目录和临时目录；不写库不复制 |
| probe_wps_cloud_only_deep_state.py | 数据核对 | 深度只读探测当前 cloud-only 原件是否进入 WPS 本机 sync/transfer/precloud/datacache/cachedata/logs；不输出 RPC 正文，不写库不复制 |
| probe_wps_cloud_only_download_handles.py | 数据核对 | 只读抽取 cloud-only 原件在 WPS 本机 metadata/cache/transfer 中的 fileId、groupId、taskId 和下载手柄状态；不联网、不输出 token、不写库 |
| probe_wps_cloud_only_log_api_clues.py | 数据核对 | 只读扫描 WPS cloud-only 目标相关日志，脱敏输出 URL host/path、接口词和错误码线索；不联网、不输出 token/cookie、不写库 |
| close_wps_cloud_only_files.py | 数据导入 | 仅当 cloud-only 目标已有 SHA1 精确本机候选时，复制到项目 WPS 源目录；默认 dry-run，不写库；目标已有不同版本时需 `--replace-existing` 并保留 `.superseded-*` 备份 |
| audit_wps_db_source_coverage.js | 数据核对 | 只读统计已入库出口/采购/报关/退税记录的 WPS 文件来源 note 覆盖情况，输出来源缺口样本；不写库 |
| classify_wps_source_gaps.js | 数据核对 | 只读分类剩余 WPS 来源 note 缺口，按销售、装箱、采购、报关占位和业务裁决分桶，输出后续处理依据；不写库 |
| build_wps_source_gap_detail_packet.js | 数据核对 | 只读生成剩余 WPS 来源 note 缺口逐条明细包，列出 DB 行、匹配失败阶段、候选来源和后续动作；不写库 |
| classify_wps_source_gap_disposition.py | 数据核对 | 只读把剩余 WPS 来源 note 缺口分层为操作性复核、候选映射复核、采购凭证补强、正式报关材料补强等处置队列；不写库 |
| build_wps_remaining_source_gap_execution_plan.py | 数据核对 | 汇总剩余 199 条来源缺口，逐条列出后续执行前置条件、禁止动作和下一步证据；只读，不写库 |
| build_wps_remaining_action_matrix.py | 数据核对 | 把剩余关闭总台账翻译成行动线、责任输入、所需材料和收到材料后的复跑脚本，输出 JSON/CSV/Markdown；只读，不写库 |
| analyze_wps_candidate_source_mappings.py | 数据核对 | 只读深挖候选来源映射缺口，并排比较 DB 行、候选 WPS 源行、候选源是否已挂到其他 DB note；不写库 |
| analyze_wps_candidate_source_ownership.py | 数据核对 | 只读复核候选 WPS 来源当前占用行的库存/报关引用和聚合行占用情况，识别是否存在后续人工拆分/转移候选；不写库 |
| analyze_wps_operational_source_gaps.py | 数据核对 | 只读复核零值/操作性历史来源缺口，检查库存/报关引用、候选来源数量和占位/操作标记；不写库不删除 |
| analyze_wps_formal_customs_source_gaps.py | 数据核对 | 只读复核正式报关来源缺口，逐单比对占位报关明细、WPS 装箱源集合和正式报关凭证候选；不写库 |
| audit_wps_export_file_retention.js | 数据核对 | 只读审计 WPS 出货/报关源文件在项目源目录和 `SalesContractFile` 附件表的留存覆盖，按正式 `EXP*` 出口合同统计文件归属；不写库 |
| classify_wps_operational_candidate_conflict_blockers.py | 数据核对 | 只读分类操作性 candidate_conflict_review 来源缺口，区分数量冲突、0 数量冲突、门店冲突和价格冲突；不写库 |
| classify_wps_no_candidate_source_blockers.py | 数据核对 | 只读分类 no-candidate 来源缺口，区分 PENDING 占位、同合同有源但商品不匹配、标准化源缺同合同等阻断原因；不写库 |
| classify_wps_formal_evidence_blockers.py | 数据核对 | 只读生成正式报关材料缺口关闭清单，区分占位报关单缺正式原件和明细继承父占位单缺口；不写库 |
| classify_wps_operational_retention_blockers.py | 数据核对 | 只读生成操作性历史行保留/清理关闭清单，区分零价、零数量、PENDING 和操作标记行；不写库 |
| classify_wps_pending_formalization_blockers.py | 数据核对 | 只读分类 PENDING 销售、装箱、报关正式化阻断原因，区分正式 owner 缺失、0 数量、报关引用和正式报关原件缺失；不写库 |
| build_wps_remaining_closure_register.py | 数据核对 | 只读汇总所有剩余 DB 来源缺口、业务/正式材料裁决项和 cloud-only 原件，生成关闭总台账；不写库 |
| build_wps_missing_evidence_intake_package.py | 数据核对 | 汇总行动矩阵、cloud-only 探测和正式报关阻断报告，生成缺失材料收件校验包，列出验收标准、严格字段、校验命令和禁止动作；不写库 |
| scan_wps_missing_evidence_inbox.py | 数据核对 | 只读扫描项目收件目录和 Downloads，按收件包识别 SHA1 精确 cloud-only 原件，并对正式报关候选做路径/内容命中、重叠目录去重和强候选/参考汇总/弱关键词分层；不写库不复制 |
| import_wps_export_files.js | 数据导入 | 基于 WPS 附件盘点，把可归属到正式 `EXP*` 的出货/报关源文件确定性复制到 `backend/uploads/sales-contracts` 并创建 `SalesContractFile` 记录；默认 dry-run |
| audit_wps_purchase_file_retention.js | 数据核对 | 只读审计 WPS 首选采购凭证、系统合同附件表和上传目录物理文件的留存覆盖关系；不写库 |
| import_wps_purchase_files.js | 数据导入 | 基于附件留存审计结果，确定性复制 WPS 首选采购凭证并创建采购合同附件记录；默认 dry-run，显式 `--apply` 后才写库/复制 |
| recover_wps_purchase_orphan_files.js | 数据修复 | 基于附件留存审计结果，为上传目录中可从文件名推断到现有采购合同的物理孤儿文件恢复 `ContractFile` 记录；默认 dry-run，不复制/删除文件 |
| backfill_wps_contract_source_notes.js | 数据修复 | 基于已解析源文件和采购凭证导入计划，只给出口/采购合同头回填 WPS 文件来源 note；不改业务字段，默认 dry-run |
| backfill_wps_purchase_item_source_notes.js | 数据修复 | 基于采购凭证明细和现库采购明细，只在合同号、商品、数量、单价/总额唯一匹配时回填采购明细来源 note；不改业务字段，默认 dry-run |
| backfill_wps_purchase_item_strict_alias_source_notes.js | 数据修复 | 基于采购凭证明细和首选凭证，只在同合同、金额、单价、数量和商品别名强对齐时补采购明细来源 note；可修复 `quantity=0/unit=源数量` 的历史数量/单位错位；默认 dry-run |
| repair_wps_cg2500013_purchase_contract.js | 数据修复 | 基于 `CG2500013` PDF 正文和已上传附件 SHA1 校验，修正该合同从误重复屏风合同到原文釉面砖合同；默认 dry-run，只处理该合同 |
| backfill_wps_packing_item_source_notes.js | 数据修复 | 基于 WPS 装箱源行和现库装箱明细，只在合同号、商品、门店、数量和可用装箱字段唯一匹配时回填装箱明细来源 note；不改业务字段，默认 dry-run |
| backfill_wps_packing_item_all_source_notes.js | 数据修复 | 基于全量 WPS 装箱源和 no-candidate 来源缺口，只在同合同/商品/门店/数量/单位唯一且装箱锚点一致时回填来源 note；不改业务字段，默认 dry-run |
| backfill_wps_sales_item_strict_alias_source_notes.js | 数据修复 | 基于首选 WPS 销售源和 no-candidate 来源缺口，只在同合同/数量/单价强一致、商品别名唯一且源行未被消费时回填来源 note；不改业务字段，默认 dry-run |
| backfill_wps_sales_from_shipment_summary_notes.js | 数据修复 | 基于 `出货汇总` 给销售明细补来源 note；只在同合同、同商品、同门店、同售价，且数量单行精确命中或同价多行精确加总时回填；不改业务字段，默认 dry-run |
| backfill_wps_customs_placeholder_source_notes.js | 数据修复 | 基于 WPS 装箱源行和现库占位报关明细，只在整张占位报关单明细集合与同一 WPS 装箱源集合完全匹配时回填占位来源 note；不改业务字段，默认 dry-run |
| backfill_wps_purchase_mismatch_source_notes.js | 数据修复 | 基于 WPS 采购 PDF 文件名合同号和同目录 DOCX 正文合同号冲突，只在供应商/日期/金额可对齐时回填 mismatch 来源 note；不改业务字段，默认 dry-run |
| merge_export_data.py | 数据合并 | 合并出口数据 |
| debug_contract.py | 调试工具 | 调试合同数据 |

## 使用说明

### 出口退税发票核验

```bash
# 默认核验 EXP260004-EXP260009、报关公司=捷淞、是否报出口退税为空的行
npm --prefix backend run invoice:verify -- --source ~/Downloads/出货汇总.xlsx

# 7 月发票尚未导入数据库时，可直接叠加税务数字账户导出的进项发票清单，无需先写库
npm --prefix backend run invoice:verify -- \
  --source ~/Downloads/出货汇总.xlsx \
  --invoice-file ~/Downloads/2026年7账期_进项发票列表.xlsx
```

核验报告默认写入 `tmp/tax-refund-invoice-verification/`，目录权限为 `0700`、文件权限为 `0600`。命令只在控制台显示数量摘要和报告路径，不打印供应商税号或逐票金额。

### 解密报关 XML 关联

```bash
# 默认 dry-run；合同号错位必须逐票显式映射
node scripts/import_tax_refund_customs_xml.js \
  --source-dir "$HOME/Downloads/解密报关单" \
  --contracts EXP260004-EXP260009 \
  --map 530420260000000000=EXP260009

# 核对受限 import_plan.json 后，先备份数据库再写入
npm --prefix backend run db:backup
node scripts/import_tax_refund_customs_xml.js \
  --source-dir "$HOME/Downloads/解密报关单" \
  --contracts EXP260004-EXP260009 \
  --map 530420260000000000=EXP260009 \
  --apply
```

计划文件默认写入 `tmp/tax-refund-customs-xml-import/`，目录权限为 `0700`、文件权限为 `0600`。XML 合同号与目标合同号一致也仍会逐项校验；不会仅凭文件名或行序关联。

### JavaScript 脚本
```bash
# 在 backend 目录下执行（需要 Prisma 环境）
node ../scripts/fix_export_contracts.js
node ../scripts/fix_boxes_data.js

# 在仓库根目录执行；默认 dry-run，只生成 import_plan.json
node scripts/import_wps_export_sources.js

# 低风险主数据补齐（商品/门店/商品空字段）
node scripts/import_wps_export_sources.js --apply

# 装箱与销售明细 merge 导入：保留旧行，只补字段并新增缺失行
node scripts/import_wps_export_sources.js --apply --merge-packing --merge-sales --update-contract-aggregates

# 对仍缺门店的销售行，可用源文件路径中的唯一现有门店名继续收口；写库前先 dry-run 核对 salesStorePathInferences
node scripts/import_wps_export_sources.js --merge-packing --merge-sales --update-contract-aggregates --infer-sales-store-from-source-path
node scripts/import_wps_export_sources.js --apply --merge-packing --merge-sales --update-contract-aggregates --infer-sales-store-from-source-path

# 对源文件存在但数据库缺失的 EXP，可显式按 contracts.csv 创建合同头并同轮合并装箱/销售明细
node scripts/import_wps_export_sources.js --merge-packing --merge-sales --update-contract-aggregates --infer-sales-store-from-source-path --create-missing-contracts
node scripts/import_wps_export_sources.js --apply --merge-packing --merge-sales --update-contract-aggregates --infer-sales-store-from-source-path --create-missing-contracts

# 装箱重复行清理：写库前先运行 backend 的 db:backup，并确认 dry-run 的 deleteCount 与 skipped
node scripts/dedupe_wps_packing_duplicates.js
node scripts/dedupe_wps_packing_duplicates.js --apply

# 清理不可靠销售门店路径推断：可删除被更强证据覆盖的旧路径行；若弱路径行价格等于源文件、强门店行同源同数量但价格错位，可先把强门店行价格校正到源文件再删除弱路径行。写库前先运行 backend 的 db:backup，并确认 update/delete 明细
node scripts/cleanup_wps_ambiguous_sales_store.js
node scripts/cleanup_wps_ambiguous_sales_store.js --apply

# 清理候选来源占用里的精确重复销售行：写库前先运行 backend 的 db:backup
node scripts/cleanup_wps_duplicate_source_owner_sales_items.js
node scripts/cleanup_wps_duplicate_source_owner_sales_items.js --apply

# 清理候选来源占用里的聚合门店覆盖拆分销售行：写库前先运行 backend 的 db:backup
node scripts/cleanup_wps_aggregate_source_owner_sales_items.js
node scripts/cleanup_wps_aggregate_source_owner_sales_items.js --apply

# 清理组合门店别名聚合来源已覆盖的拆分销售/装箱行：写库前先运行 backend 的 db:backup
node scripts/cleanup_wps_aggregate_alias_source_owner_items.js
node scripts/cleanup_wps_aggregate_alias_source_owner_items.js --apply

# 清理已被唯一正式 EXP 来源覆盖的 PENDING 销售占位：写库前先运行 backend 的 db:backup
node scripts/cleanup_wps_pending_sales_items_covered_by_formal_sources.js
node scripts/cleanup_wps_pending_sales_items_covered_by_formal_sources.js --apply

# 清理已被唯一正式 EXP 来源覆盖的 PENDING 装箱占位：写库前先运行 backend 的 db:backup
node scripts/cleanup_wps_pending_packing_items_covered_by_formal_sources.js
node scripts/cleanup_wps_pending_packing_items_covered_by_formal_sources.js --apply

# 报关/退税 dry-run 审计：污染的发票汇总会被标记 blocked，不会直接落库
node scripts/import_wps_export_sources.js --merge-customs --merge-tax-refunds

# 真实凭证报关/退税导入：默认 dry-run，写库前先运行 backend 的 db:backup
node scripts/import_wps_export_evidence.js
node scripts/import_wps_export_evidence.js --apply

# 真实采购合同导入：默认 dry-run，写库前先运行 backend 的 db:backup
node scripts/import_wps_purchase_evidence.js
node scripts/import_wps_purchase_evidence.js --apply

# 仅合同头导入：只用于合同号、乙方、日期、总额齐全但无逐项明细的合同；写库前先运行 backend 的 db:backup
node scripts/import_wps_purchase_evidence.js --allow-header-only-contracts
node scripts/import_wps_purchase_evidence.js --allow-header-only-contracts --apply

# 已入库 WPS 来源覆盖审计：只读，不写库
node scripts/audit_wps_db_source_coverage.js

# 剩余来源缺口分类：只读，不写库
node scripts/classify_wps_source_gaps.js

# 剩余来源缺口逐条明细包：只读，不写库
node scripts/build_wps_source_gap_detail_packet.js
python scripts/classify_wps_source_gap_disposition.py
python scripts/build_wps_remaining_source_gap_execution_plan.py
python scripts/classify_wps_operational_candidate_conflict_blockers.py
python scripts/classify_wps_no_candidate_source_blockers.py
python scripts/classify_wps_formal_evidence_blockers.py
python scripts/classify_wps_operational_retention_blockers.py
python scripts/classify_wps_pending_formalization_blockers.py
python scripts/build_wps_remaining_closure_register.py

# WPS 采购合同附件留存审计：只读，不写库
node scripts/audit_wps_purchase_file_retention.js

# WPS 出货源文件留存审计：只读，不写库
node scripts/audit_wps_export_file_retention.js

# WPS 出货源文件附件导入：复制文件并创建 SalesContractFile 前先运行 backend 的 db:backup
node scripts/import_wps_export_files.js
node scripts/import_wps_export_files.js --apply

# WPS cloud-only 原件关闭：仅在 probe 已发现 SHA1 精确候选时复制项目源文件；如目标已有旧版本，先 dry-run 再显式 replace
python scripts/close_wps_cloud_only_files.py
python scripts/close_wps_cloud_only_files.py --apply --replace-existing

# WPS 采购合同附件导入：复制文件并创建 ContractFile 前先运行 backend 的 db:backup
node scripts/import_wps_purchase_files.js
node scripts/import_wps_purchase_files.js --apply

# WPS 采购合同物理孤儿附件恢复：只创建 ContractFile，写库前先运行 backend 的 db:backup
node scripts/recover_wps_purchase_orphan_files.js
node scripts/recover_wps_purchase_orphan_files.js --apply

# 合同头来源 note 回填：只补来源标记，不改业务字段；写库前先运行 backend 的 db:backup
node scripts/backfill_wps_contract_source_notes.js
node scripts/backfill_wps_contract_source_notes.js --apply

# 采购明细来源 note 回填：只补唯一匹配来源标记，不改业务字段；写库前先运行 backend 的 db:backup
node scripts/backfill_wps_purchase_item_source_notes.js
node scripts/backfill_wps_purchase_item_source_notes.js --apply

# 采购明细严格别名来源 note 回填：只在同合同、金额、单价、数量和商品别名强对齐时补来源；数量/单位错位修正前先运行 backend 的 db:backup
node scripts/backfill_wps_purchase_item_strict_alias_source_notes.js
node scripts/backfill_wps_purchase_item_strict_alias_source_notes.js --apply

# CG2500013 采购错挂修复：只在 PDF 正文、上传附件 SHA1、无付款/库存引用均通过时修正；写库前先运行 backend 的 db:backup
node scripts/repair_wps_cg2500013_purchase_contract.js
node scripts/repair_wps_cg2500013_purchase_contract.js --apply

# 装箱明细来源 note 回填：只补唯一匹配来源标记，不改业务字段；写库前先运行 backend 的 db:backup
node scripts/backfill_wps_packing_item_source_notes.js
node scripts/backfill_wps_packing_item_source_notes.js --apply

# 全量装箱源漏匹配来源 note 回填：只处理 no-candidate 队列里的强匹配装箱行；写库前先运行 backend 的 db:backup
node scripts/backfill_wps_packing_item_all_source_notes.js
node scripts/backfill_wps_packing_item_all_source_notes.js --apply

# 销售明细别名来源 note 回填：只处理 no-candidate 队列里的强匹配销售行；写库前先运行 backend 的 db:backup
node scripts/backfill_wps_sales_item_strict_alias_source_notes.js
node scripts/backfill_wps_sales_item_strict_alias_source_notes.js --apply

# 出货汇总销售来源 note 回填：只处理同合同、商品、门店、售价和数量覆盖强一致的销售行；写库前先运行 backend 的 db:backup
node scripts/backfill_wps_sales_from_shipment_summary_notes.js
node scripts/backfill_wps_sales_from_shipment_summary_notes.js --apply

# 占位报关单来源 note 回填：只说明占位单来自哪份 WPS 装箱源，不代表正式海关编号；写库前先运行 backend 的 db:backup
node scripts/backfill_wps_customs_placeholder_source_notes.js
node scripts/backfill_wps_customs_placeholder_source_notes.js --apply

# 采购合同号口径冲突来源 note 回填：只说明文件名合同号与正文合同号不一致，不改业务字段；写库前先运行 backend 的 db:backup
node scripts/backfill_wps_purchase_mismatch_source_notes.js
node scripts/backfill_wps_purchase_mismatch_source_notes.js --apply

# 操作性缺口重复覆盖复核：只读，不写库、不删除
node scripts/analyze_wps_operational_duplicate_coverage.js
```

### Python 脚本
```bash
python scripts/extract_contracts.py
python scripts/analyze_wps_export_sources.py
python scripts/inventory_wps_export_attachments.py

# 只读盘点 WPS 云端索引；需要同步已缓存文件时加 --copy-cached
python scripts/inventory_wps_cloud_metadata.py
python scripts/inventory_wps_cloud_metadata.py --prefix '11-报关记录/2026年4月/%' --prefix '11-报关记录/2026年5月/%' --copy-cached
python scripts/inventory_wps_cloud_metadata.py --parsed-dir tmp/wps_11_export_list_raw/parsed/root_shipment_cloud --prefix '出货汇总.xlsx' --prefix '装货清单.xlsx' --prefix '919清单.xlsx' --prefix '0429装货清单-叶总.xlsx' --prefix '0718装货单.xlsx' --copy-cached

# 真实凭证抽取需要 pypdf/openpyxl；优先使用 Codex Python，避免系统 Python 缺 PDF 依赖导致 empty_text 假 blocked
/Users/helena/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/extract_wps_export_evidence.py
python scripts/extract_wps_purchase_evidence.py

# 生成供应商名录工作簿的受限来源 JSON；stdout 只输出聚合计数
/Users/helena/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/build_supplier_directory.py \
  --canonical-root /Users/helena/Documents/捷淞/11-报关记录 \
  --extra-root /Users/helena/Documents/捷淞/11-报关记录 \
  --extra-root /Users/helena/Downloads \
  --output tmp/supplier-directory/supplier-directory-source.json

# 汇总当前无法自动判断的业务裁决事项
python scripts/build_wps_import_decision_packet.py

# 把剩余裁决事项拆成结构化证据包，便于人工裁决；报告会列出现库销售库存引用和装箱报关引用
python scripts/build_wps_remaining_decision_dossier.py

# 为剩余裁决事项生成只读执行方案；不写库
python scripts/build_wps_remaining_decision_execution_plan.py

# 汇总当前自动导入完成度、剩余裁决项和主目录/根目录云端原件缺口
python scripts/audit_wps_import_completion.py

# 窄范围探测当前 cloud-only 原件是否已有 SHA1 精确本机文件
python scripts/probe_wps_cloud_only_files.py

# 广域本机搜索当前 cloud-only 原件；只读，不写库不复制
python scripts/probe_wps_cloud_only_broad_local_search.py

# 深度探测 cloud-only 原件是否进入 WPS 本机同步/传输/隐藏缓存；只读，不输出 RPC 正文
python scripts/probe_wps_cloud_only_deep_state.py

# 下载手柄探测：只读列出 fileId/groupId/taskId/transfer 是否足够直接下载，不联网、不输出 token
python scripts/probe_wps_cloud_only_download_handles.py

# 日志接口线索探测：只读、脱敏，不输出 token/cookie，不联网
python scripts/probe_wps_cloud_only_log_api_clues.py

# 剩余来源 note 缺口处置分层：只读，不写库
python scripts/classify_wps_source_gap_disposition.py

# 剩余来源缺口执行队列：只读，不写库
python scripts/build_wps_remaining_source_gap_execution_plan.py

# 剩余导入行动矩阵：把关闭台账翻译成补证据/裁决/复跑脚本清单，只读不写库
python scripts/build_wps_remaining_action_matrix.py

# 候选来源映射深度复核：只读，不写库
python scripts/analyze_wps_candidate_source_mappings.py

# 候选来源占用复核：只读，不写库
python scripts/analyze_wps_candidate_source_ownership.py

# 剩余候选映射阻断原因分类：只读，不写库
python scripts/classify_wps_remaining_candidate_blockers.py

# 零值/操作性历史来源缺口复核：只读，不写库、不删除
python scripts/analyze_wps_operational_source_gaps.py

# 正式报关来源缺口复核：只读，不写库
python scripts/analyze_wps_formal_customs_source_gaps.py
```

## 更新记录
- 2026-01-26: 修正 fix_export_contracts.js 中的箱数逻辑，新增 fix_boxes_data.js
