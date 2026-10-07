#!/usr/bin/env python3
"""One approved batch: at most three small synthetic provider requests.

The fixed batch covers text, image and stream once each. No retries, resumed
unused slots, arbitrary inputs or new provider endpoints. The original unknown
attempt remains untouched. Publication and dispatch belong to the root owner.
"""
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

ENABLED = True
APPROVED_BATCH = '20261007-e875a213224b'
KINDS = ('text', 'image', 'stream')
BASE = Path('/opt/nestlet')
PIN = '0ad91847e8c04f379f071e76bf8c325f9bb12233'
ACCEPTED = 'provider-batch-completed'
UNCONFIRMED = 'provider-batch-unconfirmed'
NODE = r'''
import { createHash } from 'node:crypto';
import { constants, openSync, fstatSync, readFileSync, closeSync } from 'node:fs';
const CHAT_SOURCE_SHA256 = '78609005543130da939c20b066818b785adbb5dd031a7195ee82859ac2c19b9c';
const CHAT_SOURCE_BYTES = 27778;
const discard = response => { try { Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch {} };
async function loadParser({root = '/app', uid = 1000, gid = 1000, immutableVerified = false} = {}) {
  // Canonical 0664/0775 metadata is allowed ONLY after the host has verified the
  // exact immutable image and no code overlays. Never normalize live permissions.
  if (immutableVerified !== true) throw new Error();
  const directory = openSync(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  let fd;
  const stamp = x => [x.dev,x.ino,x.mode,x.uid,x.gid,x.nlink,x.size,x.mtimeMs,x.ctimeMs].join(':');
  try {
    const parent = fstatSync(directory);
    if (!parent.isDirectory() || ![0,uid].includes(parent.uid) || ![0,gid].includes(parent.gid)
        || (parent.mode & 0o7002)) throw new Error();
    fd = openSync(`/proc/self/fd/${directory}/chat.js`, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.uid !== uid || before.gid !== gid
        || (before.mode & 0o7113) || !(before.mode & 0o400) || before.size !== CHAT_SOURCE_BYTES) throw new Error();
    const source = readFileSync(fd);
    if (source.length !== CHAT_SOURCE_BYTES || stamp(before) !== stamp(fstatSync(fd))
        || createHash('sha256').update(source).digest('hex') !== CHAT_SOURCE_SHA256) throw new Error();
    // 533 chat.js has imports. Load only these exact hash-checked original byte
    // ranges: static limits/error helpers and the existing pure stream parser.
    // No import, request builder, library session, server, auth or storage runs.
    const pieces = [[319,1119,"a2787efe7442839a8a6edaebf9860845ec423a3bebcb3e8c09ad6712a56c6405"],[10844,13234,"c86bbebdf7c2d70fc1783aace8396a84fb6502f60c410734b7669d113e8970c9"]].map(([start,end,hash]) => {
      const bytes = source.subarray(start,end);
      if(createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error();
      return bytes;
    });
    return (await import('data:text/javascript;base64,'+Buffer.concat(pieces).toString('base64'))).parseProviderStream;
  } finally {
    if(fd !== undefined) closeSync(fd);
    closeSync(directory);
  }
}
async function preflight({env = process.env, parserLoader = () => loadParser({immutableVerified:true})} = {}) {
  // Provider-free: no fetch, server startup, settings API or credential output.
  if(typeof env.DEEPSEEK_API_KEY !== 'string' || !env.DEEPSEEK_API_KEY || env.ENABLE_LIVE_AI !== 'true'
     || (env.DEEPSEEK_MODEL && env.DEEPSEEK_MODEL !== 'deepseek-flash')) return 'local-config-refused';
  try { if(typeof await parserLoader() !== 'function') throw new Error(); }
  catch { return 'local-parser-refused'; }
  return 'preflight-ready';
}
const SYNTHETIC_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAAAm0lEQVR42u3QQREAMAgEMZTgX1S9FAf828vOKkhdrRUCQIAAAQIECBAgAQIECBAgQOFAp/vpAQECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQIECAAAECBAgQoESgtAABAgQIECBAgAAJECBAgAAB+qwBbepIhPdrZ3gAAAAASUVORK5CYII=';
const IMAGE_SHA256 = 'e0a8d8371fcf70a742f56ec7eae8635f73f96e97ffc93412eb06c37cf10d2f28';
const CASES = Object.freeze(['text','image','stream']);
function requestBody(kind) {
  if(!CASES.includes(kind)) throw new Error();
  let content;
  if(kind === 'text') content = 'This is a synthetic arithmetic test. Reply only with the sum of 2 and 3 as a single digit.';
  else if(kind === 'stream') content = 'This is a synthetic connectivity test with no personal or case data. Reply only with OK.';
  else {
    const bytes=Buffer.from(SYNTHETIC_IMAGE,'base64');
    if(bytes.length !== 212 || createHash('sha256').update(bytes).digest('hex') !== IMAGE_SHA256) throw new Error();
    content=[{type:'text',text:'This is an authored synthetic test image. What color is the central filled square? Reply with one lowercase English color word.'},
      {type:'image_url',image_url:{url:'data:image/png;base64,'+SYNTHETIC_IMAGE,detail:'low'}}];
  }
  return {model:'deepseek-flash',stream:kind==='stream',thinking:{type:'disabled'},max_tokens:16,messages:[{role:'user',content}]};
}
async function providerProof({kind,env=process.env,fetchImpl=globalThis.fetch,parserLoader=()=>loadParser({immutableVerified:true}),timeoutMs=20000}={}) {
  let timer, upstream, reader, attempted=false, receivedHeaders=false;
  const controller=new AbortController();
  const cancel=()=>{try{Promise.resolve(reader?.cancel()).catch(()=>{});}catch{}};
  try {
    if(!CASES.includes(kind)) return 'local-input-refused';
    const apiKey=env.DEEPSEEK_API_KEY;
    if(typeof apiKey!=='string'||!apiKey||env.ENABLE_LIVE_AI!=='true'||(env.DEEPSEEK_MODEL&&env.DEEPSEEK_MODEL!=='deepseek-flash')) return 'local-config-refused';
    let parser;
    try{parser=await parserLoader();if(typeof parser!=='function')throw new Error();}catch{return 'local-parser-refused';}
    const body=requestBody(kind);
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();cancel();reject(new Error());},timeoutMs);});
    const request=(async()=>{
      attempted=true;
      upstream=await fetchImpl('https://api.deepseek.com/chat/completions',{
        method:'POST',redirect:'error',signal:controller.signal,
        headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(body),
      });
      receivedHeaders=true;
      const length=upstream.headers?.get('content-length');
      const contentType=(upstream.headers?.get('content-type')||'').toLowerCase();
      if(controller.signal.aborted||!upstream.ok||!upstream.body
        ||!contentType.includes(kind==='stream'?'text/event-stream':'application/json')
        ||(length!=null&&(!/^\d+$/.test(length)||Number(length)>65536))){discard(upstream);return 'response-unconfirmed';}
      reader=upstream.body.getReader();
      controller.signal.addEventListener('abort',cancel,{once:true});
      async function* chunks(){
        let bytes=0;
        for(;;){
          controller.signal.throwIfAborted();const part=await reader.read();controller.signal.throwIfAborted();
          if(part.done)return;bytes+=part.value.byteLength;if(bytes>65536)throw new Error();yield part.value;
        }
      }
      let answer='';
      if(kind==='stream'){
        let done=false;
        for await(const event of parser(chunks())){
          controller.signal.throwIfAborted();
          if(event.type==='delta'){if(done)throw new Error();answer+=event.text;if(answer.length>128)throw new Error();}
          else if(event.type==='done'){if(done)throw new Error();done=true;}else throw new Error();
        }
        if(!done||!answer)return 'response-unconfirmed';
      }else{
        const bytes=[];for await(const part of chunks())bytes.push(Buffer.from(part));
        const packet=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(bytes)));
        if(!packet||Array.isArray(packet)||packet.error||!Array.isArray(packet.choices)||packet.choices.length!==1)return 'response-unconfirmed';
        const choice=packet.choices[0],message=choice?.message;
        if(choice?.finish_reason!=='stop'||message?.role!=='assistant'||typeof message.content!=='string'||!message.content.trim()
          ||message.content.length>128||message.tool_calls||message.function_call)return 'response-unconfirmed';
        answer=message.content;
      }
      // Compare only in memory. Neither generated text nor provider identifiers
      // reach stdout, files, receipts, diagnostics or a second provider call.
      const expected=kind==='text'?'5':kind==='image'?'red':'ok';
      return answer.trim().toLowerCase()===expected?kind+'-completed':kind+'-content-unconfirmed';
    })();
    return await Promise.race([request,deadline]);
  }catch{return receivedHeaders?'response-unconfirmed':attempted?'request-unconfirmed-no-headers':'local-unconfirmed';}
  finally{clearTimeout(timer);controller.abort();cancel();if(reader){try{reader.releaseLock();}catch{}}else discard(upstream);}
}
'''
NODE_PREFLIGHT = "\nprocess.stdout.write((await preflight())+'\\n');\n"
NODE_MAIN = "\nprocess.stdout.write((await providerProof({kind:__KIND__}))+'\\n');\n"


