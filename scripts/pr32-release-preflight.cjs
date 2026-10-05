// Strict read-only inventory: no PM2 RPC/CLI, SQLite connection, app initialization or mutations.
// Reads /proc, .env configuration candidates and filesystem metadata; never logs env or full argv.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = '/opt/jiesong-system';
function assert(value, message) { if (!value) throw new Error(message); }
function safeText(value, kind) {
  assert(typeof value === 'string' && value.length > 0 && value.length <= 2048, 'invalid metadata');
  assert(!/[\x00-\x1f\x7f]/.test(value), 'control character in metadata');
  if (kind === 'comm') assert(/^[a-zA-Z0-9_.:/+ -]{1,64}$/.test(value), 'unexpected process label');
  if (kind === 'path') assert(path.isAbsolute(value) && /^[a-zA-Z0-9_./+ -]+$/.test(value), 'unexpected path');
  return value;
}
function parseSetting(text, key) {
  // Conservative single-line dotenv subset. Ambiguity is a blocker, never a guessed value.
  const lines = text.split(/\r?\n/).filter(l => new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(l));
  if (!lines.length) return null;
  assert(lines.length === 1, 'duplicate setting');
  const raw = lines[0].replace(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*`),'');
  const match = raw.match(/^(?:"([^"\\]*)"|'([^'\\]*)'|([^\s#'"\\]+))\s*(?:#.*)?$/);
  assert(match, 'unsupported setting syntax');
  return match[1] ?? match[2] ?? match[3];
}
function databasePath(value) {
  assert(typeof value === 'string' && value.startsWith('file:/'), 'absolute SQLite URL required');
  const p = value.slice(5);
  assert(path.isAbsolute(p) && !/[?#\0\n\r]/.test(p), 'plain absolute SQLite path required');
  const resolved = fs.realpathSync(p);
  assert(fs.statSync(resolved).isFile(), 'database must be regular file');
  return safeText(resolved,'path');
}
function nodeEnvStatus(initialValue, fileValue) {
  // dotenv does not override a variable already present at process startup.
  return {node_env_production:(initialValue ?? fileValue)==='production',
    node_env_candidate_source:initialValue != null?'initial-process-environment':
      fileValue != null?'dotenv-file-only':'default-development'};
}
function summarizeProcess(p) {
  assert(Number.isInteger(p.pid) && p.pid > 0, 'invalid PID');
  safeText(p.comm,'comm'); safeText(p.cwd,'path');
  assert(['backend-cwd','frontend-cwd','root-cwd'].includes(p.role), 'invalid role');
  if(p.database_candidate) safeText(p.database_candidate,'path');
  if(p.node_env_production !== undefined || p.node_env_candidate_source !== undefined) {
    assert(typeof p.node_env_production==='boolean', 'invalid runtime environment status');
    assert(['initial-process-environment','dotenv-file-only','default-development'].includes(p.node_env_candidate_source), 'invalid runtime environment source');
  }
  return {pid:p.pid,comm:p.comm,cwd:p.cwd,role:p.role,pm_id:p.pm_id,
    database_candidate:p.database_candidate,database_candidate_source:p.database_candidate_source,
    node_env_production:p.node_env_production,node_env_candidate_source:p.node_env_candidate_source};
}
function inspect() {
  const actualRoot = safeText(fs.realpathSync(root),'path');
  const backend = fs.realpathSync(path.join(root,'backend'));
  const frontend = fs.realpathSync(path.join(root,'frontend'));
  const sha = execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8',timeout:10000,
    stdio:['ignore','pipe','pipe']}).trim();
  assert(/^[a-f0-9]{40}$/.test(sha),'invalid deployed SHA');
  const envPath = path.join(backend,'.env');
  const envStat = fs.statSync(envPath);
  assert((envStat.mode & 0o077)===0, 'private env permissions too broad');
  const envText = fs.readFileSync(envPath,'utf8');
  const fileCandidate = parseSetting(envText,'DATABASE_URL');
  const fileNodeEnv = parseSetting(envText,'NODE_ENV');
  const processes = [], unreadable = [];
  for (const pidText of fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n))) {
    try {
      const cwd = fs.readlinkSync(`/proc/${pidText}/cwd`);
      if (cwd !== backend && cwd !== frontend && cwd !== actualRoot) continue;
      const comm = fs.readFileSync(`/proc/${pidText}/comm`,'utf8').trim();
      const initial = Object.fromEntries(fs.readFileSync(`/proc/${pidText}/environ`,'utf8').split('\0')
        .filter(x=>x.includes('=')).map(x=>[x.slice(0,x.indexOf('=')),x.slice(x.indexOf('=')+1)]));
      const row = {pid:Number(pidText),comm,cwd,role:cwd===backend?'backend-cwd':cwd===frontend?'frontend-cwd':'root-cwd'};
      if (/^\d+$/.test(initial.pm_id || '')) row.pm_id=Number(initial.pm_id);
      if (cwd===backend) {
        Object.assign(row,nodeEnvStatus(initial.NODE_ENV,fileNodeEnv));
        const candidate = initial.DATABASE_URL ?? fileCandidate;
        if (candidate) {
          row.database_candidate=databasePath(candidate);
          row.database_candidate_source=initial.DATABASE_URL != null?'initial-process-environment':'dotenv-file-only';
        }
      }
      processes.push(summarizeProcess(row));
    } catch(e) {if (!['ENOENT','ESRCH'].includes(e.code)) unreadable.push(Number(pidText));}
  }
  assert(processes.some(p=>p.role==='backend-cwd'), 'no visible backend process');
  const databaseCandidates = [...new Set(processes.map(p=>p.database_candidate).filter(Boolean))];
  const databases = databaseCandidates.map(db=>{
    const s=fs.statSync(db), disk=fs.statfsSync(path.dirname(db));
    return {path:db,size_bytes:s.size,mode:(s.mode&0o777).toString(8),
      free_bytes:disk.bavail*disk.bsize,wal_exists:fs.existsSync(db+'-wal'),shm_exists:fs.existsSync(db+'-shm')};
  });
  const dbFiles=new Set(databaseCandidates.flatMap(db=>[db,db+'-wal',db+'-shm']));
  const openers=[], unreadableFds=[];
  for (const pidText of fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n))) {
    try {
      let matched=false;
      for(const fd of fs.readdirSync(`/proc/${pidText}/fd`)) {
        try {if(dbFiles.has(fs.readlinkSync(`/proc/${pidText}/fd/${fd}`))) matched=true;}
        catch(e) {if(!['ENOENT','ESRCH'].includes(e.code)) throw e;}
      }
      if(matched) openers.push({pid:Number(pidText),comm:safeText(fs.readFileSync(`/proc/${pidText}/comm`,'utf8').trim(),'comm')});
    } catch(e) {if(!['ENOENT','ESRCH'].includes(e.code)) unreadableFds.push(Number(pidText));}
  }
  const migrations=fs.readdirSync(path.join(root,'backend/prisma/migrations')).filter(n=>/^\d{14}_[a-z0-9_]+$/.test(n));
  console.log(JSON.stringify({kind:'strict_readonly_preflight',deployed_sha:sha,root:actualRoot,
    processes,database_candidates:databases,open_database_processes:openers,
    unreadable_process_count:unreadable.length,unreadable_fd_process_count:unreadableFds.length,
    checkout_migrations:migrations,database_migration_state:'NOT_READ',
    writer_inventory_complete:false,
    release_gate:'BLOCKED: verify runtime DB configuration, all writers/schedulers/managers, migration state, proxy chain and trusted host identity before maintenance'},null,2));
}
if(require.main===module || process.argv[1] === '-') {
  try {inspect();} catch {console.error('Strict read-only preflight incomplete. No maintenance action taken.');process.exitCode=1;}
}
module.exports={summarizeProcess,databasePath,parseSetting,safeText,nodeEnvStatus};
