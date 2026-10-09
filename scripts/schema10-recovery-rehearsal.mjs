#!/usr/bin/env node
/**
 * Local, copy-only schema9 -> schema10 and schema10 update checks. Node >=24 is required.
 * This file never chooses a host, changes Compose, restores live data, or deletes
 * evidence. Invoke it inside the already-reviewed network-disabled container.
 * Runtime and data paths must be explicit. The caller must pin the runtime image.
 * CLI errors are deliberately fixed-class: no rows, credentials, paths or hashes.
 *
 * migration  --runtime ROOT --snapshot BACKUP9 --output NEW_REHEARSAL
 * same-schema --runtime ROOT --snapshot BACKUP10 --output NEW_REHEARSAL
 * compatible --runtime OLD_ROOT --source CANDIDATE_COPY10 --output NEW_OLD_COPY
 * roundtrip  --runtime ROOT --source REHEARSAL --snapshot NEW_BACKUP10 --output NEW_RESTORE10
 * historical --runtime ROOT --snapshot BACKUP9 --output NEW_RESTORE9
 * future     --runtime ROOT --snapshot BACKUP9_OR_10 --output NEW_FUTURE_COPY
 * predecessor --runtime OLD_ROOT --source RESTORE10
 *
 * Historical recovery keeps the WHOLE output directory, including its private
 * .service-reconfirm.json fence, until candidate startup consumes it after commit.
 * Never copy only its SQLite file. Expired telemetry causing startup pruning is a
 * retention failure here; it is not silently exempted from the preservation gate.
 */
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readSync,
  readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const APPLICATION_ID = 0x4e53544c;
const CLEARED = ['email_actions', 'auth_sessions', 'library_permissions'];
const ENTITIES = [
  ['client', 'clients', 'user_id'], ['case', 'cases', 'user_id'],
  ['asset', 'assets', 'owner_user_id'], ['artifact', 'artifacts', 'user_id'],
  ['conversation', 'conversations', 'user_id'], ['message', 'messages', 'user_id']
];
// Independent release inventory, not imported from the migration builder.
const NEW_OBJECTS = [
  ['index', 'service_usage_time'], ['index', 'service_usage_user_time'],
  ...['record_display_counters_1', 'record_display_ids_1', 'record_display_ids_2',
    'service_entitlement_audit_1', 'service_entitlements_1',
    'service_recovery_receipts_1', 'service_usage_1'].map(name => ['index', 'sqlite_autoindex_' + name]),
  ...['record_display_counters', 'record_display_ids', 'service_entitlement_audit',
    'service_entitlements', 'service_recovery_receipts', 'service_usage'].map(name => ['table', name]),
  ...ENTITIES.map(([, table]) => ['trigger', table + '_assign_display_id']),
  ...['record_display_id_no_delete', 'record_display_id_no_update', 'service_audit_no_delete',
    'service_audit_no_update', 'service_recovery_no_delete', 'service_recovery_no_update'].map(name => ['trigger', name])
];
const encode = value => JSON.stringify(value, (_, entry) => typeof entry === 'bigint' ? { integer: String(entry) } : entry);
const equal = (left, right) => encode(left) === encode(right);
const check = (condition, message) => {
  if (!condition) throw Object.assign(new Error(message), { code: 'SCHEMA10_REHEARSAL_FAILED' });
};
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const load = (runtime, file) => import(pathToFileURL(join(resolve(runtime), file)).href);
const filenameIn = directory => join(directory, 'nestlet.sqlite');
const sortedObjects = rows => rows.map(row => encode(row)).sort();

