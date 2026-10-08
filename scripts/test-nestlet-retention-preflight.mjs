// Execute the actual release pre-stop query against synthetic data only.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const source=readFileSync(new URL('./nestlet-upgrade-schema10.sh',import.meta.url),'utf8');
const part=source.slice(source.indexOf('preflight_telemetry_preservation() {'));
const original=part.match(/node --input-type=module -e '\n([\s\S]*?)' >/)[1];
const app=resolve(process.env.NESTLET_CANDIDATE_ROOT||'');assert.ok(process.env.NESTLET_CANDIDATE_ROOT);
const root=mkdtempSync(join(tmpdir(),'nestlet-retention-synthetic-'));
try{
 for(const kind of ['current','expired','orphan','excess']){
  const filename=join(root,kind+'.sqlite'),db=new DatabaseSync(filename);
  db.exec('CREATE TABLE telemetry_events(id INTEGER PRIMARY KEY,workflow_id TEXT,created_at TEXT);CREATE TABLE telemetry_workflows(id TEXT,updated_at TEXT)');
  const now=new Date().toISOString(),old=new Date(Date.now()-31*86400000).toISOString();
  db.prepare('INSERT INTO telemetry_workflows VALUES(?,?)').run('workflow',kind==='orphan'?old:now);
  if(kind!=='orphan'){
   db.exec('BEGIN');const insert=db.prepare('INSERT INTO telemetry_events(workflow_id,created_at) VALUES(?,?)');
   for(let n=0;n<(kind==='excess'?20001:1);n++)insert.run('workflow',kind==='expired'?old:now);
   db.exec('COMMIT');
  }
  db.close();const before=readFileSync(filename);
  const code=original.replace('/data/nestlet.sqlite',filename).replace('./telemetry.js',pathToFileURL(join(app,'telemetry.js')).href);
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8'});
  assert.equal(result.status,kind==='current'?0:1,kind+': '+result.stderr);assert.equal(result.stdout,'');assert.equal(result.stderr,'');assert.deepEqual(readFileSync(filename),before);
 }
 console.log('Four synthetic retention/count preflight cases passed without data changes or output.');
}finally{rmSync(root,{recursive:true,force:true});}
