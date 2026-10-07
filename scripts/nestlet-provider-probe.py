import subprocess,json,sys
code=r'''const report={requestedModel:'deepseek-flash',credentialConfigured:!!process.env.DEEPSEEK_API_KEY};
try {
 if(!report.credentialConfigured) throw new Error('NO_CONFIGURED_KEY');
 const headers={'Authorization':'Bearer '+process.env.DEEPSEEK_API_KEY,'Content-Type':'application/json'};
 let start=performance.now();
 const models=await fetch('https://api.deepseek.com/models',{headers,redirect:'error',signal:AbortSignal.timeout(20000)});
 report.catalogStatus=models.status;report.catalogElapsedMs=Math.round(performance.now()-start);
 if(models.ok){const data=await models.json();report.flashListed=Array.isArray(data.data)&&data.data.some(x=>x.id==='deepseek-flash');}
 start=performance.now();
 const response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(30000),body:JSON.stringify({model:'deepseek-flash',thinking:{type:'disabled'},stream:false,max_tokens:32,messages:[{role:'user',content:'This is a synthetic connectivity test with no personal data. Reply with exactly OK.'}]})});
 report.generationStatus=response.status;report.generationElapsedMs=Math.round(performance.now()-start);
 if(response.ok){const body=await response.json();const content=body.choices?.[0]?.message?.content;report.actualModel=typeof body.model==='string'?body.model.slice(0,80):null;report.nonemptyAnswer=typeof content==='string'&&content.trim().length>0;report.expectedAnswer=typeof content==='string'&&content.trim()==='OK';report.finishReason=body.choices?.[0]?.finish_reason;report.totalTokens=Number.isSafeInteger(body.usage?.total_tokens)?body.usage.total_tokens:null;report.ok=report.nonemptyAnswer===true;}
 else report.ok=false;
} catch(e){report.ok=false;report.errorClass=['TimeoutError','AbortError'].includes(e.name)?e.name:'PROBE_FAILED';}
console.log(JSON.stringify(report));if(!report.ok)process.exitCode=1;'''
try:
 ids=subprocess.run(['docker','ps','-q','--filter','label=com.docker.compose.project=nestlet'],capture_output=True,text=True,timeout=15,stdin=subprocess.DEVNULL,check=True).stdout.split()
 if len(ids)!=1:raise RuntimeError()
 p=subprocess.run(['docker','exec','-i',ids[0],'node','--input-type=module'],input=code,capture_output=True,text=True,timeout=65)
 report=json.loads(p.stdout)
 print(json.dumps(report))
 sys.exit(0 if report.get('ok') else 1)
except Exception:
 print(json.dumps({'ok':False,'errorClass':'PRIVATE_RUNTIME_PROBE_FAILED','detailsWithheld':True}));sys.exit(1)
