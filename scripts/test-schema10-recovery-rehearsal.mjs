#!/usr/bin/env node
// Synthetic only. Run: NESTLET_CANDIDATE_ROOT=/absolute/app node --test scripts/test-schema10-recovery-rehearsal.mjs
// The exact schema9 predecessor is exported from that clone's existing Git objects.
// No fetch, dependency installation, network, Docker, private input or host changes.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync,
  chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { databaseSnapshot, privateTree, fileDigest, rehearseMigration, rehearseRoundTrip,
  rehearseHistoricalRestore, rehearseFutureRefusal, rehearsePredecessorRefusal } from './schema10-recovery-rehearsal.mjs';

const predecessorSHA = 'f738655ccab834d77d9204ebab25ab1e2a61d8ee';
assert.ok(process.env.NESTLET_CANDIDATE_ROOT, 'Set NESTLET_CANDIDATE_ROOT to the reviewed local schema10 app clone');
const candidate = resolve(process.env.NESTLET_CANDIDATE_ROOT);
const root = mkdtempSync(join(tmpdir(), 'nestlet-schema10-synthetic-'));
after(() => rmSync(root, { recursive: true, force: true }));
const predecessor = join(root, 'predecessor'); mkdirSync(predecessor, { mode: 0o700 });
const archive = spawnSync('git', ['-C', candidate, 'archive', predecessorSHA], { maxBuffer: 64 * 1024 * 1024 });
assert.equal(archive.status, 0, 'The exact schema9 predecessor must exist locally');
const extract = spawnSync('tar', ['-xf', '-', '-C', predecessor], { input: archive.stdout });
assert.equal(extract.status, 0, 'Could not materialize the public predecessor');
const load = (source, file) => import(pathToFileURL(join(source, file)).href);
const old = await load(predecessor, 'storage.js'), next = await load(candidate, 'storage.js');
const assets = await load(predecessor, 'private-assets.js');
const operations = await load(candidate, 'scripts/private-data-operations.js');
const { createOperatorAuth } = await load(predecessor, 'auth.js');
const { createOperatorAuth: createCandidateAuth } = await load(candidate, 'auth.js');
const { LIBRARY_PERMISSION_SCOPE } = await load(predecessor, 'library-consent-storage.js');
const actor = { userId: 'owner', role: 'owner' };
const inspect = (filename, action) => {
  const db = new DatabaseSync(filename);
  try { return action(db); } finally { db.close(); }
};

