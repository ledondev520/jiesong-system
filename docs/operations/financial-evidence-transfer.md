# 财务资料跨机器迁移

此工具迁移财务资料库中的指定结构化记录，支持报表留存快照及税费核验记录。不会复制整库、上传原始Excel、修改经营指标、覆盖已有资料，也不会连接SSH或触发部署。迁移不改变税费资料原有的“未确认申报/缴款”状态。

## 前提

- 源机和目标机均有已审查的 `backend/scripts/financial-evidence-transfer.js`、`backend/src/services/financialEvidenceTransferService.js`、现有后端依赖和已迁移的SQLite库。无需新增表结构。
- 在目标机核实后端实际 `DATABASE_URL`，不要使用构建目录下另一份数据库。工具将其与当前Prisma连接的真实路径比对；文件不存在、权限过宽或目标非SQLite时拒绝。
- 导入需要Python3标准库sqlite3。确认阶段自动对实际目标做在线一致性备份并执行 `integrity_check`，支持WAL。备份失败不会执行插入。
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

预检只写本地计划文件，不写数据库。计划逐项列出CREATE或SKIP、类别、期间、Sheet/行数以及完整性标识。

- **完全相同**：SKIP，不改时间戳、行、索引或关联。
- **同标识但任意结构化内容/元数据不同**，或相同来源内容已有不同记录：拒绝整个批次，不提供强制覆盖选项。
- **新资料**：CREATE，目标库生成新ID。已有同月账期只作关联，不会新建或修改账期；累计明细账不关联单月，完整区间保留在标题和来源表头。

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