def require(condition):
    if not condition:
        raise RuntimeError('unconfirmed')


def private_directory(path):
    info = path.lstat()
    require(stat.S_ISDIR(info.st_mode) and info.st_uid == os.geteuid()
            and stat.S_IMODE(info.st_mode) == 0o700)


def docker(*args, code=None, timeout=15):
    # The existing local daemon only. Never ask Docker to return Config.Env.
    env = {key: value for key, value in os.environ.items() if not key.startswith('DOCKER_')}
    env['DOCKER_HOST'] = 'unix:///var/run/docker.sock'
    result = subprocess.run(['docker', *args], input=code, stdin=None if code is not None else subprocess.DEVNULL,
                            capture_output=True, text=True, timeout=timeout, env=env)
    require(result.returncode == 0 and len(result.stdout) <= 4096)
    return result.stdout.strip()


PREFLIGHT_CLASSES = frozenset(('preflight-ready', 'local-config-refused', 'local-parser-refused'))
COMMON_TERMINALS = frozenset(('local-config-refused', 'local-parser-refused', 'local-input-refused',
                             'local-unconfirmed', 'request-unconfirmed-no-headers',
                             'response-unconfirmed', 'transport-outcome-unknown'))


def terminal_classes(kind):
    require(kind in KINDS)
    return COMMON_TERMINALS | {kind+'-completed', kind+'-content-unconfirmed'}