async function fixture({ expiredTelemetry = false } = {}) {
  const directory = mkdtempSync(join(root, 'fixture-'));
  const source = join(directory, 'source'); mkdirSync(source, { mode: 0o700 });
  const filename = join(source, 'nestlet.sqlite'), assetsDirectory = join(source, 'assets');
  const store = old.openStorage({ filename }), vault = assets.openAssetVault({ directory: assetsDirectory });
  const password = 'synthetic-schema10-recovery-only';
  const salt = randomBytes(16), passwordHash = `scrypt$${salt.toString('base64url')}$${scryptSync(password, salt, 32).toString('base64url')}`;
  const users = ['owner', store.createTrialUser({ username: 'synthetic-manual', passwordHash }).id,
    store.createTrialUser({ username: 'synthetic-default', passwordHash }).id];
  const now = Date.now(), records = [];
  for (const id of users) {
    const client = store.createClient(id, { displayName: 'Synthetic customer' });
    const record = store.createCase(id, { title: 'Synthetic case', sourceText: 'Synthetic retained source', fields: [], draftType: 'followup', draftText: '', clientId: client.id });
    const conversation = store.createConversation(id, record.id, { title: 'Synthetic conversation' });
    const requestId = randomUUID();
    store.appendMessage(id, conversation.id, { role: 'user', content: 'Synthetic question', state: 'complete', requestId, clientMessageId: randomUUID(), imageMetadata: [] });
    const message = store.appendMessage(id, conversation.id, { role: 'assistant', content: 'Synthetic retained answer', state: 'complete', requestId, imageMetadata: [] });
    const artifact = store.createArtifact(id, record.id, { kind: 'followup', title: 'Synthetic draft', status: 'draft', content: 'Synthetic retained draft', expectedCaseVersion: record.version, sourceConversationId: conversation.id, sourceMessageId: message.id });
    const workflow = store.telemetryCreateWorkflow(id); store.telemetryBindWorkflow(id, workflow.workflowId, record.id);
    const bytes = Buffer.from('Synthetic original evidence: ' + id);
    const asset = store.createAsset(id, await assets.parseAsset(bytes, { originalFilename: 'synthetic-original.txt', mimeType: 'text/plain' }), { caseId: record.id }, assetId => vault.write(assetId, bytes));
    records.push({ id, client, record, conversation, message, artifact, workflow, asset, bytes });
    const email = `synthetic-${id}@example.invalid`, fingerprint = createHash('sha256').update(passwordHash).digest('hex');
    const bind = store.emailAuth.createAction({ kind: 'bind', email, userId: id, credentialFingerprint: fingerprint, now });
    store.emailAuth.markAccepted(bind.tokenHash, now);
    assert.equal(store.emailAuth.verify(bind.tokenHash, { now, ownerFingerprint: fingerprint }), true);
    assert.equal(store.emailAuth.reserveRequest(email, 'synthetic-ip', now), 'allowed');
    if (id !== 'owner') {
      const reset = store.emailAuth.createAction({ kind: 'reset', email, userId: id, credentialFingerprint: fingerprint, now });
      store.emailAuth.markAccepted(reset.tokenHash, now);
    }
    store.libraryPermissions.set(id, { decision: id === users[1] ? 'deny' : 'allow', expectedVersion: 0, ...LIBRARY_PERMISSION_SCOPE });
  }
  const pending = store.emailAuth.createAction({ kind: 'register', email: 'synthetic-pending@example.invalid', passwordHash, now });
  store.emailAuth.markAccepted(pending.tokenHash, now);
  for (const [version, enabled] of [true, false, true].entries())
    store.accountAdministration.setAdministrator(actor, users[1], { administrator: enabled, expectedVersion: version });
  const receipts = [];
  for (const state of ['pending', 'applied', 'cancelled', 'undone']) {
    const record = store.createCase('owner', { title: 'Synthetic review ' + state, sourceText: '', fields: [], draftType: 'followup', draftText: '' });
    const conversation = store.createConversation('owner', record.id, {});
    const message = store.appendMessage('owner', conversation.id, { role: 'assistant', content: 'Synthetic review source', state: 'complete' });
    const prepared = store.conversationReviews.prepare('owner', record.id, {
      clientRequestId: randomUUID(), locale: 'en', conversationAction: { action: 'prepare_case_suggestion',
        expectedVersion: record.version, sourceConversationId: conversation.id, sourceMessageId: message.id,
        factChanges: { rent: { value: '$2200' } }, changes: {} }
    });
    const reply = { conversationId: conversation.id, expectedVersion: record.version, clientMessageId: randomUUID(), answer: state === 'cancelled' ? 'cancel' : 'confirm' };
    if (state !== 'pending') {
      const result = store.conversationReviews.reply('owner', record.id, prepared.intent.id, reply);
      if (state === 'undone') store.conversationReviews.undo('owner', record.id, prepared.intent.id, {
        conversationId: conversation.id, expectedVersion: result.case.version, clientMessageId: randomUUID() });
    }
    receipts.push({ caseId: record.id, id: prepared.intent.id, state });
  }
  const auth = createOperatorAuth({ passwordHash, publicOrigin: 'https://synthetic.invalid', sessionStore: store.authSessions,
    findTrialUser: name => store.findUserByUsername(name), findTrialUserById: id => store.getUserById(id) });
  const sessions = [await auth.login(password, 'owner', true), await auth.login(password, 'synthetic-manual'), await auth.login(password, 'synthetic-default')];
  store.close();
  inspect(filename, db => {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 9);
    db.prepare('INSERT INTO telemetry_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(99, records[0].workflow.workflowId, 'owner', randomUUID(), 'server', 'request.chat', 'success', 200, null, 9, null, null, expiredTelemetry ? '2000-01-01T00:00:00.000Z' : new Date().toISOString());
    db.prepare("UPDATE sqlite_sequence SET seq=777 WHERE name='telemetry_events'").run();
    db.prepare("UPDATE sqlite_sequence SET seq=333 WHERE name='account_capability_audit'").run();
  });
  const snapshot = databaseSnapshot(filename);
  // Every historical table is populated, including all three security tables.
  assert.ok(Object.values(snapshot.tables).every(table => table.count > 0));
  return { directory, source, filename, assetsDirectory, users, records, receipts, sessions, password, passwordHash };
}

