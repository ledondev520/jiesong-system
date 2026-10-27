# VPS 生产回滚手册

## 变量与运行时：先完成，再执行任何回滚操作

在同一个 Bash 会话按顺序执行，分支步骤只选适用的一支。先填写本次部署前备份目录 `B`（形如 `/opt/jiesong_system/deploy-backups/pre-<短sha>-<时间>`），`OLD` 只从该目录的 `code-HEAD.txt` 读取，不手填提交号。下列命令是供生产操作者审阅后执行的流程，不是一键脚本。

```bash
set -euo pipefail
NODE_RUNTIME=/opt/jiesong_system/runtime/node-v22.23.4-linux-x64
export PATH="$NODE_RUNTIME/bin:$PATH"
test "$(command -v node)" = "$NODE_RUNTIME/bin/node"
test "$(node -v)" = v22.23.4
umask 077
CODE=/opt/jiesong-system
TS=$(date +%Y%m%d-%H%M%S)
: "${B:?请设置本次部署前备份目录}"
test -d "$B"
test -f "$B/code-HEAD.txt"
OLD=$(cat "$B/code-HEAD.txt")
[[ "$OLD" =~ ^[[:xdigit:]]{40}$ ]]
test "$(cat "$B/code-HEAD.txt")" = "$OLD"
DB=/opt/jiesong_system/current/backend/prisma/dev.db
: "${PRODUCTION_URL:?请设置生产 HTTPS 入口}"
: "${UPLOAD_DIR:?请填写实际附件目录的绝对路径}"
: "${RECEIPT_DIR:?请填写本次部署后财务留存回执所在的私有目录}"
HEALTH_URL=http://localhost:3001/health
PRICING="$CODE/config/pricing.json"
ENV_FILE="$CODE/backend/.env"
RESTORE_DB=no
BACKEND_NAME=jiesong-backend
FRONTEND_NAME=jiesong-frontend
NODE20_ECOSYSTEM=/opt/jiesong_system/runtime/ecosystem.node20-rollback.config.js
: "${NODE22_ECOSYSTEM:?请设置 runtime 目录内实际的 Node 22 ecosystem 路径}"
SCHEMA="$CODE/backend/prisma/schema.prisma"
VERIFY="$CODE/scripts/verify-vps-runtime.cjs"
SQL_INTEGRITY='PRAGMA integrity_check;'
SQL_QUICK='PRAGMA quick_check;'
SQL_MIGRATIONS='SELECT COUNT(*) FROM "_prisma_migrations";'
TABLES=(users products sales_contracts purchase_contracts)
OBSERVE_SECONDS=180
```

必须首先设置上述 PATH。回滚到 #99/#100 之前的提交时，检出中没有 `scripts/require-node-runtime.sh`，不能依赖它；未设置 PATH 时 npm/build 可能使用系统 Node 20，与 PM2 使用的 Node 22 不一致。

`DB` 必须以现行 `backend/.env` 中 `DATABASE_URL` 实际指向的路径为准；上面是生产路径，执行前私下核对现行与备份环境配置，禁止输出内容。`/opt/jiesong-system/backend/prisma/dev.db` 是陈旧副本，绝不备份或恢复它。`UPLOAD_DIR` 也取自实际配置，不按构建目录猜测。确认恢复环境后仍指向同一生产库及附件目录；若不一致，先解决目标身份问题再继续。Node 22 ecosystem 变量须私下核实为 runtime 目录内实际存在的文件名。

前提：具备文件属主权限、Bash、Git、npm、PM2、Python 3、sqlite3 CLI（支持 `-readonly`）、GNU 文件工具及 xxd。暂停并发发布、定价编辑、财务留存任务及其他写入任务，并在入口隔离业务写入；附件统计期间也不得上传或生成文件。仅回滚代码时必须事先确认旧代码兼容当前数据库结构和数据，不能以本手册替代 schema 兼容性评估，不运行迁移或 `db push`。

## 保存配置、附件基线与回执