def receipt(directory_fd, sequence, stage):
    allowed = PREFLIGHT_CLASSES | {'preflight-pending'}
    for kind in KINDS:
        allowed |= {kind+'-request-reserved'} | {value if value.startswith(kind+'-') else kind+'-'+value for value in terminal_classes(kind)}
    require(stage in allowed)
    fd = os.open(f'{sequence:02d}-{stage}', os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                 0o600, dir_fd=directory_fd)
    with os.fdopen(fd, 'wb') as output:
        output.write((stage+'\n').encode('ascii')); output.flush(); os.fsync(output.fileno())
    os.fsync(directory_fd)


def reserve_batch(shared_fd):
    # One fixed approval-scoped batch only. Never reset the directory, allocate
    # a replacement ID, resume unused slots, or change the old one-shot marker.
    require(ENABLED is True and re.fullmatch('[0-9]{8}-[a-f0-9]{12}', APPROVED_BATCH))
    name = '.provider-batch-'+APPROVED_BATCH
    os.mkdir(name, 0o700, dir_fd=shared_fd); os.fsync(shared_fd)
    fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=shared_fd)
    try: receipt(fd, 0, 'preflight-pending')
    except BaseException: os.close(fd); raise
    return fd


def run_batch(container, directory_fd):
    result = docker('exec','-i',container,'node','--input-type=module','-',
                    code=NODE+NODE_PREFLIGHT,timeout=10)
    require(result in PREFLIGHT_CLASSES); receipt(directory_fd, 1, result)
    outcomes = {kind:'not-attempted' for kind in KINDS}
    if result != 'preflight-ready': return outcomes
    # Exactly these three fixed cases, no retries or caller-supplied list.
    for index, kind in enumerate(KINDS, start=1):
        receipt(directory_fd, index*10, kind+'-request-reserved')
        try:
            result = docker('exec','-i',container,'node','--input-type=module','-',
                            code=NODE+NODE_MAIN.replace('__KIND__',json.dumps(kind)),timeout=30)
            require(result in terminal_classes(kind))
        except BaseException: result = 'transport-outcome-unknown'
        receipt(directory_fd, index*10+1, result if result.startswith(kind+'-') else kind+'-'+result)
        outcomes[kind] = result
        # A lost result or local precondition change stops the batch. Remaining
        # slots are not resumed automatically, even if fewer than three ran.
        if result == 'transport-outcome-unknown' or result.startswith('local-'): break
    return outcomes


