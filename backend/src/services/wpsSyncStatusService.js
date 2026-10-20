/** Input: 同步执行器受限状态文件；Output: 无路径和业务明细的首页状态；Pos: WPS同步状态只读Interface */
const fs=require('node:fs');
const path=require('node:path');
function presentStatus(value,now=Date.now()) {
  const lastSuccessAt=Number.isFinite(Date.parse(value.lastSuccessAt))?value.lastSuccessAt:null;
  let state=['current','needs_review','running','failed'].includes(value.state)?value.state:'never';
  if (state!=='failed' && (!lastSuccessAt || now-Date.parse(lastSuccessAt)>90*60000)) state=lastSuccessAt?'stale':'never';
  const message=state==='failed'?({login_required:'请在 ego lite 中重新登录 WPS。',cloud_unavailable:'暂时无法连接 WPS，将在下次检查时重试。',download_failed:'云表下载失败，本轮未完成同步。',fresh_download_required:'未取得本轮最新云表，本轮未写入。'})[value.reason]||'同步未完成，请查看任务中的失败提醒。':null;
  return {state,lastSuccessAt,lastAttemptAt:value.lastAttemptAt||null,conflicts:Number.isInteger(value.conflicts)?value.conflicts:0,message};
}
function getStatus() {
  try {return presentStatus(JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../state/wps-sync/status.json'),'utf8')));}
  catch(e) {return presentStatus({state:e.code==='ENOENT'?'never':'failed'});}
}
module.exports={getStatus,presentStatus};