async function backupFixture(f, output = join(f.directory, 'schema9')) {
  const result = await operations.backupPrivateData({ filename: f.filename, assetsDirectory: f.assetsDirectory, output });
  assert.equal(result.schemaVersion, 9); return output;
}
function verifyDomain(f, filename, assetsDirectory) {
  const store = next.openStorage({ filename });
  try {
    for (const record of f.records) {
      assert.equal(store.getCase(record.id, record.record.id).sourceText, 'Synthetic retained source');
      assert.equal(store.getCase(record.id, record.record.id).clientId, record.client.id);
      assert.equal(store.getArtifact(record.id, record.artifact.id).content, record.artifact.content);
      assert.equal(store.listMessages(record.id, record.conversation.id)[1].id, record.message.id);
      assert.equal(store.emailAuth.identity(record.id).email, `synthetic-${record.id}@example.invalid`);
      assert.match(store.getCase(record.id, record.record.id).displayId, /^SX\d{8}$/);
      assert.deepEqual(assets.openAssetVault({ directory: assetsDirectory }).read(store.getAsset(record.id, record.asset.id)), record.bytes);
    }
    for (const receipt of f.receipts) assert.equal(store.conversationReviews.read('owner', receipt.caseId, receipt.id).intent.state, receipt.state);
    assert.equal(store.accountAdministration.administrator(f.users[1]), true);
    assert.equal(store.accountAdministration.audit(actor).events.length, 3);
    assert.equal(store.getUserById(f.users[1]).passwordHash, f.passwordHash);
  } finally { store.close(); }
}