确认 `$B/dev.db` 是本次部署前完成完整性校验的一致性在线快照（包含已提交 WAL），不是从在线数据库直接复制的单文件。备份目录为 0700，配置及数据库为 0600；目录和备份来源必须可信。环境文件不进入日志，不启用 shell 跟踪，不输出完整 PM2 环境。

定价只采用这一条规则：**默认以回滚时服务器上的现行版为权威**。发布流程本身就跨部署保留运行时 `pricing.json`，管理员上线后的修改不能被回滚覆盖。先把现行版另存到备份目录，不要放临时目录，并记录现行版和部署前版的两份 SHA-256。只有事故原因就是定价文件本身时，才显式选择 `$B/pricing.json`，同时在回滚记录写明原因。

```bash
test -f "$DB"
test -f "$B/dev.db"
test -f "$B/backend.env"
test -f "$B/pricing.json"
chmod 700 "$B"
chmod 600 "$B/backend.env" "$B/dev.db" "$B/pricing.json"
CURRENT_PRICING="$B/pricing.json.pre-rollback-$TS"
test ! -e "$CURRENT_PRICING"
cp -p "$PRICING" "$CURRENT_PRICING"
chmod 600 "$CURRENT_PRICING"
sha256sum "$CURRENT_PRICING" "$B/pricing.json" > "$B/pricing.sha256-$TS"
PRICING_AUTHORITY="$CURRENT_PRICING"
# 仅定价文件本身引发事故时，显式改选并记录原因：
# PRICING_AUTHORITY="$B/pricing.json"
PRICING_SHA=$(sha256sum "$PRICING_AUTHORITY" | cut -d ' ' -f 1)
if ! cmp -s "$ENV_FILE" "$B/backend.env"; then
  test ! -e "$B/backend.env.pre-rollback-$TS"
  cp -p "$ENV_FILE" "$B/backend.env.pre-rollback-$TS"
  chmod 600 "$B/backend.env.pre-rollback-$TS"
fi
find "$UPLOAD_DIR" -type f -printf '%s\n' |
  awk '{n++; b+=$1} END {printf "%.0f %.0f\n", n, b}' > "$B/uploads.before-$TS"
find "$RECEIPT_DIR" -type f -print > "$B/financial-receipts-$TS"
```

在受保护的回滚记录中从回执清单筛出部署后至回滚前的回执；目录外的回执也需按运维记录补齐。`retain-financial-snapshots.js --confirm` 现在必须同时指定 `--backup-dir` 和 `--receipt`。私下核对这些回执，记录其中哪些新增 ID 会丢失，不把原始财务行或回执内容打印到普通日志。恢复数据库会撤销部署后写入的**所有业务行**，包括这些财务留存追加；保留回执不代表数据已自动补回。

## 可选：数据需要恢复时，先停机离线替换

**仅数据本身需要恢复才执行本节；不恢复 DB 时整段跳过，也不要停后端。** 本节必须在代码回滚之前执行，避免旧代码处理上线后的数据。先关闭其他数据库写入者，确认 PM2 后端已 stopped，再把现库与存在的 journal/WAL/SHM 作为整体回退材料保存；不得只保留 `.db`。

```bash
RESTORE_DB=yes
pm2 stop "$BACKEND_NAME"
test "$(pm2 jlist | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const p=JSON.parse(s).filter(x=>x.name===process.argv[1]);if(p.length!==1)process.exit(1);process.stdout.write(p[0].pm2_env.status)})' "$BACKEND_NAME")" = stopped
DB_OWNER=$(stat -c '%u:%g' "$DB")
DB_SAVED="$B/dev.db.pre-rollback-$TS"
for suffix in '' -journal -wal -shm; do
  test ! -e "$DB_SAVED$suffix"
  test ! -L "$DB_SAVED$suffix"
  if [ -e "$DB$suffix" ]; then
    cp -p "$DB$suffix" "$DB_SAVED$suffix"
    chmod 600 "$DB_SAVED$suffix"
  fi
done
test "$(sqlite3 -readonly "$B/dev.db" "$SQL_INTEGRITY")" = ok
cp -p "$B/dev.db" "$DB"
rm -f "$DB-journal" "$DB-wal" "$DB-shm"
chown "$DB_OWNER" "$DB"
chmod 600 "$DB"
test "$(stat -c '%u:%g' "$DB")" = "$DB_OWNER"
test "$(sqlite3 -readonly "$DB" "$SQL_INTEGRITY")" = ok
```