def run():
    # First gate: no filesystem, Docker, source read, receipt, or provider access.
    require(ENABLED is True and re.fullmatch('[0-9]{8}-[a-f0-9]{12}', APPROVED_BATCH))
    require(os.geteuid() == 0 and len(sys.argv) == 1)
    for path in (BASE, BASE / 'shared'):
        private_directory(path)
    require((BASE / 'current').is_symlink() and os.readlink(BASE / 'current') == str(BASE / 'releases' / PIN))
    marker = BASE / '.nestlet-managed'
    info = marker.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1
            and stat.S_IMODE(info.st_mode) == 0o600 and marker.read_text().strip() == 'nestlet-managed-stage-v1')
    base_fd = os.open(BASE, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    directory_fd = os.open('shared', os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=base_fd)
    lock_fd = os.open('.incremental-release.lock', os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600, dir_fd=base_fd)
    try:
        info = os.fstat(lock_fd)
        require(stat.S_ISREG(info.st_mode) and info.st_uid == os.geteuid() and info.st_nlink == 1
                and stat.S_IMODE(info.st_mode) == 0o600)
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        ids = docker('ps', '-aq', '--filter', 'label=com.docker.compose.project=nestlet').split()
        require(len(ids) == 1 and re.fullmatch('[a-f0-9]{12,64}', ids[0]))
        container = ids[0]
        fields = '{{.Config.Image}}|{{.Image}}|{{.State.Running}}|{{.State.Health.Status}}|{{.HostConfig.ReadonlyRootfs}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}'
        observed = docker('inspect', '--format', fields, container).split('|')
        expected_image = docker('image', 'inspect', '--format', '{{.Id}}', 'nestlet:' + PIN)
        require(observed == ['nestlet:' + PIN, expected_image, 'true', 'healthy', 'true', 'nestlet', 'nestlet'])
        mounts = json.loads(docker('inspect', '--format', '{{json .Mounts}}', container))
        tmpfs = json.loads(docker('inspect', '--format', '{{json .HostConfig.Tmpfs}}', container))
        # The app, Node and parent paths must come only from the pinned read-only
        # image. Inspect metadata internally; never return mount source paths.
        require(isinstance(mounts, list) and all(isinstance(item, dict) for item in mounts))
        require(all(item.get('Destination') == '/tmp' for item in mounts if item.get('Type') == 'tmpfs'))
        volumes = [item for item in mounts if item.get('Type') != 'tmpfs']
        require(len(volumes) == 1 and volumes[0].get('Type') == 'volume'
                and volumes[0].get('Name') == 'nestlet_case_data' and volumes[0].get('Destination') == '/data'
                and volumes[0].get('RW') is True)
        require((tmpfs is None or isinstance(tmpfs, dict)) and set(tmpfs or {}) <= {'/tmp'})
        # Docker User fixes the parser ownership contract. No environment values
        # are inspected or returned; group-writable public code is immutable here.
        require(docker('inspect', '--format', '{{.Config.User}}', container) in ('node','1000','1000:1000'))
        receipt_fd = reserve_batch(directory_fd)
        try: return run_batch(container, receipt_fd)
        finally: os.close(receipt_fd)
    finally:
        os.close(lock_fd); os.close(directory_fd); os.close(base_fd)


if __name__ == '__main__':
    try: outcomes = run()
    except BaseException: outcomes = {}
    for kind in KINDS:
        print(kind+'-completed' if outcomes.get(kind) == kind+'-completed' else kind+'-unconfirmed')
    sys.exit(0 if all(outcomes.get(kind) == kind+'-completed' for kind in KINDS) else 1)
