#!/usr/bin/env node
// Synthetic cross-version drill only. Arguments are local reviewed source roots.
// No Docker, credentials, provider calls, production paths or network access.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const [oldRoot, nextRoot] = process.argv.slice(2).map(value=>resolve(value));
assert.ok(oldRoot && nextRoot, 'Supply old and candidate source roots');
const load = (root, file) => import(pathToFileURL(join(root, file)));
const contract = 'storage.js public/core.js document-context.js case-records.js auth.js telemetry.js asset-domain.js asset-records.js private-assets.js asset-image-worker.js scripts/private-data.js scripts/private-data-operations.js'.split(' ');
for (const file of contract) assert.ok(readFileSync(join(oldRoot,file)).equals(readFileSync(join(nextRoot,file))), 'Persisted contract differs: '+file);
const old = await load(oldRoot,'storage.js'), next = await load(nextRoot,'storage.js');
const assets = await load(oldRoot,'private-assets.js');
const {createLibraryToolSession} = await load(nextRoot,'agent-library-tools.js');
const {librarySourceEvent} = await load(nextRoot,'chat.js');
const root=mkdtempSync('/tmp/nestlet-schema4-compat-');
const filename=join(root,'live','nestlet.sqlite'), assetsDirectory=join(root,'live','assets');
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
function cli(source,args) {
  const r=spawnSync(process.execPath,['scripts/private-data.js',...args],{cwd:source,encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const s=JSON.parse(r.stdout);assert.equal(s.verified,true);assert.equal(s.schemaVersion,4);assert.equal(s.assetCount,1);
  assert.ok(!r.stdout.includes(root));return s;
}
function reopenWithoutChanges(module,path) {
  const before=hash(path);const store=module.openStorage({filename:path});store.close();
  assert.ok(hash(path)===before,'Schema4 reopen changed database bytes');
  const db=new DatabaseSync(path,{readOnly:true});
  assert.equal(db.prepare('PRAGMA user_version').get().user_version,4);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);db.close();
}
try {
  let store=old.openStorage({filename});
  const client=store.createClient('owner',{displayName:'Synthetic compatibility customer'});
  const record=store.createCase('owner',{title:'Synthetic compatibility case',sourceText:'Synthetic retained source',fields:[],draftType:'followup',draftText:'',clientId:client.id});
  const conversation=store.createConversation('owner',record.id,{title:'Synthetic compatibility conversation'});
  const vault=assets.openAssetVault({directory:assetsDirectory}), bytes=Buffer.from('Synthetic retained original evidence');
  const asset=store.createAsset('owner',await assets.parseAsset(bytes,{originalFilename:'synthetic-original.txt',mimeType:'text/plain'}),{caseId:record.id},id=>vault.write(id,bytes));
  store.close();
  reopenWithoutChanges(next,filename);reopenWithoutChanges(old,filename);
  // Actual candidate read tools and citation formatter, without any model call.
  store=next.openStorage({filename});
  const library=createLibraryToolSession({storage:store,userId:'owner',libraryConsent:true,currentCaseId:record.id,signal:new AbortController().signal});
  library.executeRound([{id:'synthetic-search',type:'function',function:{name:'search_library',arguments:JSON.stringify({kind:'asset',query:'Synthetic',clientId:null,caseId:record.id})}}]);
  library.executeRound([{id:'synthetic-read',type:'function',function:{name:'read_library',arguments:JSON.stringify({kind:'asset',id:asset.id,offset:0})}}]);
  const requestId=randomUUID(),sources=librarySourceEvent(library,requestId,'en');
  assert.ok(sources.items.some(item=>item.id===asset.id && item.retrievalState==='read'));
  const user=store.appendMessage('owner',conversation.id,{role:'user',content:'Review synthetic saved evidence',state:'complete',requestId,clientMessageId:randomUUID(),imageMetadata:[]});
  const content='Synthetic answer [S1]'+sources.appendix;
  const assistant=store.appendMessage('owner',conversation.id,{role:'assistant',content,state:'complete',requestId,imageMetadata:[]});
  store.close();
  // Old runtime still reads newly written citation text through its unchanged API.
  store=old.openStorage({filename});
  const history=store.listMessages('owner',conversation.id);
  assert.equal(history[0].id,user.id);assert.equal(history[1].id,assistant.id);assert.equal(history[1].content,content);
  assert.equal(store.getCase('owner',record.id).version,record.version);
  assert.equal(store.getCase('owner',record.id).clientId,client.id);
  assert.deepEqual(vault.read(store.getAsset('owner',asset.id)),bytes);store.close();
  for(const mode of ['DELETE','WAL']) {
    let writer;
    if(mode==='WAL') {writer=new DatabaseSync(filename);writer.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;');writer.prepare('UPDATE cases SET version=version+1 WHERE id=?').run(record.id);}
    const sourceHash=hash(filename),walHash=writer?hash(filename+'-wal'):null;
    const recovery=join(root,mode);mkdirSync(recovery,{mode:0o700});
    const backup=join(recovery,'schema4'),restored=join(recovery,'rehearsal');
    cli(nextRoot,['backup','--db',filename,'--assets',assetsDirectory,'--output',backup]);
    cli(nextRoot,['verify','--input',backup]);
    cli(nextRoot,['restore','--input',backup,'--output',restored]);
    assert.ok(hash(filename)===sourceHash);if(writer)assert.ok(hash(filename+'-wal')===walHash);
    reopenWithoutChanges(next,join(restored,'nestlet.sqlite'));
    reopenWithoutChanges(old,join(restored,'nestlet.sqlite'));
    const shell=readFileSync(new URL('./nestlet-update-schema4.sh',import.meta.url),'utf8');
    const section=shell.slice(shell.indexOf('rehearse_storage() {'));
    const embedded=section.match(/node --input-type=module -e '\n([\s\S]*?)' \\/)[1].replaceAll('/recovery',recovery);
    for(const source of [nextRoot,oldRoot]) {
      const r=spawnSync(process.execPath,['--input-type=module','-e',embedded],{cwd:source,encoding:'utf8'});
      assert.equal(r.status,0,r.stderr);
    }
    cli(oldRoot,['verify','--input',backup]);
    const restoredStore=old.openStorage({filename:join(restored,'nestlet.sqlite')});
    assert.equal(restoredStore.listMessages('owner',conversation.id)[1].content,content);
    assert.equal(restoredStore.getCase('owner',record.id).version,record.version+(writer?1:0));
    assert.deepEqual(assets.openAssetVault({directory:join(restored,'assets')}).read(restoredStore.getAsset('owner',asset.id)),bytes);
    restoredStore.close();
    assert.equal(statSync(backup).mode&0o777,0o700);assert.equal(statSync(join(backup,'nestlet.sqlite')).mode&0o777,0o600);
    assert.deepEqual(readdirSync(backup).sort(),['assets','manifest.json','nestlet.sqlite']);
    writer?.close();
  }
  console.log('PASS: identical persisted contract; candidate-to-prior schema4 byte preservation; actual new retrieval citations readable by old runtime; private original bytes/IDs/case versions retained; actual CLI DELETE and live-WAL backup/verify/restore and old/new reopen passed. No provider/production access.');
} finally { rmSync(root,{recursive:true,force:true}); }