这是**停机后离线替换**，与仓库规则中的“禁止覆盖在线库、不要把旧 WAL/SHM 套到恢复文件上”一致。保存的整组旧文件只用于进一步故障回退，不能混用到恢复库上；移除的是目标路径残留的旧 sidecar。任何一步失败都保持停止，先核查备份与身份，不继续启动。常规恢复到新路径的流程见 [SQLite 备份与恢复](sqlite-backup-restore.md)。

## 回退代码、还原所选配置并构建

先保存所选配置，再清除工作区定价差异，以和远端发布脚本相同的方法切换。

```bash
git -C "$CODE" checkout -- config/pricing.json 2>/dev/null || true
git -C "$CODE" fetch origin
git -C "$CODE" checkout main
git -C "$CODE" reset --hard "$OLD"
cp -p "$PRICING_AUTHORITY" "$PRICING"
if ! cmp -s "$ENV_FILE" "$B/backend.env"; then
  cp -p "$B/backend.env" "$ENV_FILE"
fi
chmod 600 "$ENV_FILE"
cd "$CODE/backend" && npm ci --omit=dev && npx prisma generate
cd "$CODE/frontend" && npm ci && npm run build
```

这会把服务器本地 main 分支拨回 `$OLD`。下次部署时 `deploy.yml` 执行 `git checkout <ref>` 和 `git reset --hard <DEPLOY_SHA>`，会拨到新版本，不需额外恢复分支。不使用 `checkout --detach`：它会让 main 留在新版本而 HEAD 游离，且定价文件有差异时切换还可能被拒绝。其他本地改动必须提前审阅并私下保存，`reset --hard` 会丢弃受跟踪文件的未提交修改。

依赖安装不用 `--production`，新版 npm 已改名，会警告；使用 `--omit=dev`。如果服务器 npm 是 11+，默认跳过部分依赖的安装脚本，随后单独运行的 `prisma generate` 覆盖 Prisma 生成，不影响此流程；仍需确认应用没有其他必需安装脚本被跳过。`deploy.yml` / `deploy.sh` 中仍使用 `--production`，属于代码改动，另开 PR 处理，本手册不修改它们。

## 重启并保存进程状态

恢复 `.env` 后使用 `--update-env`，避免 PM2 沿用旧的进程环境。它本身不会解析 `.env`；若 PM2 中也设置了同名变量，必须先通过既有私密配置机制对齐，再重启，不能期待 dotenv 覆盖 PM2 已注入的值，也不能输出完整环境。

```bash
if [ "$RESTORE_DB" = yes ]; then
  pm2 start "$BACKEND_NAME" --update-env
else
  pm2 restart "$BACKEND_NAME" --update-env
fi
pm2 restart "$FRONTEND_NAME" --update-env
pm2 save
```

## 验收清单：全部通过才算成功

- HEAD 等于 `$OLD`；两个 PM2 进程 online，cwd 分别为 `$CODE/backend`、`$CODE/frontend`，`unstable_restarts=0`。观察几分钟，累计重启数也不再增加。只投影必要字段，不输出原始 `pm2 jlist`。