for (const mode of ['DELETE', 'WAL']) test(`schema9 backup, migration, schema10 recovery and historical fence preserve data (${mode})`, async () => {
  const f = await fixture(); let writer;
  try {
    if (mode === 'WAL') {
      writer = new DatabaseSync(f.filename);
      writer.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0');
      writer.prepare('UPDATE cases SET version=version+1 WHERE id=?').run(f.records[0].record.id);
    }
    // SQLite readers update volatile shared-memory reader marks. Main database,
    // committed WAL and originals must be byte-identical; SHM mode/existence stay checked.
    const sourceEvidence = () => privateTree(f.source).map(row => row[0] === 'nestlet.sqlite-shm'
      ? [row[0], row[1], 'volatile reader marks'] : row);
    const sourceTree = sourceEvidence(), before = databaseSnapshot(f.filename);
    const snapshot = await backupFixture(f), backupTree = privateTree(snapshot);
    assert.deepEqual(databaseSnapshot(join(snapshot, 'nestlet.sqlite')), before);
    assert.deepEqual(sourceEvidence(), sourceTree);
    const rehearsal = join(f.directory, 'rehearsal');
    assert.deepEqual(await rehearseMigration({ runtime: candidate, snapshot, output: rehearsal }), { verified: true, schemaVersion: 10 });
    verifyDomain(f, join(rehearsal, 'nestlet.sqlite'), join(rehearsal, 'assets'));
    const migrated = next.openStorage({ filename: join(rehearsal, 'nestlet.sqlite') });
    assert.equal(migrated.authSessions.size, 3);
    assert.equal(databaseSnapshot(join(rehearsal, 'nestlet.sqlite')).tables.email_actions.count, 3);
    assert.equal(migrated.libraryPermissions.read('owner').decision, 'allow');
    assert.equal(migrated.libraryPermissions.read(f.users[1]).decision, 'deny');
    assert.equal(migrated.libraryPermissions.read(f.users[2]).decision, 'allow');
    assert.equal(migrated.serviceEntitlements.read(f.users[1]).status, 'available');
    assert.equal(migrated.serviceEntitlements.read(f.users[2]).mode, 'default');
    const auth = createCandidateAuth({ passwordHash: f.passwordHash, publicOrigin: 'https://synthetic.invalid', sessionStore: migrated.authSessions,
      findTrialUser: name => migrated.findUserByUsername(name), findTrialUserById: id => migrated.getUserById(id) });
    for (const session of f.sessions) {
      const request = { headers: { cookie: session.cookie.split(';')[0], 'x-csrf-token': session.csrfToken } };
      assert.equal(auth.getSession(request).userId, session.userId);
      assert.ok(auth.csrfValid(request, auth.getSession(request)));
    }
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    migrated.serviceEntitlements.set(actor, f.users[1], { enabled: true, expiresAt, requestsPerHour: 15, expectedVersion: 0 });
    migrated.serviceEntitlements.consume({ userId: f.users[1], role: 'trial' }, randomUUID());
    migrated.serviceEntitlements.consume({ userId: f.users[2], role: 'trial' }, randomUUID());
    migrated.close();
    inspect(join(rehearsal, 'nestlet.sqlite'), db => db.prepare("UPDATE sqlite_sequence SET seq=222 WHERE name='service_entitlement_audit'").run());
    const schema10 = join(f.directory, 'schema10'), restored10 = join(f.directory, 'restored10');
    await rehearseRoundTrip({ runtime: candidate, source: rehearsal, snapshot: schema10, output: restored10 });
    verifyDomain(f, join(restored10, 'nestlet.sqlite'), join(restored10, 'assets'));
    const recovered = next.openStorage({ filename: join(restored10, 'nestlet.sqlite') });
    for (const id of f.users.slice(1)) {
      assert.equal(recovered.serviceEntitlements.read(id).status, 'paused');
      assert.equal(recovered.serviceEntitlements.read(id).used, 1);
      assert.equal(recovered.libraryPermissions.read(id).decision, 'unset');
    }
    assert.equal(recovered.serviceEntitlements.read('owner').status, 'available');
    assert.equal(recovered.serviceEntitlements.audit(actor).events.length, 3);
    assert.equal(recovered.authSessions.size, 0); recovered.close();
    await rehearsePredecessorRefusal({ runtime: predecessor, source: restored10 });
    const restored9 = join(f.directory, 'restored9');
    await rehearseHistoricalRestore({ runtime: candidate, snapshot, output: restored9 });
    verifyDomain(f, join(restored9, 'nestlet.sqlite'), join(restored9, 'assets'));
    await rehearseFutureRefusal({ runtime: candidate, snapshot, output: join(f.directory, 'future') });
    assert.deepEqual(privateTree(snapshot), backupTree);
    assert.deepEqual(sourceEvidence(), sourceTree);
    assert.equal(operations.verifyPrivateBackup({ input: snapshot }).schemaVersion, 9);
  } finally { writer?.close(); }
});

