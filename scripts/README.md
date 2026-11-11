# scripts 目录

若本文件夹结构或内容变化，请更新本文件。

## 目的
存放数据导入、修复、提取等脚本。

## 文件清单

| 文件名 | 地位 | 功能 |
|--------|------|------|
| check-pr-format.cjs / check-pr-format.test.cjs | CI 工具与回归 | 完整历史下按 PR base/head 检查改动 TS/TSX 源码；特殊路径、浅历史和失败摘要回归 |
| check-ui-only.cjs / check-ui-only.test.cjs | CI 工具与回归 | 轻量 UI PR：`ui-only` 模式按 §14.1 清单校验完整 diff（重命名新旧路径、删除均计入，空 diff 失败）；`backend-gate` 模式仅在 diff 全为 UI-only 时输出 `backend_changed=false`，其余及任何错误为 true |
| check-review-freshness.cjs / check-review-freshness.test.cjs | 复核时效门禁与离线回归 | 本地合并前和 CI 共用 CLI；PR 文件集合取 B0/H、B1/H 两对所有最佳共同祖先（`merge-base --all`）到 H 的 diff 文件并集；检查可信最新评论、head/base 历史和文件交集，保留重命名/复制双路径及改后撤销记录，含交叉合并回归，信息不足则失败 |
| audit_api_write_success_times.js | 性能审计 | 只对一次性（disposable）后端做写接口成功路径耗时审计；须同时设置 `API_PERF_ALLOW_WRITES`/`API_PERF_DISPOSABLE_DB`/`API_PERF_ISOLATED_FILES=true`、`API_BASE_URL`，以及 `API_PERF_UPLOAD_DIR`（该后端自己的 UPLOAD_DIR，绝对路径且已存在）。该目录真实路径与默认 `backend/uploads`（按脚本位置或调用方 cwd）、`backend/.env` 配置的 UPLOAD_DIR、启动环境 UPLOAD_DIR 相同或互相包含时拒绝运行；残留文件清理只删除该目录真实路径内的普通文件（相对/绝对路径统一做包含检查，拒绝符号链接逃逸，清理前复核根目录身份未被替换；`backend/scripts/perf-upload-cleanup.js`），清理目录不回退 `backend/.env` 或默认目录（`backend/.env` 仅用于拒绝比对）。运行本脚本的 shell 不要设置 `UPLOAD_DIR`（一次性后端在自己的进程环境中设置即可） |
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
| extract_wps_purchase_evidence.py | 数据核对 | 从 WPS 采购合同 DOCX/XLSX/PDF 附件抽取供应商、合同头和采购明细；DOCX 图片 CRC 损坏或异常条目导致 `python-docx` 失败时可退回读取正文 XML；PDF 文本合同可抽表格明细和乙方税号/地址/银行信息；对已人工复核的扫描 PDF 保留路径级 OCR 兜底；同合同号签章 PDF 可回填 XLSX 空乙方但不回填税号/地址/银行；无逐项明细但合同头完整时标记 `header_ready_for_import`；生成缺失采购合同差异报告，不写库 |
| build_supplier_directory.py | 数据核对 | 汇总当前 SQLite 供应商、采购合同证据和本机独有 Word；按合同号/正式名称/唯一税号定位主体，清洗长文本污染候选，输出字段建议、名称差异、来源和 SHA-256 文档去重清单；只写受限 JSON，不回填数据库、不删除外部文件 |
| import_shipment_summary_incremental.js | 数据导入 | 对受限归档的最新 `出货汇总.xlsx` 做严格 SHA-256 校验，只新增 EXP260010/EXP260011、已裁决的 PENDING 异常占位与对应装箱行；不覆盖现有合同/明细，不把人民币采购金额写成 USD 装箱售价；默认 dry-run，`--apply` 单事务写库 |
| run_wps_sync.js | 自动同步执行 | 消费本轮新下载xlsx，串行锁、步骤限时、在线SQLite备份、摘要事务写入和复核；保存受限状态与回执；旧下载/失败保留上次成功时间，浏览器重连与每小时调度由当前Codex任务负责 |
| sync_shipment_summary.js | 数据同步 | WPS 并行期完整下载表的差异同步；调用者确认云端版本，以 SHA-256 和预览摘要锁定输入，备份后指定 `--apply-plan` 写入；出货汇总为装箱资料主准，唯一匹配的厂家、箱规及箱重体积可更新；同商品多批次按数量箱数、必要时毛重净重双向唯一匹配；完全相同的独立批次仅在源库行数相等时逐行保留；已核实历史名称别名在来源与已有装箱行两侧统一，喷涂铝型材可匹配基础名，仍拒绝多候选歧义；门店英文忽略大小写；同数量同规格且唯一的历史行可补空采购号；支持单个前括号、同单位加法及明确“报”数量；同合同商品采购号单位的分店数量精确加总等于括号合计时取本店数，无法抵平或门店重复仍拒绝；板材片数与面积按毫米规格精确换算吻合时拆解双单位，片数为主并保留面积补充信息；无共用箱重金额的剩余货备注明确列出玻璃门和不锈钢门数量时拆解为两行，保留源行号且不猜包装或价格；未报关引用的装箱数量按源纠正，不重算历史金额或触发库存；已有报关引用的数量、无法区分的重复键及归属冲突保留核对；新合同沿用系统默认参考汇率并标注待确认，无日期不标发运；不删除、不改已有财务金额；唯一匹配的空采购成本按源补齐，新行记录源采购成本；发票号码按文本规范化，只补唯一匹配空号，新行保留源号；格式/数值精度异常及已有异号只提示，不改原号；已有金额按系统分位精度比较，仅提示真实差异，不按金额不同的同物理批次猜分配；合同汇总提示附未匹配装箱行 ID 供私有审计；结果目录 0700、文件 0600 |
| resolve_pending_shipments.js | 数据归并 | 同步后按唯一源行和正式装箱核对 PENDING；无引用的零数量占位可补全迁移，等价重复行保留来源后合并；库存需源行与正式装箱双重匹配且无重复；父占位全部关联和金额归零才删除；默认预览，备份后用 `--apply-plan` 摘要写入 |
| verify_tax_refund_invoices.js | 数据核对 | 按出货汇总的发票号码精确查询本地发票记录或税务数字账户导出清单，核验销方、价税合计、品名与状态；只读，输出受限 JSON/CSV，不绕过验证码 |
| import_tax_refund_customs_xml.js | 数据导入 | 解析海关解密 XML，按报关品名、数量、已有 HS 与已有金额唯一命中装箱明细后，幂等关联报关单和出口合同；XML 合同号错位必须用 `--map` 显式传入业务确认映射；默认 dry-run，不创建退税草稿 |
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
```

### Python 脚本
```bash
python scripts/extract_contracts.py

