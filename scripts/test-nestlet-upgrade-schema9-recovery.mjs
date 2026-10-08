#!/usr/bin/env node
// Local synthetic schema7-to-schema9 drill. No Docker, private inputs, provider or network.
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
assert.equal(spawnSync('git',['-C',oldRoot,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),'05923a88156d8d2d1c497d22c3ef56414452d063');
assert.equal(spawnSync('git',['-C',nextRoot,'rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),'bbd240cf35069af97b7d684690bbd12b747ff503','Require final reviewed merge SHA');
for(const source of [oldRoot,nextRoot]) assert.equal(spawnSync('git',['-C',source,'status','--porcelain','--untracked-files=all'],{encoding:'utf8'}).stdout.trim(),'','Source must be clean');
const old = await load(oldRoot, 'storage.js'), next = await load(nextRoot, 'storage.js');
const assets = await load(oldRoot, 'private-assets.js');
const root = mkdtempSync('/tmp/nestlet-schema7-recovery-');
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
function cli(source, args, version = 7) {
  const result = spawnSync(process.execPath, ['scripts/private-data.js', ...args], { cwd: source, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.verified, true); assert.equal(report.schemaVersion, version); assert.equal(report.assetCount, 2);
  assert.ok(!result.stdout.includes(root));
}
const shell = readFileSync(new URL('./nestlet-upgrade-schema9.sh', import.meta.url), 'utf8');
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
  const salt = randomBytes(16), passwordHash = `scrypt$${salt.toString('base64url')}$${scryptSync('synthetic-schema7-drill-only', salt, 32).toString('base64url')}`;
  const owners = ['owner', store.createTrialUser({ username: 'synthetic-legacy-user', passwordHash }).id];
  // Populate existing email data; schema7 accounts may already be in active use.
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
  const priorRecord=store.createCase('owner',{title:'Synthetic historical review',sourceText:'',fields:[],draftType:'followup',draftText:''});
  const priorConversation=store.createConversation('owner',priorRecord.id,{});
  const priorMessage=store.appendMessage('owner',priorConversation.id,{role:'assistant',content:'Synthetic historical evidence',state:'complete'});
  const priorIntent=store.conversationReviews.prepare('owner',priorRecord.id,{clientRequestId:randomUUID(),locale:'en',conversationAction:{action:'prepare_case_suggestion',expectedVersion:priorRecord.version,sourceConversationId:priorConversation.id,sourceMessageId:priorMessage.id,factChanges:{rent:{value:'$2200'}},changes:{}}});
  const priorReply={conversationId:priorConversation.id,expectedVersion:priorRecord.version,clientMessageId:randomUUID(),answer:'confirm'};
  store.conversationReviews.reply('owner',priorRecord.id,priorIntent.intent.id,priorReply);
  const actor={userId:'owner',role:'owner'};
  store.accountAdministration.setAdministrator(actor,owners[1],{administrator:true,expectedVersion:0});
  store.accountAdministration.setAdministrator(actor,owners[1],{administrator:false,expectedVersion:1});
  store.accountAdministration.setAdministrator(actor,owners[1],{administrator:true,expectedVersion:2});
  const predecessorAudit=store.accountAdministration.audit(actor);
  assert.equal(predecessorAudit.events.length,3);
  store.close();
  let db = new DatabaseSync(filename);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 7);
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
    const backup = join(recovery, 'schema7'), rehearsal = join(recovery, 'rehearsal');
    cli(nextRoot, ['backup', '--db', filename, '--assets', assetsDirectory, '--output', backup]);
    cli(nextRoot, ['verify', '--input', backup]);
    cli(nextRoot, ['restore', '--input', backup, '--output', rehearsal]);
    assert.ok(hash(filename) === sourceHash); if (writer) assert.ok(hash(filename + '-wal') === walHash);
    assert.deepEqual(snapshot(join(rehearsal, 'nestlet.sqlite')), original);
    if(expiredTelemetry) {
      // Supported-state refusal: preserve strict checks when startup maintenance changes old telemetry.
      embedded('rehearse_additive_migration',recovery,nextRoot,true);
      assert.ok(hash(filename)===sourceHash);if(writer)assert.ok(hash(filename+'-wal')===walHash);
      assert.deepEqual(snapshot(join(backup,'nestlet.sqlite')),original);
      cli(nextRoot,['verify','--input',backup]);cli(oldRoot,['verify','--input',backup]);
      writer?.close();continue;
    }
    embedded('rehearse_additive_migration', recovery);
    const migratedFile = join(rehearsal, 'nestlet.sqlite'), migratedHash = hash(migratedFile);
    // The pinned predecessor must refuse schema9 without altering bytes.
    assert.throws(()=>old.openStorage({filename:migratedFile}),error=>error.code==="STORAGE_VERSION_UNSUPPORTED");
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
    // Synthetic only: exercise populated grants and immutable audit history.
    assert.deepEqual(store.accountAdministration.audit(actor),predecessorAudit);
    assert.equal(store.accountAdministration.administrator(owners[1]),true);
    store.accountAdministration.setAdministrator(actor,owners[1],{administrator:false,expectedVersion:3});
    store.accountAdministration.setAdministrator(actor,owners[1],{administrator:true,expectedVersion:4});
    const audit=store.accountAdministration.audit(actor);assert.equal(audit.events.length,5);store.close();
    const candidate=next.openStorage({filename:join(recovery,'rehearsal','nestlet.sqlite')});
    const {handleCaseRecords}=await load(nextRoot,'case-records.js');
    const fixture=records[0], current=candidate.getCase(fixture.owner,fixture.record.id);
    const request={action:'prepare_answer_draft',expectedVersion:current.version,sourceConversationId:fixture.conversation.id,sourceMessageId:fixture.message.id,kind:'followup'};
    const draft=candidate.createConversationAnswerDraft(fixture.owner,current.id,request);
    assert.equal(draft.status,'draft');assert.match(draft.content,/UNREVIEWED/);
    const {kind,...origin}=request;
    const suggestion={...origin,action:'prepare_case_suggestion',factChanges:{rent:{value:'$2,200'}},changes:{recipientName:{value:'Synthetic recipient'}}};
    let applied;
    await handleCaseRecords({request:{method:'PATCH'},response:{},url:new URL('http://synthetic.invalid/api/cases/'+current.id+'/document-context'),session:{userId:fixture.owner},storage:candidate,readJson:async()=>({conversationAction:suggestion}),json:(status,body)=>{assert.equal(status,200);applied=body.case;}});
    assert.equal(applied.fields.find(field=>field.key==='rent').confirmed,false);
    assert.equal(applied.documentContext.recipientName.confirmed,false);
    const expectedDraft=candidate.getArtifact(fixture.owner,draft.id);
    const receipts=[];
    for(const state of ['pending','applied','cancelled','undone']) {
      const record=candidate.createCase(fixture.owner,{title:'Synthetic receipt '+state,sourceText:'',fields:[],draftType:'followup',draftText:''});
      const conversation=candidate.createConversation(fixture.owner,record.id,{});
      const message=candidate.appendMessage(fixture.owner,conversation.id,{role:'assistant',content:'Synthetic receipt source',state:'complete'});
      const request={clientRequestId:randomUUID(),locale:'en',conversationAction:{action:'prepare_case_suggestion',expectedVersion:record.version,sourceConversationId:conversation.id,sourceMessageId:message.id,factChanges:{rent:{value:'$2200'}},changes:{}}};
      const prepared=candidate.conversationReviews.prepare(fixture.owner,record.id,request);
      const reply={conversationId:conversation.id,expectedVersion:record.version,clientMessageId:randomUUID(),answer:state==='cancelled'?'cancel':'confirm'};
      let undo;
      if(state!=='pending') {
        const result=candidate.conversationReviews.reply(fixture.owner,record.id,prepared.intent.id,reply);
        if(state==='undone') {
          undo={conversationId:conversation.id,expectedVersion:result.case.version,clientMessageId:randomUUID()};
          candidate.conversationReviews.undo(fixture.owner,record.id,prepared.intent.id,undo);
        }
      }
      receipts.push({state,caseId:record.id,id:prepared.intent.id,reply,undo});
    }
    const {LIBRARY_PERMISSION_SCOPE}=await load(nextRoot,'library-consent-storage.js');
    for(const owner of owners) {
      assert.equal(candidate.libraryPermissions.read(owner).decision,'unset');
      assert.throws(()=>candidate.libraryPermissions.assertAllowed(owner,0),error=>error.code==='LIBRARY_CONSENT_REQUIRED');
    }
    candidate.libraryPermissions.set(owners[0],{decision:'allow',expectedVersion:0,...LIBRARY_PERMISSION_SCOPE});
    candidate.libraryPermissions.set(owners[1],{decision:'deny',expectedVersion:0,...LIBRARY_PERMISSION_SCOPE});
    const {createOperatorAuth}=await load(nextRoot,'auth.js');
    const authFor=storage=>createOperatorAuth({passwordHash,publicOrigin:'https://synthetic.invalid',sessionStore:storage.authSessions,findTrialUser:name=>storage.findUserByUsername(name),findTrialUserById:id=>storage.getUserById(id)});
    const login=authFor(candidate),sessions=[await login.login('synthetic-schema7-drill-only','owner',true),await login.login('synthetic-schema7-drill-only','synthetic-legacy-user')];
    const sessionRequest=session=>({headers:{cookie:session.cookie.split(';')[0],'x-csrf-token':session.csrfToken}});
    assert.equal(candidate.authSessions.size,2);
    candidate.close();
    const reopened=next.openStorage({filename:join(recovery,'rehearsal','nestlet.sqlite')}),restarted=authFor(reopened);
    for(const session of sessions){const current=restarted.getSession(sessionRequest(session));assert.equal(current.userId,session.userId);assert.ok(restarted.csrfValid(sessionRequest(session),current));}
    assert.equal(reopened.libraryPermissions.read(owners[0]).decision,'allow');
    assert.equal(reopened.libraryPermissions.read(owners[1]).decision,'deny');
    reopened.close();
    embedded('rehearse_schema9_backup',recovery);
    const sourceStillLive=next.openStorage({filename:join(recovery,'rehearsal','nestlet.sqlite')});
    const sourceAuth=authFor(sourceStillLive);
    for(const session of sessions)assert.equal(sourceAuth.getSession(sessionRequest(session)).userId,session.userId);
    assert.equal(sourceStillLive.libraryPermissions.read(owners[0]).decision,'allow');
    assert.equal(sourceStillLive.libraryPermissions.read(owners[1]).decision,'deny');
    sourceStillLive.close();
    embedded('rehearse_predecessor_refusal',recovery,oldRoot);
    const restored=next.openStorage({filename:join(recovery,'schema9-restored','nestlet.sqlite')});
    assert.equal(restored.authSessions.size,0);
    for(const owner of owners){assert.equal(restored.libraryPermissions.read(owner).decision,'unset');assert.equal(restored.libraryPermissions.read(owner).version,0);assert.throws(()=>restored.libraryPermissions.assertAllowed(owner,0),error=>error.code==='LIBRARY_CONSENT_REQUIRED');}
    for(const session of sessions)assert.equal(authFor(restored).getSession(sessionRequest(session)),null);
    assert.equal(restored.conversationReviews.reply('owner',priorRecord.id,priorIntent.intent.id,priorReply).replayed,true);
    assert.equal(restored.accountAdministration.administrator(owners[1]),true);assert.deepEqual(restored.accountAdministration.audit(actor),audit);
    assert.deepEqual(restored.getCase(fixture.owner,current.id),applied);
    assert.deepEqual(restored.getArtifact(fixture.owner,draft.id),expectedDraft);
    assert.equal(restored.getCase(fixture.owner,current.id).documentContext.recipientName.sourceMessageId,fixture.message.id);
    assert.equal(restored.getCase(fixture.owner,current.id).fields.find(field=>field.key==='rent').confirmed,false);
    for(const receipt of receipts) {
      assert.equal(restored.conversationReviews.read(fixture.owner,receipt.caseId,receipt.id).intent.state,receipt.state);
      if(receipt.state==='applied'||receipt.state==='cancelled')assert.equal(restored.conversationReviews.reply(fixture.owner,receipt.caseId,receipt.id,receipt.reply).replayed,true);
      if(receipt.state==='undone')assert.equal(restored.conversationReviews.undo(fixture.owner,receipt.caseId,receipt.id,receipt.undo).replayed,true);
    }
    restored.close();
    cli(nextRoot, ['restore', '--input', backup, '--output', join(recovery, 'future-check')]);
    embedded('rehearse_future_refusal', recovery);
    // Reverify the untouched original recovery point with both reviewed CLIs.
    cli(nextRoot, ['verify', '--input', backup]);cli(oldRoot, ['verify', '--input', backup]);
    assert.equal(statSync(backup).mode & 0o777, 0o700);
    assert.equal(statSync(join(backup, 'nestlet.sqlite')).mode & 0o777, 0o600);
    assert.equal(statSync(join(backup, 'manifest.json')).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(backup).sort(), ['assets', 'manifest.json', 'nestlet.sqlite']);
    writer?.close();
  }
  if(expiredTelemetry)console.log('PASS: expired synthetic telemetry causes exact rehearsal refusal; original DELETE/WAL source and pre7 recovery snapshot remain unchanged. Supported-state limitation, not an aged-data migration success.');
  else console.log('PASS: pinned05923a8 predecessor and explicit candidate; DELETE/WAL private backup and restore, exact additive-schema rehearsal, all prior rows/schema/high-water/originals preserved, populated email and capability audit round-trip, owner/trial sessions survive reopen with valid CSRF; backup preserves sessions and allow/deny library choices; only restored copies clear both security-state tables; schema9 restore reads candidate-written unreviewed draft and applied-unconfirmed suggestions exactly, predecessor7 and future10 refusal. Synthetic only; no runtime fallback authorization.');
} finally { rmSync(root, { recursive: true, force: true }); }
