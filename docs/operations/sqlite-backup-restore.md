# 备份与恢复 SQLite

`backend/scripts/db-backup.js` 和 `db-restore.js` 使用 Python 3 标准库的 SQLite backup API 与完整性校验，不需要 sqlite3 CLI 或新 npm 依赖。备份包含已提交 WAL 页面，不是复制正在使用的单个 `.db` 文件。

## 备份

明确选择数据库。脚本只读取当前进程的 `DATABASE_URL`，不会读取 `.env`，也不会回退到猜测的 `dev.db`。配置缺失、不是 SQLite、源文件不存在或完整性检查失败时返回非零状态，迁移命令随之停止。

```bash
cd backend
npm run db:backup -- --database /absolute/private/application.db
# 或在进程环境中已导出 DATABASE_URL 后：
npm run db:backup
```

`file:./dev.db` 的相对路径按 Prisma 规则相对于 `backend/prisma/` 解析。显式 `--database` 相对于当前工作目录解析，建议使用绝对路径。首次空库请先用 `prisma migrate deploy` 初始化；已有库改 schema 的 `db:migrate` 仍先运行备份。

默认输出目录 `backend/prisma/backups/`。用 `--backup-dir /absolute/private/backups` 可改位置。新目录自动设为 0700；已有目录权限过宽或叶目录为符号链接会被拒绝，不擅自 chmod 任意既有目录。数据库快照与 `.manifest.json` 都是 0600。若原备份目录权限不正确，操作者核对目标后手动修正。

成功输出一行 JSON，含快照路径、manifest 路径、字节数、SHA-256 和 `integrity: ok`。只有完成在线快照与完整性校验后才发布文件。默认保留最近 5 对本脚本命名的快照及 manifest，`--keep` 可调整。其他文件、旧版 `dev_*.db` 和没有 manifest 的孤立文件不自动删除，需人工核对归档。

校验和用于发现损坏，不提供对恶意篡改的签名保证。完整性检查不代表业务余额已经对账。

## 恢复到新路径并检查

1. 选择快照及同目录的 `.manifest.json`，两者都需 0600。
2. 使用不存在的数据库路径，父目录必须私有。脚本拒绝覆盖既有文件，包括符号链接。

```bash
cd backend
npm run db:restore -- --backup /absolute/private/backups/snapshot_NAME.db --database /absolute/private/recovery/restored.db
```

3. 成功输出 `integrity: ok`，恢复文件与快照 SHA-256 一致。随后在隔离环境核对关键行、数量、外键与应用只读查询，再决定是否切换。
4. 如要实际切换应用，先停应用和所有写入进程，保留旧库及其 WAL/SHM 作为整体回退材料。把 `DATABASE_URL` 显式指向已验证的新绝对路径，再按当前迁移状态启动。不要直接覆盖在线库，不要把旧 WAL/SHM 套到恢复文件上。本轮演练没有执行生产切换。

数据库快照不包含 `UPLOAD_DIR` 中的合同原件与生成文件，也不包含私有配置、密钥或外部服务状态。完整业务灾备还需附件与数据库的一致时间点、独立受保护介质和恢复权限管理。这些不在本轮范围。

## 重跑合成演练

从仓库根目录运行，`--directory` 必须不存在：

```bash
python3 scripts/drill_sqlite_restore.py --directory /tmp/jiesong-restore-new-run
python3 -m unittest discover -s tests -p test_sqlite_snapshot.py
```

演练从已提交迁移创建全新应用 SQLite 库，插入一个合成商品与 12.5 件期初库存。保持 WAL 连接打开时通过实际 Node 备份入口生成快照。随后将源库存改为 99，经实际 Node 恢复入口恢复到另一目录，独立 SQL 读回必须仍为 12.5。断言源库仍为 99、完整性为 ok、外键无异常、用户表为空及文件权限正确。

产物为源测试库、快照、manifest、恢复库与 `receipt.json`。演练不读取 `.env` 或已有业务数据，不运行 seed，不创建或显示凭据。测试还覆盖重复目标、损坏快照、缺失源库、权限、保留数量及相对 DATABASE_URL。

## 2026-10-17 实际演练

本地目录 `/tmp/jiesong-fix-evidence/restore-drill/`。命令：

```bash
python3 scripts/drill_sqlite_restore.py --directory /tmp/jiesong-fix-evidence/restore-drill
```

结果 PASS。恢复得到 `opening:SYN-DRILL` 对应 `synthetic-product` 的 12.5 件 INBOUND，源库保留 99。快照与恢复库各 1,085,440 字节，SHA-256 均为 `e1d935ab841184250d9cd14645168ded45e28535879168e008883a6f38260a2e`。`PRAGMA integrity_check` 为 `ok`，`foreign_key_check` 返回空，文件 0600、恢复目录 0700。机器可读回执位于该目录的 `receipt.json`。这些字节数和摘要仅属于此次合成演练，不是生产数据证明。

CLI 参数支持 `--database <path>` 和 `--database=<path>`；`--backup-dir` 同理，显式值优先于环境与默认目录。
