const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runSync } = require('./run_wps_sync');
test('旧下载不冒充最新同步，失败保留最近成功；新下载先备份再写并复核', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wps-run-'));
  const source = path.join(dir, 'source.xlsx'); fs.writeFileSync(source, 'test');
  const now = Date.now(); fs.utimesSync(source, new Date(now - 3600000), new Date(now - 3600000));
  const statusFile = path.join(dir, 'status.json');
  fs.writeFileSync(statusFile, JSON.stringify({ lastSuccessAt: '2026-09-01T00:00:00.000Z' }));
  const steps = [];
  const execute = async mode => { steps.push(mode); return { summary: { updates: mode === 'recheck' ? 0 : 1, creates: 0, conflicts: 2 }, previewDigest: 'preview' }; };
  await assert.rejects(runSync({source, statusFile, now, execute, backup: async()=>steps.push('backup')}), /fresh_download_required/);
  assert.equal(JSON.parse(fs.readFileSync(statusFile)).lastSuccessAt, '2026-09-01T00:00:00.000Z');
  assert.deepEqual(steps, []);
  fs.utimesSync(source, new Date(now), new Date(now));
  await runSync({source, statusFile, now, execute, backup: async()=>steps.push('backup')});
  assert.deepEqual(steps, ['preview', 'backup', 'apply', 'recheck']);
  assert.equal(JSON.parse(fs.readFileSync(statusFile)).state, 'needs_review');
  assert.equal(fs.statSync(statusFile).mode & 0o777, 0o600);
  fs.rmSync(dir, {recursive:true});
});
test('子进程卡住必须限时退出，避免永久占住每小时同步', () => {
  const { runCommand } = require('./run_wps_sync');
  assert.throws(() => runCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 50 }), error => error.code === 'ETIMEDOUT');
});
test('备份失败不得写库，释放锁并保留上次成功时间', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wps-backup-fail-'));
  try {
    const source=path.join(dir,'source.xlsx');fs.writeFileSync(source,'test');
    const statusFile=path.join(dir,'status.json');fs.writeFileSync(statusFile,JSON.stringify({lastSuccessAt:'2026-09-01T00:00:00Z'}));
    const steps=[];
    await assert.rejects(runSync({source,statusFile,execute:async mode=>{steps.push(mode);return {summary:{updates:1,creates:0}};},backup:async()=>{throw new Error('backup unavailable');}}),/backup unavailable/);
    assert.deepEqual(steps,['preview']);assert.equal(fs.existsSync(`${statusFile}.lock`),false);
    const result=JSON.parse(fs.readFileSync(statusFile));assert.equal(result.state,'failed');assert.equal(result.lastSuccessAt,'2026-09-01T00:00:00Z');
  } finally {fs.rmSync(dir,{recursive:true});}
});
