/**
 * Input: 本轮从已登录WPS在线页面下载的xlsx；或 --failed 固定原因码
 * Output: 受限同步回执与首页状态；有变化时先在线备份再按摘要事务写入
 * Pos: 每小时同步执行入口；浏览器连接和重新下载由当前任务调度负责，不保存登录凭据。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const STATUS = path.join(ROOT, 'backend/state/wps-sync/status.json');
// 预览、备份和写库各自限时；超时由既有失败路径记录并释放锁，下一轮重新核对。
const runCommand = (command, args, options = {}) => execFileSync(command, args, { timeout: 120000, stdio: 'pipe', ...options });
function save(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(file), 0o700);
  fs.writeFileSync(`${file}.new`, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.chmodSync(`${file}.new`, 0o600); fs.renameSync(`${file}.new`, file);
}
function read(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return {}; throw e; } }
const REASONS = ['cloud_unavailable', 'login_required', 'download_failed', 'fresh_download_required', 'sync_failed'];
async function runSync({source, statusFile = STATUS, now = Date.now(), execute, backup, failed}) {
  const before = read(statusFile);
  fs.mkdirSync(path.dirname(statusFile), {recursive:true,mode:0o700});
  const lock = `${statusFile}.lock`;
  // 单任务串行即可；崩溃残留锁必须检查进程后人工清理，禁止超时强抢。
  const fd = fs.openSync(lock, 'wx', 0o600); fs.writeFileSync(fd, String(process.pid));
  const checkedAt = new Date(now).toISOString();
  try {
    if (failed) throw new Error(REASONS.includes(failed) ? failed : 'sync_failed');
    const age = now - fs.statSync(source).mtimeMs;
    if (age < -60000 || age > 10 * 60000) throw new Error('fresh_download_required');
    fs.chmodSync(source, 0o600);
    save(statusFile, {...before, state:'running', lastAttemptAt:checkedAt, reason:null});
    const digest = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
    const preview = await execute('preview', {source,digest});
    const changes = preview.summary.updates + preview.summary.creates;
    if (changes) { await backup(); await execute('apply', {source,digest,previewDigest:preview.previewDigest}); }
    const check = await execute('recheck', {source,digest});
    if (check.summary.updates + check.summary.creates !== 0) throw new Error('sync_failed');
    const result = {state:check.summary.conflicts ? 'needs_review':'current', lastAttemptAt:checkedAt, lastSuccessAt:checkedAt, changes, conflicts:check.summary.conflicts, reason:null};
    save(statusFile, result); return result;
  } catch (error) {
    save(statusFile, {...before, state:'failed', lastAttemptAt:checkedAt, reason:REASONS.includes(error.message) ? error.message:'sync_failed'});
    throw error;
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}
async function main() {
  const [flag,value,...rest] = process.argv.slice(2);
  if (rest.length || !['--source','--failed'].includes(flag) || !value) throw new Error('Usage: node scripts/run_wps_sync.js --source <fresh.xlsx> | --failed <reason>');
  const db = path.join(ROOT,'backend/prisma/dev.db');
  const dir = path.dirname(STATUS);
  const runId = new Date().toISOString().replace(/[:.]/g,'-');
  const execute = async (mode, data) => {
    const out = path.join(dir, `${runId}-${mode}.json`);
    const args = [path.join(__dirname,'sync_shipment_summary.js'),'--source',data.source,'--sha256',data.digest,'--out',out];
    if (mode === 'apply') args.push('--apply-plan',data.previewDigest);
    runCommand(process.execPath,args,{cwd:ROOT,env:{...process.env,NODE_ENV:'production',DATABASE_URL:`file:${db}`}});
    return read(out);
  };
  const backup = async () => {
    const folder = path.join(ROOT,'backend/prisma/backups');
    fs.mkdirSync(folder,{recursive:true,mode:0o700}); fs.chmodSync(folder,0o700);
    const target = path.join(folder,`wps-sync-${runId}.db`);
    runCommand('python3',['-c',"import sqlite3,sys,os; os.umask(0o077); a=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); assert b.execute('pragma quick_check').fetchone()[0]=='ok'; b.close(); a.close()",db,target]);
    fs.chmodSync(target,0o600);
  };
  const result = await runSync({source:flag==='--source'?path.resolve(value):undefined,failed:flag==='--failed'?value:undefined,execute,backup});
  console.log(JSON.stringify(result));
}
module.exports = {runSync, runCommand};
if (require.main === module) main().catch(()=>{console.error('WPS同步未完成；检查受限回执及首页状态。');process.exitCode=1;});