```bash
test "$(git -C "$CODE" rev-parse HEAD)" = "$OLD"
pm2_snapshot() {
  pm2 jlist | node -e 'let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const all=JSON.parse(s);const names=process.argv.slice(2);const result=names.map((name,i)=>{const matches=all.filter(x=>x.name===name);if(matches.length!==1)throw Error("process count");const p=matches[0],e=p.pm2_env;if(e.status!=="online"||e.pm_cwd!==process.argv[1]+["/backend","/frontend"][i]||e.unstable_restarts!==0)throw Error("process state");return {name,status:e.status,cwd:e.pm_cwd,unstable_restarts:e.unstable_restarts,restarts:e.restart_time};});process.stdout.write(JSON.stringify(result)+"\n")})' "$CODE" "$BACKEND_NAME" "$FRONTEND_NAME"
}
pm2_snapshot > "$B/pm2.before-$TS"
sleep "$OBSERVE_SECONDS"
pm2_snapshot > "$B/pm2.after-$TS"
cmp -s "$B/pm2.before-$TS" "$B/pm2.after-$TS"
```

- 数据库 `quick_check` 为 ok，`_prisma_migrations` 数量与备份一致。不恢复 DB 也要检查；若迁移数量不同，不能宣布成功，应重新评估兼容性。

```bash
test "$(sqlite3 -readonly "$DB" "$SQL_QUICK")" = ok
test "$(sqlite3 -readonly "$B/dev.db" "$SQL_MIGRATIONS")" = \
     "$(sqlite3 -readonly "$DB" "$SQL_MIGRATIONS")"
```

- **恢复了 DB 时，关键表行数必须等于备份库行数**，不能只验证非零。先查看目标版本 `backend/prisma/schema.prisma` 的 `@@map` 确认实际表名：本手册编写时 User、Product、SalesContract、PurchaseContract 分别映射为 `users`、`products`、`sales_contracts`、`purchase_contracts`；目标版本映射不同时先调整 `TABLES`。以下分别对备份与恢复库 count 后比对，业务验收再核查关键记录。

```bash
if [ "$RESTORE_DB" = yes ]; then
  grep -nE 'model (User|Product|SalesContract|PurchaseContract) |@@map' "$SCHEMA"
  for table in "${TABLES[@]}"; do
    COUNT_SQL="SELECT COUNT(*) FROM \"$table\";"
    BACKUP_COUNT=$(sqlite3 -readonly "$B/dev.db" "$COUNT_SQL")
    CURRENT_COUNT=$(sqlite3 -readonly "$DB" "$COUNT_SQL")
    printf '%s backup=%s restored=%s\n' "$table" "$BACKUP_COUNT" "$CURRENT_COUNT"
    test "$BACKUP_COUNT" = "$CURRENT_COUNT"
  done
fi
```

- 定价 SHA-256 等于所选权威版；环境文件与部署前备份一致。健康检查 HTTP 200 且 JSON `status` 为 `ok`；公网首页 200，未登录 API 401。下列 `localhost` 指向本机回环接口。

```bash
test "$(sha256sum "$PRICING" | cut -d ' ' -f 1)" = "$PRICING_SHA"
cmp -s "$ENV_FILE" "$B/backend.env"
test "$(curl -sS -o /dev/null -w '%{http_code}' "$HEALTH_URL")" = 200
curl -fsS "$HEALTH_URL" | python3 -c 'import json,sys; assert json.load(sys.stdin)["status"] == "ok"'
test "$(curl -sS -o /dev/null -w '%{http_code}' "$PRODUCTION_URL/")" = 200
test "$(curl -sS -o /dev/null -w '%{http_code}' "$PRODUCTION_URL/api/v1/products")" = 401
if [ -f "$VERIFY" ]; then
  node "$VERIFY" "$PRODUCTION_URL"
fi
```

- 老提交中存在 `scripts/verify-vps-runtime.cjs` 时必须运行；不存在时不能跳过上述人工验收，另核对公网页面 BUILD_ID 与本机构建一致。
- **本次改动的功能回到旧行为**。例如跨过 CSV BOM 改动时，用合成数据导出 CSV，填写受保护的导出文件路径及旧版本预期前三字节，再比对。有 BOM 的前三字节为 `efbbbf`；无 BOM 时应填写旧版本真实前三字节，不能只断言“不等于 BOM”。

