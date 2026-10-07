#!/usr/bin/env node
// Local synthetic historical5→6 drill. No Docker, private inputs, provider or network.
// Paths are explicit reviewed local source roots; neither source tree is modified.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, randomBytes, scryptSync, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
assert.ok([4,5].includes(process.argv.length), 'Supply exact old and candidate source roots, optionally --expired-telemetry');
assert.ok(process.argv[4] === undefined || process.argv[4] === '--expired-telemetry');
const expiredTelemetry = process.argv[4] === '--expired-telemetry';
const [oldRoot, nextRoot] = process.argv.slice(2,4).map(value => resolve(value));
const load = (root, file) => import(pathToFileURL(join(root, file)));
assert.equal(spawnSync('git',['-C',oldRoot,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),'5335312fd53becaad4bfccace5c1f3e39c6bf4f2');
const old = await load(oldRoot, 'storage.js'), next = await load(nextRoot, 'storage.js');
const assets = await load(oldRoot, 'private-assets.js');
const root = mkdtempSync('/tmp/nestlet-schema6-recovery-');
const filename = join(root, 'live', 'nestlet.sqlite'), assetsDirectory = join(root, 'live', 'assets');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const snapshot = path => {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const schema = db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();
    const tables = schema.filter(row => row.type === 'table').map(row => row.name);
    return { schema, rows: tables.map(name => JSON.stringify(db.prepare('SELECT * FROM ' + quote(name) + ' ORDER BY rowid').all())) };
  } finally { db.close(); }
};
function cli(source, args, version = 5) {
  const result = spawnSync(process.execPath, ['scripts/private-data.js', ...args], { cwd: source, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verified, true); assert.equal(report.schemaVersion, version); assert.equal(report.assetCount, 2);
  assert.ok(!result.stdout.includes(root));
}
const shell = readFileSync(new URL('./nestlet-upgrade-schema6.sh', import.meta.url), 'utf8');
function embedded(name, recovery, source = nextRoot, expectRetentionRefusal = false) {
  const section = shell.slice(shell.indexOf(name + '() {'));
  const code = section.match(/node --input-type=module -e '\n([\s\S]*?)' \\/)[1].replaceAll('/recovery', recovery);
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: source, encoding: 'utf8' });
  if (expectRetentionRefusal) { assert.notEqual(result.status,0); assert.match(result.stderr,/Existing rows changed/u); }
  else assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '', 'Rehearsal must not print data or digests');
}
try {
  let store = old.openStorage({ filename });
  const vault = assets.openAssetVault({ directory: assetsDirectory });
  const salt = randomBytes(16), passwordHash = `scrypt$${salt.toString('base64url')}$${scryptSync('synthetic-schema6-drill-only', salt, 32).toString('base64url')}`;
  const owners = ['owner', store.createTrialUser({ username: 'synthetic-legacy-user', passwordHash }).id];
  // Populate existing email data; schema5 accounts may already be in active use.
  const now=Date.now();
  for(const owner of owners) {
    const email=`synthetic-${owner}@example.invalid`,fingerprint=createHash('sha256').update(passwordHash).digest('hex');
    const bind=store.emailAuth.createAction({kind:'bind',email,userId:owner,credentialFingerprint:fingerprint,now});
    store.emailAuth.markAccepted(bind.tokenHash,now);assert.equal(store.emailAuth.verify(bind.tokenHash,{now,ownerFingerprint:fingerprint}),true);
    assert.equal(store.emailAuth.reserveRequest(email,'synthetic-fixture-ip',now),'allowed');
    if(owner!=='owner'){const reset=store.emailAuth.createAction({kind:'reset',email,userId:owner,credentialFingerprint:fingerprint,now});store.emailAuth.markAccepted(reset.tokenHash,now);}
  }
  const pending=store.emailAuth.createAction({kind:'register',email:'synthetic-pending@example.invalid',passwordHash,now});store.emailAuth.markAccepted(pending.tokenHash,now);
  const records = [];
  for (const owner of owners) {
    const client = store.createClient(owner, { displayName: 'Synthetic retained customer' });
    const record = store.createCase(owner, { title: 'Synthetic retained case', sourceText: 'Synthetic original case source', fields: [], draftType: 'followup', draftText: '', clientId: client.id });
    const conversation = store.createConversation(owner, record.id, { title: 'Synthetic retained conversation' });
    const requestId = randomUUID();
    store.appendMessage(owner, conversation.id, { role: 'user', content: 'Synthetic prior question', state: 'complete', requestId, clientMessageId: randomUUID(), imageMetadata: [] });
    const message = store.appendMessage(owner, conversation.id, { role: 'assistant', content: 'Synthetic retained answer', state: 'complete', requestId, imageMetadata: [] });
    const artifact = store.createArtifact(owner, record.id, { kind: 'followup', title: 'Synthetic retained draft', status: 'draft', content: 'Synthetic saved correspondence', expectedCaseVersion: record.version, sourceConversationId: conversation.id, sourceMessageId: message.id });
    const workflow = store.telemetryCreateWorkflow(owner);
    store.telemetryBindWorkflow(owner, workflow.workflowId, record.id);
    const bytes = Buffer.from('Synthetic retained original evidence for ' + owner);
    const asset = store.createAsset(owner, await assets.parseAsset(bytes, { originalFilename: 'synthetic-original.txt', mimeType: 'text/plain' }), { caseId: record.id }, id => vault.write(id, bytes));
    records.push({ owner, record, client, conversation, message, artifact, workflow, asset, bytes });
  }
  store.close();
  let db = new DatabaseSync(filename);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 5);
  // Nontrivial historical AUTOINCREMENT high-water mark must survive migration.
  db.prepare('INSERT INTO telemetry_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(99, records[0].workflow.workflowId, 'owner', randomUUID(), 'server', 'request.chat', 'success', 200, null, 9, null, null, expiredTelemetry ? '2000-01-01T00:00:00.000Z' : new Date().toISOString());
  db.prepare("UPDATE sqlite_sequence SET seq=777 WHERE name='telemetry_events'").run();db.close();
  for (const mode of ['DELETE', 'WAL']) {
    let writer;
    if (mode === 'WAL') {
      writer = new DatabaseSync(filename);
      writer.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;');
      writer.prepare('UPDATE cases SET version=version+1 WHERE id=?').run(records[0].record.id);
    }
    const original = snapshot(filename), sourceHash = hash(filename), walHash = writer ? hash(filename + '-wal') : null;
    const recovery = join(root, mode); mkdirSync(recovery, { mode: 0o700 });
    const backup = join(recovery, 'schema5'), rehearsal = join(recovery, 'rehearsal');
    cli(nextRoot, ['backup', '--db', filename, '--assets', assetsDirectory, '--output', backup]);
    cli(nextRoot, ['verify', '--input', backup]);
    cli(nextRoot, ['restore', '--input', backup, '--output', rehearsal]);
    assert.ok(hash(filename) === sourceHash); if (writer) assert.ok(hash(filename + '-wal') === walHash);
    assert.deepEqual(snapshot(join(rehearsal, 'nestlet.sqlite')), original);
    if(expiredTelemetry) {
      // Supported-state refusal: preserve strict checks when startup maintenance changes old telemetry.
      embedded('rehearse_migration',recovery,nextRoot,true);
      assert.ok(hash(filename)===sourceHash);if(writer)assert.ok(hash(filename+'-wal')===walHash);
      assert.deepEqual(snapshot(join(backup,'nestlet.sqlite')),original);
      cli(nextRoot,['verify','--input',backup]);cli(oldRoot,['verify','--input',backup]);
      writer?.close();continue;
    }
    embedded('rehearse_migration', recovery);
    const migratedFile = join(rehearsal, 'nestlet.sqlite'), migratedHash = hash(migratedFile);
    // An old binary rejects schema6 without resetting its version or touching bytes.
    assert.throws(() => old.openStorage({ filename: migratedFile }), error => error.code === 'STORAGE_VERSION_UNSUPPORTED');
    assert.ok(hash(migratedFile) === migratedHash);
    store = next.openStorage({ filename: migratedFile });
    for (const item of records) {
      assert.equal(store.getCase(item.owner, item.record.id).clientId, item.client.id);
      assert.equal(store.getArtifact(item.owner, item.artifact.id).content, item.artifact.content);
      assert.equal(store.listMessages(item.owner, item.conversation.id)[1].id, item.message.id);
      assert.equal(store.emailAuth.identity(item.owner).email,`synthetic-${item.owner}@example.invalid`);
      assert.deepEqual(assets.openAssetVault({ directory: join(rehearsal, 'assets') }).read(store.getAsset(item.owner, item.asset.id)), item.bytes);
    }
    assert.equal(store.getUserById('owner').passwordHash, null);
    assert.equal(store.getUserById(owners[1]).passwordHash,passwordHash);
    // Synthetic only, after proving migration itself grants nobody administrator access.
    const actor={userId:'owner',role:'owner'};
    store.accountAdministration.setAdministrator(actor,owners[1],{administrator:true,expectedVersion:0});
    store.accountAdministration.setAdministrator(actor,owners[1],{administrator:false,expectedVersion:1});
    store.accountAdministration.setAdministrator(actor,owners[1],{administrator:true,expectedVersion:2});
    const audit=store.accountAdministration.audit(actor);assert.equal(audit.events.length,3);store.close();
    embedded('rehearse_schema6_backup',recovery);
    embedded('rehearse_predecessor_refusal',recovery,oldRoot);
    const restored=next.openStorage({filename:join(recovery,'schema6-restored','nestlet.sqlite')});
    assert.equal(restored.accountAdministration.administrator(owners[1]),true);assert.deepEqual(restored.accountAdministration.audit(actor),audit);restored.close();
    cli(nextRoot, ['restore', '--input', backup, '--output', join(recovery, 'future-check')]);
    embedded('rehearse_future_refusal', recovery);
    // A late capability-audit DDL collision rolls back capability DDL and preserves every prior row.
    const failure = join(recovery, 'failed-migration');
    cli(nextRoot, ['restore', '--input', backup, '--output', failure]);
    const failedFile = join(failure, 'nestlet.sqlite');
    db = new DatabaseSync(failedFile);db.exec('CREATE TABLE account_capability_audit(sentinel TEXT) STRICT;');
    db.prepare('INSERT INTO account_capability_audit VALUES(?)').run('synthetic retained sentinel');db.close();
    const beforeFailure = snapshot(failedFile);
    assert.throws(() => next.openStorage({ filename: failedFile }), /account_capability_audit/u);
    assert.deepEqual(snapshot(failedFile), beforeFailure);
    db = new DatabaseSync(failedFile, { readOnly: true });assert.equal(db.prepare('PRAGMA user_version').get().user_version, 5);db.close();
    // Reverify the untouched original recovery point with both reviewed CLIs.
    cli(nextRoot, ['verify', '--input', backup]);cli(oldRoot, ['verify', '--input', backup]);
    assert.equal(statSync(backup).mode & 0o777, 0o700);
    assert.equal(statSync(join(backup, 'nestlet.sqlite')).mode & 0o777, 0o600);
    assert.equal(statSync(join(backup, 'manifest.json')).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(backup).sort(), ['assets', 'manifest.json', 'nestlet.sqlite']);
    writer?.close();
  }
  if(expiredTelemetry)console.log('PASS: expired synthetic telemetry causes exact rehearsal refusal; original DELETE/WAL source and pre5 recovery snapshot remain unchanged. Supported-state limitation, not an aged-data migration success.');
  else console.log('PASS: actual historical5 source; DELETE and committed live-WAL backup/verify/restore; exact deployment migration/future-version code; every old row/schema/high-water mark/original preserved; populated email records; exact schema6 capability/audit round-trip; late-DDL rollback; old runtime refuses6 unchanged. Synthetic-only, no provider/production access.');
} finally { rmSync(root, { recursive: true, force: true }); }
