#!/usr/bin/env python3
"""Public source and synthetic fixtures only. Never run the real batch here."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
SCRIPT=ROOT/'scripts/nestlet-provider-batch.py'
spec=importlib.util.spec_from_file_location('batchproof',SCRIPT)
proof=importlib.util.module_from_spec(spec);spec.loader.exec_module(proof)


class ApprovedBatch(unittest.TestCase):
    def test_fixed_scope_and_no_request_expansion(self):
        self.assertEqual(proof.KINDS,('text','image','stream'))
        self.assertEqual(proof.PIN,'0ad91847e8c04f379f071e76bf8c325f9bb12233')
        self.assertEqual(proof.APPROVED_BATCH,'20261007-e875a213224b')
        self.assertEqual(proof.NODE.count('fetchImpl('),1)
        self.assertNotIn('fetchImpl(',proof.NODE[proof.NODE.index('async function preflight('):proof.NODE.index('const SYNTHETIC_IMAGE')])
        self.assertNotIn('.stream-proof-',SCRIPT.read_text())
        self.assertNotIn('Config.Env',proof.NODE)
        self.assertNotIn('recordStage',proof.NODE)
        self.assertNotIn('/models',proof.NODE)
        self.assertNotIn('/files',proof.NODE)
        self.assertNotIn('tools:',proof.NODE)

    def test_private_exclusive_fsynced_receipt_and_batch(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory);old=path/'.stream-proof-original';old.write_text('retain')
            fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY)
            try:
                child=proof.reserve_batch(fd)
                try:
                    actual_fsync=os.fsync
                    with mock.patch.object(proof.os,'fsync',wraps=actual_fsync) as synced:
                        proof.receipt(child,10,'text-request-reserved');self.assertEqual(synced.call_count,2)
                    with self.assertRaises(FileExistsError):proof.receipt(child,10,'text-request-reserved')
                    with self.assertRaises(RuntimeError):proof.receipt(child,11,'PRIVATE DATA')
                finally:os.close(child)
                with self.assertRaises(FileExistsError):proof.reserve_batch(fd)
                self.assertEqual(old.read_text(),'retain')
                batch=path/('.provider-batch-'+proof.APPROVED_BATCH)
                self.assertEqual(stat.S_IMODE(batch.stat().st_mode),0o700)
                for entry in batch.iterdir():self.assertEqual(stat.S_IMODE(entry.stat().st_mode),0o600)
            finally:os.close(fd)

    def run_mocked_batch(self,first='preflight-ready',values=None,reservation_failure=None):
        values=values or {kind:kind+'-completed' for kind in proof.KINDS}
        with tempfile.TemporaryDirectory() as directory:
            fd=os.open(directory,os.O_RDONLY|os.O_DIRECTORY);calls=[];real_receipt=proof.receipt
            def receipt(fd,number,stage):
                if stage==reservation_failure:raise OSError('synthetic fsync failure')
                return real_receipt(fd,number,stage)
            def docker(*args,**kwargs):
                code=kwargs['code'];calls.append(code)
                if code==proof.NODE+proof.NODE_PREFLIGHT:return first
                kind=next(kind for kind in proof.KINDS if code==proof.NODE+proof.NODE_MAIN.replace('__KIND__',json.dumps(kind)))
                self.assertTrue((Path(directory)/(str((proof.KINDS.index(kind)+1)*10)+'-'+kind+'-request-reserved')).exists())
                value=values[kind]
                if isinstance(value,BaseException):raise value
                return value
            try:
                with mock.patch.object(proof,'docker',side_effect=docker),mock.patch.object(proof,'receipt',side_effect=receipt):
                    if reservation_failure:
                        with self.assertRaises(OSError):proof.run_batch('synthetic',fd)
                        return calls,{},sorted(p.name for p in Path(directory).iterdir())
                    result=proof.run_batch('synthetic',fd)
                files=sorted(p.name for p in Path(directory).iterdir())
                self.assertNotIn('PRIVATE',''.join(p.read_text() for p in Path(directory).iterdir()))
                return calls,result,files
            finally:os.close(fd)

    def test_exactly_three_distinct_requests_on_success(self):
        calls,result,files=self.run_mocked_batch()
        self.assertEqual(len(calls),4)
        self.assertEqual(result,{kind:kind+'-completed' for kind in proof.KINDS})
        self.assertEqual(len(set(calls)),4)
        for kind in proof.KINDS:self.assertTrue(any(name.endswith(kind+'-completed') for name in files))

    def test_preflight_or_reservation_failure_cannot_start_extra_requests(self):
        for first in ('local-config-refused','local-parser-refused'):
            calls,result,files=self.run_mocked_batch(first=first)
            self.assertEqual(len(calls),1);self.assertEqual(set(result.values()),{'not-attempted'})
            self.assertFalse(any('request-reserved' in name for name in files))
        calls,_,_=self.run_mocked_batch(reservation_failure='text-request-reserved');self.assertEqual(len(calls),1)
        calls,_,_=self.run_mocked_batch(reservation_failure='image-request-reserved');self.assertEqual(len(calls),2)

    def test_unknown_outcome_stops_without_retry_or_resume(self):
        for value in [RuntimeError('PRIVATE'), 'PRIVATE UNKNOWN', 'local-config-refused']:
            calls,result,files=self.run_mocked_batch(values={'text':value})
            self.assertEqual(len(calls),2)
            self.assertEqual(result['image'],'not-attempted');self.assertEqual(result['stream'],'not-attempted')
            self.assertFalse(any('image-request-reserved' in name for name in files))
        calls,result,_=self.run_mocked_batch(values={'text':'response-unconfirmed','image':'image-content-unconfirmed','stream':'stream-completed'})
        self.assertEqual(len(calls),4);self.assertEqual(result['stream'],'stream-completed')

    def test_runtime_pin_readonly_overlay_and_repeat_guards(self):
        with tempfile.TemporaryDirectory() as directory:
            base=Path(directory);base.chmod(0o700);(base/'shared').mkdir(mode=0o700)
            (base/'current').symlink_to(base/'releases'/proof.PIN)
            marker=base/'.nestlet-managed';marker.write_text('nestlet-managed-stage-v1');marker.chmod(0o600)
            original=base/'shared'/'.stream-proof-original';original.write_text('unchanged')
            readonly=True;mounts=[{'Type':'volume','Name':'nestlet_case_data','Destination':'/data','RW':True}];calls=[]
            def docker(*args,**kwargs):
                calls.append(args)
                if args[0]=='ps':return 'a'*64
                if args[0]=='image':return 'sha256:synthetic'
                if args[:3]==('inspect','--format','{{json .Mounts}}'):return json.dumps(mounts)
                if args[:3]==('inspect','--format','{{json .HostConfig.Tmpfs}}'):return '{"/tmp":"rw,noexec"}'
                if args[:3]==('inspect','--format','{{.Config.User}}'):return 'node'
                if args[0]=='inspect':return '|'.join(['nestlet:'+proof.PIN,'sha256:synthetic','true','healthy',str(readonly).lower(),'nestlet','nestlet'])
                if kwargs['code']==proof.NODE+proof.NODE_PREFLIGHT:return 'preflight-ready'
                kind=next(k for k in proof.KINDS if kwargs['code']==proof.NODE+proof.NODE_MAIN.replace('__KIND__',json.dumps(k)))
                return kind+'-completed'
            real_lstat,real_fstat=Path.lstat,os.fstat
            def owned(info):
                fields=list(info);fields[4]=0;return os.stat_result(fields)
            with mock.patch.object(proof,'BASE',base),mock.patch.object(proof.os,'geteuid',return_value=0),mock.patch.object(proof.sys,'argv',['batch']),mock.patch.object(proof,'docker',side_effect=docker),mock.patch.object(Path,'lstat',lambda p,*a,**kw:owned(real_lstat(p,*a,**kw))),mock.patch.object(proof.os,'fstat',lambda fd:owned(real_fstat(fd))):
                readonly=False
                with self.assertRaises(RuntimeError):proof.run()
                readonly=True
                for destination in ('/','/app','/app/chat.js','/usr/local/bin'):
                    mounts.append({'Type':'bind','Destination':destination})
                    with self.assertRaises(RuntimeError):proof.run()
                    mounts.pop()
                self.assertEqual(sum(x[0]=='exec' for x in calls),0)
                self.assertEqual(proof.run(),{k:k+'-completed' for k in proof.KINDS})
                with self.assertRaises(FileExistsError):proof.run()
            self.assertEqual(sum(x[0]=='exec' for x in calls),4)
            self.assertEqual(original.read_text(),'unchanged')

    def test_synthetic_png_is_fixed_and_has_no_metadata(self):
        import struct,zlib
        encoded=re.search("const SYNTHETIC_IMAGE = '([^']+)'",proof.NODE).group(1)
        data=base64.b64decode(encoded);self.assertEqual(len(data),212)
        self.assertEqual(hashlib.sha256(data).hexdigest(),'e0a8d8371fcf70a742f56ec7eae8635f73f96e97ffc93412eb06c37cf10d2f28')
        self.assertEqual(data[:8],b'\x89PNG\r\n\x1a\n');position=8;chunks=[];compressed=b''
        while position<len(data):
            length=struct.unpack('>I',data[position:position+4])[0];kind=data[position+4:position+8];value=data[position+8:position+8+length]
            self.assertEqual(struct.unpack('>I',data[position+8+length:position+12+length])[0],zlib.crc32(kind+value)&0xffffffff)
            chunks.append(kind)
            if kind==b'IHDR':self.assertEqual(struct.unpack('>IIBBBBB',value),(96,96,8,2,0,0,0))
            if kind==b'IDAT':compressed+=value
            position+=12+length
        self.assertEqual(chunks,[b'IHDR',b'IDAT',b'IEND']);pixels=zlib.decompress(compressed)
        for y in range(96):
            self.assertEqual(pixels[y*289],0)
            for x in range(96):self.assertEqual(pixels[y*289+1+x*3:y*289+4+x*3],bytes((220,30,30) if 16<=x<80 and 16<=y<80 else (255,255,255)))

    def test_exact_public_parser_and_mocked_provider_contracts(self):
        source=Path(os.environ['NESTLET_PROOF_PUBLIC_CHAT_SOURCE']).read_bytes()
        self.assertEqual(hashlib.sha256(source).hexdigest(),'78609005543130da939c20b066818b785adbb5dd031a7195ee82859ac2c19b9c')
        tests=r'''
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,chmodSync,rmSync,linkSync,symlinkSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
const root=mkdtempSync(tmpdir()+'/provider-batch-fixture-'),path=root+'/chat.js';
const bytes=Buffer.from('__PUBLIC_SOURCE__','base64');
const options={root,uid:process.getuid(),gid:process.getgid(),immutableVerified:true},parserLoader=()=>loadParser(options);
const env={DEEPSEEK_API_KEY:'SYNTHETIC-NOT-A-REAL-KEY',ENABLE_LIVE_AI:'true',DEEPSEEK_MODEL:'deepseek-flash'};
const sse=text=>'data: '+JSON.stringify({choices:[{delta:{content:text},finish_reason:null}]})+'\n\n'+'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'+'data: [DONE]\n\n';
const reply=(kind,text)=>new Response(kind==='stream'?sse(text):JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:text}}]}),{headers:{'Content-Type':kind==='stream'?'text/event-stream':'application/json'}});
try{
 writeFileSync(path,bytes,{mode:0o644});
 for(const [d,f]of[[0o755,0o644],[0o755,0o664],[0o775,0o644],[0o775,0o664]]){
  chmodSync(root,d);chmodSync(path,f);assert.equal(await preflight({env,parserLoader}),'preflight-ready');
 }
 for(const override of[{immutableVerified:false},{uid:process.getuid()+1},{gid:process.getgid()+1}])await assert.rejects(loadParser({...options,...override}));
 for(const m of[0o666,0o755,0o4644]){chmodSync(path,m);await assert.rejects(parserLoader());}chmodSync(path,0o664);
 chmodSync(root,0o777);await assert.rejects(parserLoader());chmodSync(root,0o775);
 linkSync(path,root+'/hardlink');await assert.rejects(parserLoader());unlinkSync(root+'/hardlink');
 unlinkSync(path);symlinkSync(root+'/missing',path);await assert.rejects(parserLoader());unlinkSync(path);
 writeFileSync(path,Buffer.alloc(bytes.length,32),{mode:0o644});await assert.rejects(parserLoader());writeFileSync(path,bytes);
 let calls=0;
 for(const kind of CASES){
  const fetchImpl=async(url,opt)=>{
   calls++;assert.equal(url,'https://api.deepseek.com/chat/completions');assert.equal(opt.redirect,'error');assert.equal(opt.method,'POST');
   assert.equal(opt.headers.Authorization,'Bearer '+env.DEEPSEEK_API_KEY);
   const body=JSON.parse(opt.body);assert.equal(body.model,'deepseek-flash');assert.equal(body.max_tokens,16);assert.equal(body.stream,kind==='stream');assert.deepEqual(body.thinking,{type:'disabled'});
   assert.equal(body.messages.length,1);assert.equal(body.messages[0].role,'user');assert.ok(!opt.body.includes(env.DEEPSEEK_API_KEY));
   if(kind==='image'){const parts=body.messages[0].content;assert.equal(parts.length,2);assert.equal(parts[0].type,'text');assert.ok(!/\bred\b/.test(parts[0].text));assert.deepEqual(parts[1],{type:'image_url',image_url:{url:'data:image/png;base64,'+SYNTHETIC_IMAGE,detail:'low'}});}
   else assert.equal(typeof body.messages[0].content,'string');
   return reply(kind,kind==='text'?'5':kind==='image'?'red':'OK');
  };
  assert.equal(await providerProof({kind,env,parserLoader,fetchImpl}),kind+'-completed');
  let count=0;assert.equal(await providerProof({kind,env,parserLoader,fetchImpl:async()=>{count++;return reply(kind,'wrong');}}),kind+'-content-unconfirmed');assert.equal(count,1);
  for(const value of[new Response('PRIVATE',{status:401}),new Response('{}'),new Response('x'.repeat(65537),{headers:{'Content-Type':kind==='stream'?'text/event-stream':'application/json'}})]){
   count=0;assert.equal(await providerProof({kind,env,parserLoader,fetchImpl:async()=>{count++;return value;}}),'response-unconfirmed');assert.equal(count,1);
  }
  count=0;assert.equal(await providerProof({kind,env,parserLoader,fetchImpl:async()=>{count++;throw Error('PRIVATE');}}),'request-unconfirmed-no-headers');assert.equal(count,1);
  count=0;assert.equal(await providerProof({kind,env,parserLoader,timeoutMs:10,fetchImpl:async()=>{count++;return new Promise(()=>{});}}),'request-unconfirmed-no-headers');assert.equal(count,1);
  count=0;assert.equal(await providerProof({kind,env,parserLoader,timeoutMs:10,fetchImpl:async()=>{count++;return new Response(new ReadableStream({pull(){return new Promise(()=>{});}}),{headers:{'Content-Type':kind==='stream'?'text/event-stream':'application/json'}});}}),'response-unconfirmed');assert.equal(count,1);
 }
 assert.equal(calls,3);
 for(const change of[{DEEPSEEK_API_KEY:''},{ENABLE_LIVE_AI:'false'},{DEEPSEEK_MODEL:'other'}])assert.equal(await providerProof({kind:'text',env:{...env,...change},parserLoader,fetchImpl:()=>{throw Error('must not fetch');}}),'local-config-refused');
 assert.equal(await providerProof({kind:'other',env,parserLoader}),'local-input-refused');
 assert.equal(await providerProof({kind:'text',env,parserLoader:async()=>{throw Error('PRIVATE');}}),'local-parser-refused');
 for(const payload of[{},[],{choices:[]},{choices:[{finish_reason:'length',message:{role:'assistant',content:'5'}}]},{choices:[{finish_reason:'stop',message:{role:'assistant',content:'5',tool_calls:[]}}]}])assert.equal(await providerProof({kind:'text',env,parserLoader,fetchImpl:async()=>new Response(JSON.stringify(payload),{headers:{'Content-Type':'application/json'}})}),'response-unconfirmed');
}finally{chmodSync(root,0o700);rmSync(root,{recursive:true,force:true});}
process.stdout.write('synthetic batch provider contracts passed\n');
'''.replace('__PUBLIC_SOURCE__',base64.b64encode(source).decode())
        result=subprocess.run(['node','--input-type=module','-'],input=proof.NODE+tests,capture_output=True,text=True,timeout=15,env={'PATH':os.environ['PATH']})
        self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(result.stdout,'synthetic batch provider contracts passed\n');self.assertEqual(result.stderr,'')


if __name__=='__main__':unittest.main()