# 真实凭证抽取需要 pypdf/openpyxl；优先使用 Codex Python，避免系统 Python 缺 PDF 依赖导致 empty_text 假 blocked
python scripts/extract_wps_purchase_evidence.py

# 生成供应商名录工作簿的受限来源 JSON；stdout 只输出聚合计数
/Users/helena/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 scripts/build_supplier_directory.py \
  --canonical-root /Users/helena/Documents/捷淞/11-报关记录 \
  --extra-root /Users/helena/Documents/捷淞/11-报关记录 \
  --extra-root /Users/helena/Downloads \
  --output tmp/supplier-directory/supplier-directory-source.json
```

## 更新记录
- 2026-01-26: 修正 fix_export_contracts.js 中的箱数逻辑，新增 fix_boxes_data.js

采购凭据税率解析保留显式 `%/％` 单位（1%→1），仅无百分号的小数按Excel比例换算；PDF和正文提取不得丢失百分号语义。回归：`python3 -m unittest scripts.test_wps_purchase_tax_rate`。

VPS 发布后运行 `node scripts/verify-vps-runtime.cjs https://celerada.link` 核对真实进程与公网构建；其回归检查为 `node --test scripts/verify-vps-runtime.test.cjs`。

## Portable export-packet paths

`prepare_export_packet.py` resolves paths in this order: CLI option, environment variable, repository default.

| Option | Environment variable | Default |
| --- | --- | --- |
| `--database` | `JIESONG_EXPORT_DATABASE` | `backend/prisma/dev.db` relative to repository |
| `--history-root` | `JIESONG_HISTORY_ROOT` | `data/export-history` relative to repository |

Paths support `~`; explicit relative paths resolve against the working directory. The script does not load `.env`.
Put local history workbooks in the selected directory. An absent/empty history directory gives no historical quotes; it does not fabricate evidence. The SQLite database must already exist. Keep business workbooks and databases outside Git. Pricing formulas are unchanged.

`drill_sqlite_restore.py --directory <不存在的临时目录>` 使用已提交迁移和合成商品/期初库存，调用真实备份恢复CLI并保存独立读回回执。它不访问已有库或.env。详见 `docs/operations/sqlite-backup-restore.md`。

## 出口报价规则

报价规则只在后端 `services/exportPricing.js` 的 `priceFor()` 实现，配置为 `config/pricing.json`（新结构见 `config/pricing.schema.json`）。
`prepare_export_packet.py` 的 Python 公式副本已退役，脚本拒绝运行（待负责人确认生产不再使用后删除）；原 `pricing_config.py`、
`pricing_snapshot.cjs`、`verify_pricing_defaults.py` 及其测试已删除。运行时 `pricing.json` 由部署保留，旧结构用
`node backend/scripts/convert-pricing-config.js --file <路径> --spot-rate <现汇>`（默认 dry-run）转换。