```bash
: "${CSV_FILE:?请设置用于验收的合成数据导出文件}"
: "${EXPECTED_CSV_PREFIX:?请设置旧版本预期前三字节的十六进制值}"
test "$(head -c 3 "$CSV_FILE" | xxd -p)" = "$EXPECTED_CSV_PREFIX"
```

- 回滚不触碰 `UPLOAD_DIR`；文件数和总字节数前后不变。保持业务写入隔离到核验结束，排除并发上传影响。

```bash
find "$UPLOAD_DIR" -type f -printf '%s\n' |
  awk '{n++; b+=$1} END {printf "%.0f %.0f\n", n, b}' > "$B/uploads.after-$TS"
cmp -s "$B/uploads.before-$TS" "$B/uploads.after-$TS"
```

## 例外：只有 Node 22 运行时本身有问题才回退运行时

**这一步目前没有演练记录，未验证。** 不作为普通代码回滚的一部分。ecosystem 文件只在服务器上，带私密环境，不能复制或输出。先私下确认路径、cwd、数据库与附件身份，具备替代运行时兼容性证据后再操作。先将 `SYSTEM_NODE` 核实为服务器系统 Node 的实际路径，并确认版本为 Node 20。

```bash
SYSTEM_NODE=/usr/bin/node
[[ "$("$SYSTEM_NODE" -v)" == v20.* ]]
pm2 delete "$BACKEND_NAME" "$FRONTEND_NAME" && pm2 start "$NODE20_ECOSYSTEM" && pm2 save
for process_name in "$BACKEND_NAME" "$FRONTEND_NAME"; do
  PROCESS_PID=$(pm2 pid "$process_name")
  test "$PROCESS_PID" -gt 0
  test "$(readlink -f "/proc/$PROCESS_PID/exe")" = "$(readlink -f "$SYSTEM_NODE")"
done
```

`SYSTEM_NODE` 须核实为服务器系统 Node 的实际路径，确认它是 Node 20，并重新执行全部验收。回退 Node 20 后，下次部署的 `pm2 restart` **不会自动换回 Node 22**。须按 runtime 目录内经核实的 Node 22 ecosystem 重新 start，并确认两个进程的实际可执行文件等于 `$NODE_RUNTIME/bin/node`，再执行全部验收。

```bash
pm2 delete "$BACKEND_NAME" "$FRONTEND_NAME" && pm2 start "$NODE22_ECOSYSTEM" && pm2 save
for process_name in "$BACKEND_NAME" "$FRONTEND_NAME"; do
  PROCESS_PID=$(pm2 pid "$process_name")
  test "$PROCESS_PID" -gt 0
  test "$(readlink -f "/proc/$PROCESS_PID/exe")" = "$(readlink -f "$NODE_RUNTIME/bin/node")"
done
```

## 回滚之后再部署

`deploy.yml` 自 #104 起从目标提交读取 `scripts/require-node-runtime.sh`，用 base64 传到远端执行，不依赖服务器旧检出是否有守卫。因此回到老提交后也能直接重新发版；待发布目标必须包含该流程和守卫，服务器仍须预装并保留 Node 22.23.4 专用运行时目录，守卫会校验但不会安装它。

手动 dispatch 必须使用 `--ref main`：远端脚本执行 `git checkout <ref>`，指定别的分支就会 checkout 到那个分支。

```bash
gh workflow run deploy.yml --ref main -f environment=production
```

## 回滚记录

在受保护的运维记录中写明：`OLD`、`B`、回滚原因、选用的定价版本及两份源版本 SHA-256 和最终验收摘要、是否恢复 DB、财务回执范围及将丢失的新增 ID、是否切换运行时、各步骤耗时、每项验收结果与观察期重启计数。记录文件权限及属主核对结果，保留配置、数据库整组回退材料和附件统计；不记录环境文件内容、凭据或原始财务行。全部通过后才解除业务写入隔离。

## 已知限制

- 运行时回滚没有演练记录，未验证。
- 演练只在合成数据和非生产机上做过，耗时不能当作生产耗时；本手册不代表已经执行生产回滚。
