const test=require('node:test');const assert=require('node:assert/strict');
const {presentStatus}=require('./wpsSyncStatusService');
test('过期、失败或未运行不能显示同步正常；仅返回汇总字段',()=>{
 const now=Date.parse('2026-09-12T08:00:00Z');
 assert.equal(presentStatus({},now).state,'never');
 assert.equal(presentStatus({state:'current',lastSuccessAt:'2026-09-12T05:00:00Z'},now).state,'stale');
 assert.equal(presentStatus({state:'failed',lastSuccessAt:'2026-09-12T07:59:00Z'},now).state,'failed');
 const s=presentStatus({state:'needs_review',lastSuccessAt:'2026-09-12T07:59:00Z',conflicts:418,source:'/private/file',digest:'secret'},now);
 assert.equal(s.state,'needs_review');assert.equal(s.source,undefined);assert.equal(s.digest,undefined);
});
