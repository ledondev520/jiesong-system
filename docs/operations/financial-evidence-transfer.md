# 财务资料跨机器迁移

此工具迁移财务资料库中的指定结构化记录，支持报表留存快照及税费核验记录。不会复制整库、上传原始Excel、修改经营指标、覆盖已有资料，也不会连接SSH或触发部署。迁移不改变税费资料原有的“未确认申报/缴款”状态。

## 前提

- 源机和目标机均有已审查的 `backend/scripts/financial-evidence-transfer.js`、`financial-evidence-readonly.js`、`financial-evidence-readonly.py`、`financial-sqlite-safety.js`、`backend/src/services/financialEvidenceTransferService.js`、现有后端依赖和已迁移的SQLite库。无需新增表结构。
- 在目标机核实后端实际 `DATABASE_URL`，不要使用构建目录下另一份数据库。工具将其与当前Prisma连接的真实路径比对；文件不存在、权限过宽或目标非SQLite时拒绝。
- 预检和导入需要Python3标准库sqlite3。确认阶段自动对实际目标做在线一致性备份并执行 `integrity_check`，支持WAL。备份失败不会执行插入。
- `.env`、数据库文件及迁移文件须私有；迁移目录、备份目录0700，JSON及备份0600。工具拒绝输入符号链接、多硬链接及覆盖已有输出文件。
- 工具不替代账号权限管理。只由获授权的运维/财务管理员在主机运行；网页读取仍走ADMIN/FINANCE资料库接口。

## 1. 源机导出

在私有目录准备 `selected-ids.json`，内容为明确选中的资料库文档ID数组。不要从数据库全表导出，也不要把用户凭据或工作簿写入清单。

以下均为示例路径，执行前替换；从项目根目录运行：

```bash
umask 077
mkdir -m 700 /private/financial-transfer
node backend/scripts/financial-evidence-transfer.js export \
  --ids-file /private/financial-transfer/selected-ids.json \
  --output /private/financial-transfer/evidence-bundle.json
```

导出为只读事务。包中保留来源标识、原始来源哈希、期间、工作表、物理行号、结构化值和已有脱敏计数，去掉本机数据库ID及关系ID。默认最多100份/20万行/64MiB输入；仅接受版本白名单。不存在的ID或无关资料类型导致整批拒绝。

包与预检计划中的SHA-256用于检测完整性变化，不是来源签名。迁移包仍属于敏感财务资料，包含来源文件名及内部证据；使用可信SSH通道传输并与源机保留的清单核对，不提交Git、不发公共日志、不放普通附件目录。

## 2. 目标机只读预检

代码发布与数据导入独立。先将经审查的工具放到目标版本，再通过已确认的SSH目标传入包，在目标机生成新计划。不得复用本地演练计划，目标路径、主机和数据库文件身份都参与绑定。

```bash
umask 077
mkdir -m 700 /private/financial-transfer/backups
node backend/scripts/financial-evidence-transfer.js preview \
  --bundle /private/financial-transfer/evidence-bundle.json \
  --plan /private/financial-transfer/target-plan.json
```

预检只写本地计划文件，不写数据库。它通过 `financial-evidence-readonly.py` 以SQLite `mode=ro`、`query_only` 和只读authorizer打开实际目标，在同一读取事务内仅查询候选资料及已有账期；不创建Prisma写连接。rollback-journal 模式正常读取前后目录文件清单不变。WAL 模式必须已有私有、普通的 `-wal` 和 `-shm`，缺少任一个就在连接前拒绝（例如最后一个连接关闭后仅剩主库的情况）；先由正常后端连接建立协调文件，再预检，或由操作者停机并通过正常SQLite连接checkpoint/切换rollback模式后预检。不要手工创建空辅助文件。在线读取依赖原有锁和共享内存，能看到未checkpoint的已提交WAL；禁止使用会忽略WAL及锁的 `immutable=1`。这里“只读”指业务行/SQL不写，不承诺文件系统字节不变：SQLite可能更新共享内存协调内容。前置检查与连接间无法原子防止可信操作者移除辅助文件；并发移除可能让SQLite重建它们，因此目录必须由可信操作者管理，预检期间不得移除/替换辅助文件。Python3因此也是预检的前提。计划逐项列出CREATE或SKIP、类别、期间、Sheet/行数以及完整性标识。

