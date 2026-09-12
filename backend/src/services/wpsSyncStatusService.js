/** Input: 同步执行器受限状态文件；Output: 无路径和业务明细的首页状态；Pos: WPS同步状态只读Interface */
const fs=require('node:fs');
const path=require('node:path');
function presentStatus(value,now=Date.now()) {
  const lastSuccessAt=Number.isFinite(Date.parse(value.lastSuccessAt))?value.lastSuccessAt:null;
  let state=['current','needs_review','running','failed'].includes(value.state)?value.state:'never';
  if (state!=='failed' && (!lastSuccessAt || now-Date.parse(lastSuccessAt)>90*60000)) state=lastSuccessAt?'stale':'never';
  return {state,lastSuccessAt,lastAttemptAt:value.lastAttemptAt||null,conflicts:Number.isInteger(value.conflicts)?value.conflicts:0};
}
function getStatus() {
  try {return presentStatus(JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../state/wps-sync/status.json'),'utf8')));}
  catch(e) {return presentStatus({state:e.code==='ENOENT'?'never':'failed'});}
}
module.exports={getStatus,presentStatus};
