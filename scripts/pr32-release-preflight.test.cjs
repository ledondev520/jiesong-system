const test=require('node:test');
const assert=require('node:assert/strict');
const {summarizeProcess,databasePath,parseSetting,safeText}=require('./pr32-release-preflight.cjs');
test('process output is strictly allowlisted',()=>{
 const output=JSON.stringify(summarizeProcess({pid:42,comm:'node',cwd:'/opt/app',role:'backend-cwd',
 env:{PASSWORD:'SHOULD_NOT_LEAK'},argv:['SHOULD_NOT_LEAK'],secret:'SHOULD_NOT_LEAK'}));
 assert.ok(!output.includes('SHOULD_NOT_LEAK'));assert.equal(JSON.parse(output).pid,42);
});
test('relative, other provider and parameterized DB URLs fail',()=>{
 for(const x of ['file:./dev.db','postgres://secret','/tmp/db','file:/tmp/db?token=secret']) assert.throws(()=>databasePath(x));
});
test('simple dotenv values parsed without evaluating code',()=>{
 for(const x of ['DATABASE_URL=file:/tmp/db','DATABASE_URL="file:/tmp/db" # note',"export DATABASE_URL='file:/tmp/db'"])
  assert.equal(parseSetting(x,'DATABASE_URL'),'file:/tmp/db');
 assert.equal(parseSetting('JWT_SECRET=private','DATABASE_URL'),null);
});
test('ambiguous or complex dotenv values fail closed',()=>{
 for(const x of ['DATABASE_URL=a\nDATABASE_URL=b','DATABASE_URL="a\\nb"','DATABASE_URL="unterminated'])
  assert.throws(()=>parseSetting(x,'DATABASE_URL'));
});
test('metadata rejects controls and oversized text',()=>{
 for(const x of ['node\n::error::payload','node\rvalue','x'.repeat(3000)]) assert.throws(()=>safeText(x,'comm'));
 assert.throws(()=>safeText('/opt/a\nvalue','path'));
});