- **完全相同**：SKIP，不改时间戳、行、索引或关联。
- **同标识但任意结构化内容/元数据不同**，或相同来源内容已有不同记录：拒绝整个批次，不提供强制覆盖选项。
- **新资料**：CREATE，目标库生成新ID。已有同月账期只作关联，不会新建或修改账期；累计明细账不关联单月，完整区间保留在标题和来源表头。

包内的来源标识和“类别＋内容哈希”都必须唯一，重复即在访问目标前整批拒绝。累计期间沿用留存解析允许的表头位置和日期表达：源范围起点的前三个物理行内任意单元格；不固定为D2，空行仍计入三行范围。

冲突时应先人工核查两端差异。不得通过改包中的标识/哈希绕过冲突；如果确属新的修订资料，应在来源库按正常快照流程新增版本后重新导出。

## 3. 经确认后导入（本次准备阶段不执行线上此步）

```bash
node backend/scripts/financial-evidence-transfer.js import \
  --bundle /private/financial-transfer/evidence-bundle.json \
  --plan /private/financial-transfer/target-plan.json \
  --backup-dir /private/financial-transfer/backups \
  --receipt /private/financial-transfer/import-receipt.json \
  --confirm
```

缺少 `--confirm` 会拒绝。确认命令先重新核对计划，再创建受保护的真实数据库在线备份，随后在事务内再次复核目标现状，仅使用create写入并回读全部新增内容。任何晚期错误都整批回滚。没有新增项时是完整零写入操作，也不重复备份。

目标现状改变导致计划过期时，重新运行preview并使用新的计划文件名；不要盲目重试旧命令。回执含结果、目标绑定、备份位置和新文档ID，属于私有运维资料。异常输出会说明事务已提交但回执失败这一特殊情况，此时先只读核验，避免假定导入失败。

## 4. 验收与回退

1. 核对回执的新增/跳过数量，覆盖数固定为0。
2. 从目标库按新ID再次导出，与原包完整比较；打开网页资料库核对工作表、分页、累计区间和税费状态。
3. 再次preview应全部SKIP。目标原有证据及其他业务表应与导入前基线一致。
4. 保留受保护备份、原包与回执。若需回退，先停止相关写入并制定基于本批新ID的核查方案；不直接用旧备份覆盖仍在产生新业务的线上库。当前工具没有自动删除或覆盖功能。

自动化验证：`node --test backend/src/services/financialEvidenceTransferService.test.js backend/src/integration/financial-evidence-transfer.integration.js`。集成使用独立合成SQLite及真实CLI，覆盖旧记录不变、WAL备份、目标ID映射、重复跳过、同源内容冲突、错误目标、过期计划、备份失败、晚期回滚、包损坏与文件权限。正式上线前仍须在实际VPS重新预检；本地演练不证明线上冲突为零。

## 本地报表仅新增留存

`retain-financial-snapshots.js` 不带 `--confirm` 时只解析文件，不连接数据库；三个财务CLI（含旧 `import-financial-evidence.js`）均在输出执行模式前拒绝不存在或非私有的配置数据库，不会自动建空库。相对 `file:` 路径按 backend/prisma 解析，百分号保持字面含义。

确认留存示例（路径均为占位符；预先创建0700输出目录，目标主库须为0600普通单链接文件）：

```bash
node backend/scripts/retain-financial-snapshots.js /private/input.xlsx \
  --confirm --backup-dir /private/backups --receipt /private/new-receipt.json
```

确认必须显式提供备份目录与尚不存在的回执路径。未知/重复选项及 `--confirm=...` 被拒绝。共享 `financial-sqlite-safety.js` 核对配置真实路径与Prisma的 `PRAGMA database_list`，独占预留0600回执，调用SQLite在线backup API（包括已提交WAL）并执行 `integrity_check`，备份失败不写业务行；备份后重核目标指纹再调用整批事务追加。回执包含文档ID/sourceKey及新增/跳过动作、跳过数、备份路径、目标指纹和完成时间。即使整批重复，retain确认也强制备份；transfer全SKIP仍不备份。备份不包含原工作簿、附件或环境配置。

提交后回执保存失败会单独提示“事务已提交”，须先只读核验。提交前失败可能留下空的预留回执或未完成备份，不能当作成功凭据，也不会覆盖旧文件；人工核验后使用新路径。目标目录及其父路径由可信本地操作者控制，不允许并发替换数据库路径。