function absolute(path) {
  check(typeof path === 'string' && resolve(path) === path, 'An absolute path is required');
}
function distinct(...paths) {
  paths.forEach(absolute);
  check(paths.every((path, index) => paths.every((other, otherIndex) =>
    index === otherIndex || (path !== other && !path.startsWith(other + sep) && !other.startsWith(path + sep)))),
  'Rehearsal paths must be separate directories');
}
function privateInfo(path, directory = false) {
  const info = lstatSync(path);
  check(!info.isSymbolicLink() && (directory ? info.isDirectory() : info.isFile()), 'Private evidence has an invalid type');
  check((info.mode & 0o777) === (directory ? 0o700 : 0o600), 'Private evidence permissions are invalid');
  check(info.uid === (process.geteuid?.() ?? process.getuid?.()), 'Private evidence ownership is invalid');
  if (!directory) check(info.nlink === 1, 'Private evidence link count is invalid');
  return info;
}
export function fileDigest(path) {
  privateInfo(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    check(info.isFile() && info.nlink === 1 && (info.mode & 0o777) === 0o600, 'Private evidence changed while opening');
    const hash = createHash('sha256'), buffer = Buffer.alloc(131072);
    let length;
    while ((length = readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, length));
    return hash.digest('hex');
  } finally { closeSync(fd); }
}
export function privateTree(directory) {
  absolute(directory);
  const rows = [];
  function visit(path, relative) {
    privateInfo(path, true);
    rows.push([relative, 'directory', 0o700]);
    for (const name of readdirSync(path).sort()) {
      const child = join(path, name), entry = relative ? relative + '/' + name : name;
      const info = lstatSync(child);
      if (info.isDirectory() && !info.isSymbolicLink()) visit(child, entry);
      else rows.push([entry, 'file', fileDigest(child)]);
    }
  }
  visit(directory, '');
  return rows;
}
function withDatabase(filename, callback) {
  privateInfo(filename);
  const db = new DatabaseSync(filename, { readOnly: true, allowExtension: false, timeout: 5000 });
  try { return callback(db); } finally { db.close(); }
}
function readRows(db, sql, ...params) {
  const statement = db.prepare(sql);
  statement.setReadBigInts(true);
  return statement.all(...params);
}
function rowDigest(db, table, where = '', parameters = []) {
  const statement = db.prepare('SELECT * FROM ' + quote(table) + where + ' ORDER BY rowid');
  statement.setReadBigInts(true);
  const hash = createHash('sha256'); let count = 0;
  for (const row of statement.iterate(...parameters)) { hash.update(encode(row) + '\n'); count++; }
  return { hash: hash.digest('hex'), count };
}
export function databaseSnapshot(filename) {
  return withDatabase(filename, db => {
    check(db.prepare('PRAGMA application_id').get().application_id === APPLICATION_ID, 'Database identity changed');
    check(db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok', 'Database integrity failed');
    check(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'Foreign key verification failed');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    const schema = db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name').all();
    const tables = Object.fromEntries(schema.filter(row => row.type === 'table').map(({ name }) => [name, rowDigest(db, name)]));
    return { version, schema, tables,
      users: readRows(db, 'SELECT id,role FROM users ORDER BY id'),
      sequence: readRows(db, 'SELECT * FROM sqlite_sequence ORDER BY name'),
      entitlements: version === 10 ? readRows(db, 'SELECT * FROM service_entitlements ORDER BY user_id') : [],
      auditMax: version === 10 ? readRows(db, 'SELECT COALESCE(MAX(id),0) AS n FROM service_entitlement_audit')[0].n : 0n };
  });
}
function unchangedTables(before, after, exceptions = []) {
  for (const [name, digest] of Object.entries(before.tables)) {
    if (!exceptions.includes(name)) check(equal(after.tables[name], digest), 'Existing rows changed');
  }
}
function additiveSchema(before, after) {
  check(before.version === 9 && after.version === 10, 'Migration version is invalid');
  for (const row of before.schema) check(after.schema.some(candidate => equal(candidate, row)), 'Existing schema object changed');
  const old = new Set(before.schema.map(row => row.type + ':' + row.name));
  const additions = after.schema.filter(row => !old.has(row.type + ':' + row.name)).map(row => [row.type, row.name]);
  check(equal(sortedObjects(additions), sortedObjects(NEW_OBJECTS)), 'Unexpected schema10 objects');
}
function exactSchema(before, after) {
  check(before.version === after.version && equal(before.schema, after.schema), 'Schema changed during recovery');
}
function verifyDisplayBackfill(filename) {
  withDatabase(filename, db => {
    let expectedCount = 0;
    for (const [kind, table, owner] of ENTITIES) {
      const records = readRows(db, `SELECT id,${owner} AS owner FROM ${quote(table)} ORDER BY ${owner},created_at,id`);
      const counters = new Map();
      for (const row of records) {
        const number = (counters.get(row.owner) ?? 0n) + 1n; counters.set(row.owner, number);
        const found = readRows(db, 'SELECT number FROM record_display_ids WHERE owner_user_id=? AND kind=? AND record_id=?', row.owner, kind, row.id);
        check(found.length === 1 && found[0].number === number, 'Display reference backfill changed record scope or ordering');
      }
      const actual = readRows(db, 'SELECT owner_user_id,last_number FROM record_display_counters WHERE kind=? ORDER BY owner_user_id', kind);
      check(actual.length === counters.size && actual.every(row => counters.get(row.owner_user_id) === row.last_number), 'Display reference counter mismatch');
      expectedCount += records.length;
    }
    check(readRows(db, 'SELECT COUNT(*) AS n FROM record_display_ids')[0].n === BigInt(expectedCount), 'Unexpected display references');
  });
}
async function verifyAssets(runtime, directory, manifest) {
  const { openAssetVault } = await load(runtime, 'private-assets.js');
  const vault = openAssetVault({ directory: join(directory, 'assets') });
  for (const asset of manifest.assets) vault.read(asset);
  check(equal(readdirSync(vault.directory).sort(), manifest.assets.map(asset => asset.id + '.blob').sort()), 'Original asset inventory changed');
  privateTree(directory);
}
function clearedSecurity(after) {
  for (const name of CLEARED) check(after.tables[name]?.count === 0, 'Restored security capability survived');
}
function recoveryPause(before, after, filename) {
  const trial = before.users.filter(row => row.role === 'trial');
  const old = new Map(before.entitlements.map(row => [row.user_id, row]));
  const current = new Map(after.entitlements.map(row => [row.user_id, row]));
  withDatabase(filename, db => {
    const appended = readRows(db, 'SELECT * FROM service_entitlement_audit WHERE id>? ORDER BY id', before.auditMax);
    check(appended.length === trial.length, 'Recovery audit count is invalid');
    if (before.tables.service_entitlement_audit) check(equal(
      rowDigest(db, 'service_entitlement_audit', ' WHERE id<=?', [before.auditMax]),
      before.tables.service_entitlement_audit), 'Prior service audit changed');
    for (const user of trial) {
      const previous = old.get(user.id), value = current.get(user.id);
      const audit = appended.filter(row => row.target_user_id === user.id);
      check(value && audit.length === 1, 'Recovery did not pause every ordinary account');
      check(value.enabled === 0n && value.expires_at === (previous?.expires_at ?? null) &&
        value.requests_per_hour === (previous?.requests_per_hour ?? 10n) &&
        value.version === (previous?.version ?? 0n) + 1n, 'Recovery service state differs from pause policy');
      check(audit[0].actor_user_id === 'owner' && audit[0].source === 'recovery' && audit[0].enabled === 0n &&
        audit[0].expires_at === value.expires_at && audit[0].requests_per_hour === value.requests_per_hour &&
        audit[0].version === value.version && audit[0].created_at === value.updated_at &&
        Number.isFinite(Date.parse(value.updated_at)), 'Recovery audit differs from paused state');
    }
    const ids = new Set(trial.map(row => row.id));
    check(equal(before.entitlements.filter(row => !ids.has(row.user_id)), after.entitlements.filter(row => !ids.has(row.user_id))), 'Recovery changed a non-trial service');
    const auditSequence = before.sequence.find(row => row.name === 'service_entitlement_audit')?.seq;
    const expected = auditSequence ?? 0n;
    const actual = after.sequence.find(row => row.name === 'service_entitlement_audit')?.seq;
    // SQLite records a zero AUTOINCREMENT high-water mark even when this
    // INSERT ... SELECT finds no trial accounts. It is still the sole allowed sequence change.
    check(actual === expected + BigInt(trial.length), 'Recovery audit sequence changed unexpectedly');
    check(equal(before.sequence.filter(row => row.name !== 'service_entitlement_audit'),
      after.sequence.filter(row => row.name !== 'service_entitlement_audit')), 'Existing sequence changed');
  });
}
async function reopenUnchanged(runtime, directory) {
  const { openStorage } = await load(runtime, 'storage.js');
  const before = privateTree(directory);
  openStorage({ filename: filenameIn(directory) }).close();
  check(equal(privateTree(directory), before), 'Repeated startup changed recovered data');
}

export async function rehearseMigration({ runtime, snapshot, output }) {
  distinct(snapshot, output); check(!existsSync(output), 'Rehearsal output already exists');
  const { backupPrivateData, verifyPrivateBackup } = await load(runtime, 'scripts/private-data-operations.js');
  const checked = verifyPrivateBackup({ input: snapshot });
  check(checked.schemaVersion === 9, 'Migration requires a schema9 backup');
  const original = privateTree(snapshot), before = databaseSnapshot(filenameIn(snapshot));
  // Deliberately BACKUP, never restore: restore expires valid sessions and grants.
  await backupPrivateData({ filename: filenameIn(snapshot), assetsDirectory: join(snapshot, 'assets'), output });
  check(equal(databaseSnapshot(filenameIn(output)), before), 'Backup-of-backup changed data');
  check(!existsSync(filenameIn(output) + '.service-reconfirm.json'), 'Ordinary migration gained a recovery fence');
  const { openStorage } = await load(runtime, 'storage.js');
  openStorage({ filename: filenameIn(output) }).close();
  const after = databaseSnapshot(filenameIn(output));
  additiveSchema(before, after); unchangedTables(before, after);
  for (const name of ['service_entitlements', 'service_entitlement_audit', 'service_usage', 'service_recovery_receipts'])
    check(after.tables[name].count === 0, 'Ordinary migration unexpectedly changed service access');
  verifyDisplayBackfill(filenameIn(output));
  await verifyAssets(runtime, output, checked.manifest);
  await reopenUnchanged(runtime, output);
  verifyPrivateBackup({ input: snapshot });
  check(equal(privateTree(snapshot), original), 'Migration modified the original backup');
  return { verified: true, schemaVersion: 10 };
}

// Ordinary updates and same-schema compatibility must never call restore:
// valid sessions, email actions, library grants and service state all survive.
// The caller supplies an already isolated source, never live storage. Opening
// the predecessor is permitted only on the new backup copy created here.
async function copyAndOpenSchema10({ runtime, source, output, requireManifest }) {
  distinct(source, output); check(!existsSync(output), 'Rehearsal output already exists');
  const original = privateTree(source), before = databaseSnapshot(filenameIn(source));
  check(before.version === 10, 'Same-schema check requires schema10');
  check(!existsSync(filenameIn(source) + '.service-reconfirm.json') &&
    !existsSync(filenameIn(source) + '.service-reconfirm.lock') && !existsSync(join(source, 'INCOMPLETE')),
  'Ordinary update source has a recovery fence');
  const originalAssets = privateTree(join(source, 'assets'));
  const { backupPrivateData, verifyPrivateBackup } = await load(runtime, 'scripts/private-data-operations.js');
  if (requireManifest) check(verifyPrivateBackup({ input: source }).schemaVersion === 10, 'Same-schema check requires a schema10 backup');
  await backupPrivateData({ filename: filenameIn(source), assetsDirectory: join(source, 'assets'), output });
  const checked = verifyPrivateBackup({ input: output });
  check(checked.schemaVersion === 10 && equal(databaseSnapshot(filenameIn(output)), before), 'Backup-of-backup changed data');
  check(equal(privateTree(join(output, 'assets')), originalAssets), 'Backup changed original assets');
  const { openStorage } = await load(runtime, 'storage.js');
  openStorage({ filename: filenameIn(output) }).close();
  const after = databaseSnapshot(filenameIn(output));
  exactSchema(before, after); unchangedTables(before, after);
  check(equal(after, before), 'Same-schema startup changed rows or sequences');
  check(!existsSync(filenameIn(output) + '.service-reconfirm.json') &&
    !existsSync(filenameIn(output) + '.service-reconfirm.lock'), 'Ordinary update gained a recovery fence');
  await verifyAssets(runtime, output, checked.manifest);
  check(equal(privateTree(join(output, 'assets')), originalAssets), 'Startup changed original assets');
  await reopenUnchanged(runtime, output);
  if (requireManifest) verifyPrivateBackup({ input: source });
  check(equal(privateTree(source), original), 'Same-schema rehearsal modified its source');
  return { verified: true, schemaVersion: 10 };
}

export async function rehearseSameSchema({ runtime, snapshot, output }) {
  return copyAndOpenSchema10({ runtime, source: snapshot, output, requireManifest: true });
}

export async function rehearseCompatible({ runtime, source, output }) {
  // Candidate writes may make its old backup manifest stale. Capture current
  // SQLite state using the backup API, then open only this isolated new copy.
  return copyAndOpenSchema10({ runtime, source, output, requireManifest: false });
}

export async function rehearseRoundTrip({ runtime, source, snapshot, output }) {
  distinct(source, snapshot, output);
  check(!existsSync(snapshot) && !existsSync(output), 'Recovery output already exists');
  const { backupPrivateData, verifyPrivateBackup, restorePrivateBackup } = await load(runtime, 'scripts/private-data-operations.js');
  const original = privateTree(source), before = databaseSnapshot(filenameIn(source));
  check(before.version === 10, 'Round-trip requires schema10');
  await backupPrivateData({ filename: filenameIn(source), assetsDirectory: join(source, 'assets'), output: snapshot });
  const checked = verifyPrivateBackup({ input: snapshot }), backupTree = privateTree(snapshot);
  check(checked.schemaVersion === 10 && equal(databaseSnapshot(filenameIn(snapshot)), before), 'Backup changed schema10 data');
  const restored = await restorePrivateBackup({ input: snapshot, output });
  check(restored.verified && restored.schemaVersion === 10 && restored.serviceRecovery === 'paused-in-copy' && restored.preserveRestoreDirectory === true, 'Schema10 recovery contract changed');
  const after = databaseSnapshot(restored.filename);
  exactSchema(before, after);
  unchangedTables(before, after, [...CLEARED, 'service_entitlements', 'service_entitlement_audit', 'sqlite_sequence']);
  clearedSecurity(after); recoveryPause(before, after, restored.filename);
  check(!existsSync(restored.filename + '.service-reconfirm.json'), 'Schema10 restore gained a historical fence');
  await verifyAssets(runtime, output, checked.manifest);
  await reopenUnchanged(runtime, output);
  verifyPrivateBackup({ input: snapshot });
  check(equal(privateTree(snapshot), backupTree), 'Restore modified its backup');
  check(equal(privateTree(source), original), 'Round-trip modified its source');
  return { verified: true, schemaVersion: 10 };
}

export async function rehearseHistoricalRestore({ runtime, snapshot, output }) {
  distinct(snapshot, output); check(!existsSync(output), 'Historical recovery output already exists');
  const { restorePrivateBackup, verifyPrivateBackup } = await load(runtime, 'scripts/private-data-operations.js');
  const checked = verifyPrivateBackup({ input: snapshot });
  check(checked.schemaVersion === 9, 'Historical rehearsal requires schema9');
  const original = privateTree(snapshot), before = databaseSnapshot(filenameIn(snapshot));
  const restored = await restorePrivateBackup({ input: snapshot, output });
  check(restored.verified && restored.schemaVersion === 9 && restored.serviceRecovery === 'schema10-startup-fence' && restored.preserveRestoreDirectory === true, 'Historical recovery contract changed');
  const fenced = databaseSnapshot(restored.filename);
  exactSchema(before, fenced); unchangedTables(before, fenced, CLEARED); clearedSecurity(fenced);
  const marker = restored.filename + '.service-reconfirm.json';
  privateInfo(marker); privateTree(output);
  check(equal(readdirSync(output).sort(), ['assets', 'nestlet.sqlite', 'nestlet.sqlite.service-reconfirm.json']), 'Historical restore directory is incomplete');
  const { readServiceRecoveryFence } = await load(runtime, 'service-recovery.js');
  const fence = readServiceRecoveryFence(restored.filename);
  check(fence?.sourceSchema === 9 && fence.databaseSha256 === fileDigest(restored.filename), 'Historical fence does not match restored data');
  const { openStorage } = await load(runtime, 'storage.js');
  openStorage({ filename: restored.filename }).close();
  const after = databaseSnapshot(restored.filename);
  additiveSchema(fenced, after); unchangedTables(fenced, after, ['sqlite_sequence']);
  recoveryPause(fenced, after, restored.filename); verifyDisplayBackfill(restored.filename);
  check(after.tables.service_usage.count === 0, 'Historical recovery invented usage');
  withDatabase(restored.filename, db => {
    const receipts = readRows(db, 'SELECT * FROM service_recovery_receipts');
    check(receipts.length === 1 && receipts[0].recovery_id === fence.recoveryId && receipts[0].source_schema === 9n &&
      receipts[0].source_sha256 === fence.databaseSha256 && Number.isFinite(Date.parse(receipts[0].applied_at)), 'Historical recovery receipt is invalid');
  });
  check(!existsSync(marker) && !existsSync(restored.filename + '.service-reconfirm.lock'), 'Historical fence was not consumed after commit');
  await verifyAssets(runtime, output, checked.manifest);
  await reopenUnchanged(runtime, output);
  verifyPrivateBackup({ input: snapshot });
  check(equal(privateTree(snapshot), original), 'Historical recovery modified its backup');
  return { verified: true, schemaVersion: 10 };
}

export async function rehearseFutureRefusal({ runtime, snapshot, output }) {
  distinct(snapshot, output); check(!existsSync(output), 'Future check output already exists');
  const { backupPrivateData, verifyPrivateBackup, restorePrivateBackup } = await load(runtime, 'scripts/private-data-operations.js');
  const checked = verifyPrivateBackup({ input: snapshot });
  check([9, 10].includes(checked.schemaVersion), 'Future check requires a schema9 or schema10 backup');
  const original = privateTree(snapshot);
  await backupPrivateData({ filename: filenameIn(snapshot), assetsDirectory: join(snapshot, 'assets'), output });
  // Only this newly created isolated copy receives the unsupported header.
  const db = new DatabaseSync(filenameIn(output));
  try { db.exec('PRAGMA user_version=11'); } finally { db.close(); }
  // Keep the isolated manifest internally consistent: restore must refuse the
  // unsupported version, rather than merely noticing a deliberately stale hash.
  const manifestPath = join(output, 'manifest.json'); privateInfo(manifestPath);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.schemaVersion = 11; manifest.databaseSha256 = fileDigest(filenameIn(output));
  writeFileSync(manifestPath, JSON.stringify(manifest) + '\n', {
    flag: constants.O_WRONLY | constants.O_TRUNC | constants.O_NOFOLLOW, mode: 0o600 });
  const before = privateTree(output), { openStorage } = await load(runtime, 'storage.js');
  let code;
  try { openStorage({ filename: filenameIn(output) }).close(); } catch (error) { code = error.code; }
  check(code === 'STORAGE_VERSION_UNSUPPORTED', 'Candidate accepted a future schema');
  check(equal(privateTree(output), before), 'Future startup refusal changed data');
  const rejected = output + '-rejected-backup'; check(!existsSync(rejected), 'Refusal target already exists');
  let failed = false;
  try { await backupPrivateData({ filename: filenameIn(output), assetsDirectory: join(output, 'assets'), output: rejected }); } catch { failed = true; }
  check(failed && !existsSync(rejected), 'Future backup was accepted or wrote output');
  const rejectedRestore = output + '-rejected-restore'; check(!existsSync(rejectedRestore), 'Restore refusal target already exists');
  failed = false;
  try { await restorePrivateBackup({ input: output, output: rejectedRestore }); } catch { failed = true; }
  check(failed && !existsSync(rejectedRestore), 'Invalid future snapshot was restored');
  check(equal(privateTree(output), before) && equal(privateTree(snapshot), original), 'Future refusal changed evidence');
  return { verified: true };
}

export async function rehearsePredecessorRefusal({ runtime, source }) {
  absolute(source); check(databaseSnapshot(filenameIn(source)).version === 10, 'Predecessor check requires schema10 copy');
  const before = privateTree(source), { openStorage } = await load(runtime, 'storage.js');
  let code;
  try { openStorage({ filename: filenameIn(source) }).close(); } catch (error) { code = error.code; }
  check(code === 'STORAGE_VERSION_UNSUPPORTED', 'Predecessor accepted schema10');
  check(equal(privateTree(source), before), 'Predecessor refusal changed data');
  return { verified: true };
}

const commands = {
  migration: [rehearseMigration, ['runtime', 'snapshot', 'output']],
  'same-schema': [rehearseSameSchema, ['runtime', 'snapshot', 'output']],
  compatible: [rehearseCompatible, ['runtime', 'source', 'output']],
  roundtrip: [rehearseRoundTrip, ['runtime', 'source', 'snapshot', 'output']],
  historical: [rehearseHistoricalRestore, ['runtime', 'snapshot', 'output']],
  future: [rehearseFutureRefusal, ['runtime', 'snapshot', 'output']],
  predecessor: [rehearsePredecessorRefusal, ['runtime', 'source']]
};
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const command = process.argv[2];
  try {
    check(Object.hasOwn(commands, command), 'Unknown rehearsal command');
    const [run, names] = commands[command], values = process.argv.slice(3), options = {};
    check(values.length === names.length * 2, 'Invalid rehearsal arguments');
    for (let i = 0; i < values.length; i += 2) {
      const name = values[i].slice(2);
      check(values[i].startsWith('--') && names.includes(name) && !Object.hasOwn(options, name), 'Invalid rehearsal argument');
      absolute(values[i + 1]); options[name] = values[i + 1];
    }
    check(names.every(name => Object.hasOwn(options, name)), 'Missing rehearsal argument');
    await run(options);
    process.stdout.write('Schema10 rehearsal passed.\n');
  } catch {
    process.stderr.write('Schema10 rehearsal failed; retain private evidence for operator review.\n');
    process.exitCode = 1;
  }
}