test('expired telemetry makes strict migration preservation fail without changing the recovery point', async () => {
  const f = await fixture({ expiredTelemetry: true }), snapshot = await backupFixture(f), before = privateTree(snapshot);
  await assert.rejects(rehearseMigration({ runtime: candidate, snapshot, output: join(f.directory, 'rehearsal') }), /Existing rows changed/);
  assert.deepEqual(privateTree(snapshot), before);
});

test('private modes, existing destinations and nested backup outputs fail before source mutation', async () => {
  const f = await fixture(), snapshot = await backupFixture(f), before = privateTree(snapshot);
  await assert.rejects(rehearseMigration({ runtime: candidate, snapshot, output: snapshot }), /separate directories/);
  await assert.rejects(rehearseMigration({ runtime: candidate, snapshot, output: join(snapshot, 'child') }), /separate directories/);
  const existing = join(f.directory, 'existing'); mkdirSync(existing, { mode: 0o700 });
  await assert.rejects(rehearseMigration({ runtime: candidate, snapshot, output: existing }), /already exists/);
  const privateFile = join(snapshot, 'nestlet.sqlite'); chmodSync(privateFile, 0o644);
  assert.throws(() => privateTree(snapshot), /permissions/); chmodSync(privateFile, 0o600);
  assert.deepEqual(privateTree(snapshot), before);
});

test('historical fence remains alongside schema9 and startup consumes it exactly once', async () => {
  const f = await fixture(), snapshot = await backupFixture(f), before = privateTree(snapshot);
  const restored = await operations.restorePrivateBackup({ input: snapshot, output: join(f.directory, 'fenced') });
  const marker = restored.filename + '.service-reconfirm.json', bytes = readFileSync(marker);
  assert.equal(databaseSnapshot(restored.filename).version, 9);
  assert.equal(statSync(marker).mode & 0o777, 0o600);
  assert.equal(statSync(join(f.directory, 'fenced')).mode & 0o777, 0o700);
  assert.equal(restored.preserveRestoreDirectory, true);
  next.openStorage({ filename: restored.filename }).close();
  assert.equal(existsSync(marker), false);
  let store = next.openStorage({ filename: restored.filename });
  store.serviceEntitlements.set(actor, f.users[1], { enabled: true, expiresAt: null, requestsPerHour: 10, expectedVersion: 1 });
  store.close();
  // Simulate an operator-verified leftover fence, not automatic stale-lock repair.
  writeFileSync(marker, bytes, { mode: 0o600, flag: 'wx' });
  store = next.openStorage({ filename: restored.filename });
  assert.equal(store.serviceEntitlements.read(f.users[1]).status, 'available');
  assert.equal(store.serviceEntitlements.audit(actor).events.filter(row => row.source === 'recovery').length, 2);
  store.close();
  assert.equal(existsSync(marker), false);
  assert.equal(databaseSnapshot(restored.filename).tables.service_recovery_receipts.count, 1);
  assert.deepEqual(privateTree(snapshot), before);
});

test('wrong fence digest and journal sidecars refuse before database mutation', async () => {
  const f = await fixture(), snapshot = await backupFixture(f);
  const restored = await operations.restorePrivateBackup({ input: snapshot, output: join(f.directory, 'bad-fence') });
  const marker = restored.filename + '.service-reconfirm.json', original = readFileSync(marker), before = fileDigest(restored.filename);
  const bad = JSON.parse(original); bad.databaseSha256 = 'f'.repeat(64); writeFileSync(marker, JSON.stringify(bad));
  assert.throws(() => next.openStorage({ filename: restored.filename }), { code: 'SERVICE_RECOVERY_INVALID' });
  assert.equal(fileDigest(restored.filename), before);
  writeFileSync(marker, original);
  for (const suffix of ['-journal', '-wal', '-shm']) {
    const sidecar = restored.filename + suffix; writeFileSync(sidecar, 'Synthetic incomplete sidecar', { mode: 0o600, flag: 'wx' });
    assert.throws(() => next.openStorage({ filename: restored.filename }), { code: 'SERVICE_RECOVERY_INVALID' });
    assert.equal(fileDigest(restored.filename), before); assert.deepEqual(readFileSync(marker), original);
    rmSync(sidecar);
  }
  assert.equal(databaseSnapshot(restored.filename).version, 9);
});

