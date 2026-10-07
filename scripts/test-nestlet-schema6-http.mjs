#!/usr/bin/env node
// Exact embedded smoke/HTTP gates against disposable local sources. No Docker, provider send or production data.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, scryptSync } from 'node:crypto';
assert.equal(process.argv.length,3,'Supply the reviewed candidate source root');
const source=resolve(process.argv[2]);
const shell=readFileSync(new URL('./nestlet-upgrade-schema6.sh',import.meta.url),'utf8');
const salt=randomBytes(16),passwordHash=`scrypt$${salt.toString('base64url')}$${scryptSync('synthetic-local-release-check',salt,32).toString('base64url')}`;
for(const configured of [false,true]) {
  const directory=mkdtempSync('/tmp/nestlet-schema6-http-');
  const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
  const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const child=spawn(process.execPath,['server.js'],{cwd:source,stdio:['ignore','ignore','pipe'],env:{
    PATH:process.env.PATH,HOST:'127.0.0.1',PORT:String(port),NODE_ENV:'production',PUBLIC_ORIGIN:'https://nestlet.celerada.link',
    NESTLET_DB_PATH:join(directory,'nestlet.sqlite'),NESTLET_OPERATOR_PASSWORD_HASH:configured?passwordHash:'',NESTLET_OPERATOR_USERNAME:'synthetic-owner-alias',
    ALIBABA_CLOUD_ACCESS_KEY_ID:configured?'synthetic-not-a-provider-key':'',ALIBABA_CLOUD_ACCESS_KEY_SECRET:configured?'synthetic-not-a-provider-secret':'',
    NESTLET_EMAIL_FROM:configured?'synthetic-sender@example.invalid':'',ENABLE_LIVE_AI:'false',
  }});
  let diagnostic='';child.stderr.on('data',bytes=>diagnostic+=bytes);
  try {
    let ready=false;
    for(let attempt=0;attempt<100;attempt++) {
      if(child.exitCode!==null)break;
      try{if((await fetch(`http://127.0.0.1:${port}/api/health`)).status===200){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.ok(ready,'Synthetic local candidate did not start: '+diagnostic);
    let result;
    if(configured) {
      const section=shell.slice(shell.indexOf('check_http() {'));
      const code=section.match(/<<'PY'\n([\s\S]*?)\nPY/)[1].replace('127.0.0.1:4173','127.0.0.1:'+port);
      result=spawnSync('python3',['-','true'],{input:code,encoding:'utf8'});
      assert.match(result.stdout,/unauthenticated boundaries passed/u);
    } else {
      const code=shell.match(/docker exec "\$SMOKE_NAME" node --input-type=module -e '\n([\s\S]*?)' <\/dev\/null/)[1]
        .replaceAll('/data/nestlet.sqlite',join(directory,'nestlet.sqlite')).replaceAll('127.0.0.1:4173','127.0.0.1:'+port);
      result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:source,encoding:'utf8'});
      assert.match(result.stdout,/Isolated schema6 startup/u);
    }
    assert.equal(result.status,0,result.stderr);
  } finally {
    if(child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
    rmSync(directory,{recursive:true,force:true});
  }
}
console.log('PASS: exact fresh-smoke and configured HTTP gates on disposable schema6 servers; module imports, empty capabilities, protected administrator routes, email flags and no diagnostic leakage. Local HTTP/SQLite only, not Docker or provider acceptance.');