test('CLI failures disclose only a fixed class, never private paths or database values', () => {
  const script = fileURLToPath(new URL('./schema10-recovery-rehearsal.mjs', import.meta.url));
  const response = spawnSync(process.execPath, [script, 'migration', '--runtime', candidate,
    '--snapshot', join(root, 'synthetic-sensitive-path'), '--output', join(root, 'never-created')], { encoding: 'utf8' });
  assert.equal(response.status, 1);
  assert.equal(response.stdout, '');
  assert.ok(response.stderr.includes('Schema10 rehearsal failed; retain private evidence for operator review.'));
  assert.ok(!response.stderr.includes(root)); assert.ok(!response.stderr.includes(candidate));
  assert.ok(!existsSync(join(root, 'never-created')));
});

test('each CLI mode succeeds on a private owner-only copy, with fixed-class output', async () => {
  const directory = mkdtempSync(join(root, 'owner-only-')), source = join(directory, 'source');
  mkdirSync(source, { mode: 0o700 });
  const filename = join(source, 'nestlet.sqlite'), assetsDirectory = join(source, 'assets');
  old.openStorage({ filename }).close(); assets.openAssetVault({ directory: assetsDirectory });
  const snapshot = join(directory, 'schema9');
  await operations.backupPrivateData({ filename, assetsDirectory, output: snapshot });
  const original = privateTree(snapshot), rehearsal = join(directory, 'rehearsal');
  const script = fileURLToPath(new URL('./schema10-recovery-rehearsal.mjs', import.meta.url));
  const run = (mode, options) => {
    const args = Object.entries(options).flatMap(([key, value]) => ['--' + key, value]);
    const response = spawnSync(process.execPath, [script, mode, ...args], { encoding: 'utf8' });
    assert.equal(response.status, 0, response.stderr);
    assert.equal(response.stdout, 'Schema10 rehearsal passed.\n');
    assert.ok(!response.stderr.includes(root));
  };
  run('migration', { runtime: candidate, snapshot, output: rehearsal });
  run('roundtrip', { runtime: candidate, source: rehearsal, snapshot: join(directory, 'schema10'), output: join(directory, 'restored10') });
  run('historical', { runtime: candidate, snapshot, output: join(directory, 'restored9') });
  run('future', { runtime: candidate, snapshot, output: join(directory, 'future') });
  run('predecessor', { runtime: predecessor, source: join(directory, 'restored10') });
  assert.deepEqual(privateTree(snapshot), original);
});

test('schema10 recovery retains disabled/expired service settings and earlier immutable audit history', async () => {
  const f = await fixture(), snapshot = await backupFixture(f), rehearsal = join(f.directory, 'rehearsal');
  await rehearseMigration({ runtime: candidate, snapshot, output: rehearsal });
  const filename = join(rehearsal, 'nestlet.sqlite'), store = next.openStorage({ filename });
  const expiresAt = new Date(Date.now() - 1000).toISOString();
  store.serviceEntitlements.set(actor, f.users[1], { enabled: false, expiresAt, requestsPerHour: 3, expectedVersion: 0 });
  store.close();
  await rehearseRoundTrip({ runtime: candidate, source: rehearsal, snapshot: join(f.directory, 'schema10'), output: join(f.directory, 'recovered') });
  const recovered = next.openStorage({ filename: join(f.directory, 'recovered', 'nestlet.sqlite') });
  const state = recovered.serviceEntitlements.read(f.users[1]);
  assert.equal(state.status, 'paused'); assert.equal(state.expiresAt, expiresAt);
  assert.equal(state.requestsPerHour, 3); assert.equal(state.version, 2); recovered.close();
});
