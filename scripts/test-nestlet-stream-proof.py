#!/usr/bin/env python3
"""Local synthetic tests only. No real provider, Docker, SSH or private input.

Set NESTLET_PROOF_PUBLIC_CHAT_SOURCE to the public chat.js from pinned 4d4c153.
Its exact source hash is checked before it is imported into the mocked Node test.
"""
import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
import yaml
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/nestlet-stream-proof.py'
spec = importlib.util.spec_from_file_location('streamproof', SCRIPT)
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)


class StreamProofSafety(unittest.TestCase):
    def test_durable_marker_is_exclusive_and_never_reset(self):
        with tempfile.TemporaryDirectory() as directory:
            fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                proof.mark_attempt(fd)
                path = Path(directory) / proof.MARKER
                original = path.read_bytes()
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
                with self.assertRaises(FileExistsError):
                    proof.mark_attempt(fd)
                self.assertEqual(path.read_bytes(), original)
            finally:
                os.close(fd)

    def test_symlink_marker_does_not_touch_target(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            target = path / 'untouched'; target.write_text('retain')
            (path / proof.MARKER).symlink_to(target)
            fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with self.assertRaises(FileExistsError):
                    proof.mark_attempt(fd)
                self.assertEqual(target.read_text(), 'retain')
            finally:
                os.close(fd)

    def test_existing_daemon_only_and_suppressed_errors(self):
        result = subprocess.CompletedProcess([], 0, 'stream-completed\n', '')
        with mock.patch.dict(os.environ, {'DOCKER_CONTEXT': 'unrelated', 'DOCKER_TLS_VERIFY': '1'}):
            with mock.patch.object(proof.subprocess, 'run', return_value=result) as run:
                self.assertEqual(proof.docker('exec', '-i', 'a' * 64, 'node', '-', code='synthetic'), proof.ACCEPTED)
                call = run.call_args
                self.assertEqual(call.args[0], ['docker', 'exec', '-i', 'a' * 64, 'node', '-'])
                self.assertEqual(call.kwargs['env']['DOCKER_HOST'], 'unix:///var/run/docker.sock')
                self.assertNotIn('DOCKER_CONTEXT', call.kwargs['env'])
                self.assertNotIn('DOCKER_TLS_VERIFY', call.kwargs['env'])
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            with mock.patch.object(proof.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, 'PRIVATE', 'PRIVATE')):
                with self.assertRaisesRegex(RuntimeError, '^unconfirmed$'):
                    proof.docker('ps')
        self.assertEqual(output.getvalue(), '')

    def test_runtime_guards_and_marker_before_single_exec(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory); base.chmod(0o700)
            (base / 'shared').mkdir(mode=0o700)
            (base / 'current').symlink_to(base / 'releases' / proof.PIN)
            (base / '.nestlet-managed').write_text('nestlet-managed-stage-v1')
            (base / '.nestlet-managed').chmod(0o600)
            calls = []
            mounts = [{'Type':'volume','Name':'nestlet_case_data','Destination':'/data','RW':True}]
            tmpfs = {'/tmp':'rw,noexec,nosuid,nodev,size=64m,mode=1777'}
            def docker(*args, **kwargs):
                calls.append(args)
                if args[0] == 'ps': return 'a' * 64
                if args[:3] == ('inspect','--format','{{json .Mounts}}'): return json.dumps(mounts)
                if args[:3] == ('inspect','--format','{{json .HostConfig.Tmpfs}}'): return json.dumps(tmpfs)
                if args[0] == 'inspect': return '|'.join(['nestlet:' + proof.PIN, 'sha256:synthetic', 'true', 'healthy', 'true', 'nestlet', 'nestlet'])
                if args[:2] == ('image','inspect'): return 'sha256:synthetic'
                if args[0] == 'exec':
                    self.assertTrue((base / 'shared' / proof.MARKER).is_file())
                    self.assertEqual(kwargs['code'], proof.NODE + proof.NODE_MAIN)
                    self.assertEqual(kwargs['timeout'], 30)
                    return proof.ACCEPTED
                raise AssertionError('unexpected Docker action')
            original_lstat, original_fstat = Path.lstat, os.fstat
            def owned(info):
                values = list(info); values[4] = 0
                return os.stat_result(values)
            # Synthetic root ownership only: execute the actual guard/marker path
            # on ordinary non-root test hosts rather than silently skipping it.
            with mock.patch.object(proof, 'BASE', base), mock.patch.object(proof.os, 'geteuid', return_value=0), mock.patch.object(proof.sys, 'argv', ['proof']), mock.patch.object(proof, 'docker', side_effect=docker), mock.patch.object(Path, 'lstat', lambda path, *args, **kwargs: owned(original_lstat(path,*args,**kwargs))), mock.patch.object(proof.os, 'fstat', lambda fd: owned(original_fstat(fd))):
                for destination in ['/', '/app', '/app/chat.js', '/usr/local/bin']:
                    mounts.append({'Type':'bind','Destination':destination})
                    with self.assertRaisesRegex(RuntimeError, '^unconfirmed$'): proof.run()
                    mounts.pop()
                    self.assertFalse((base / 'shared' / proof.MARKER).exists())
                tmpfs['/app'] = 'rw'
                with self.assertRaisesRegex(RuntimeError, '^unconfirmed$'): proof.run()
                del tmpfs['/app']
                self.assertFalse((base / 'shared' / proof.MARKER).exists())
                self.assertTrue(proof.run())
                with self.assertRaises(FileExistsError): proof.run()
            self.assertEqual(sum(args[0] == 'exec' for args in calls), 1)
            self.assertEqual(sorted(p.name for p in (base/'shared').iterdir()), [proof.MARKER])

    def test_fixed_scope_without_external_or_mutating_alternates(self):
        text = SCRIPT.read_text()
        self.assertEqual(proof.NODE.count('fetchImpl('), 1)
        for forbidden in ["'/api/", 'sqlite', 'server.js', 'auth.js', 'storage.js', 'docker compose', 'restart', 'prune', 'Config.Env', 'ALIBABA_CLOUD', 'NESTLET_EMAIL_FROM']:
            self.assertNotIn(forbidden, proof.NODE)
        self.assertIn("root = '/app'", proof.NODE)
        self.assertIn('constants.O_NOFOLLOW', proof.NODE)
        self.assertLess(proof.NODE.index('before.size !== CHAT_SOURCE_BYTES'),proof.NODE.index('readFileSync(fd)'))
        self.assertLess(proof.NODE.index('!== CHAT_SOURCE_SHA256'),proof.NODE.index("import('data:text/javascript;base64,'"))
        self.assertLess(text.index('mark_attempt(directory_fd)\n', text.index('def run():')), text.index("return docker('exec'"))
        self.assertNotIn("'-e'", text)
        self.assertNotIn('.mail-proof-', text)
        self.assertIn("PIN = '4d4c15315d80b5fb7e9f8c2f3f883b10c1121c40'", text)
        self.assertNotIn('console.', proof.NODE)

    def test_workflow_allowlist_pin_and_dispatch_scope(self):
        workflow = yaml.load((ROOT / '.github/workflows/deploy.yml').read_text(), Loader=yaml.BaseLoader)
        self.assertEqual(set(workflow['on']), {'workflow_dispatch'})
        self.assertEqual(workflow['permissions'], {'contents': 'read'})
        self.assertEqual(workflow['concurrency'], {'group':'nestlet-stage','cancel-in-progress':'false'})
        self.assertIn('stream-proof',workflow['on']['workflow_dispatch']['inputs']['operation']['options'])
        job = workflow['jobs']['preflight']
        self.assertIn("github.ref == 'refs/heads/ops/nestlet-schema5-email-release-20261007'",job['if'])
        self.assertIn("github.actor == 'ledondev520'",job['if'])
        self.assertEqual(job['environment'],'staging')
        command=job['steps'][-1]['run']
        self.assertIn(hashlib.sha256(SCRIPT.read_bytes()).hexdigest()+'  scripts/nestlet-stream-proof.py',command)
        self.assertIn('[[ "$RELEASE_SHA" == '+proof.PIN+' ]]',command)
        self.assertIn('StrictHostKeyChecking=yes',command)
        self.assertNotIn('StrictHostKeyChecking=no',command)
        self.assertIn('< scripts/nestlet-stream-proof.py >"$proof_output" 2>"$proof_errors"',command)
        self.assertIn('if [[ "$(cat "$proof_output")" == stream-completed ]]',command)
        result=subprocess.run(['bash','-n'],input=command,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_source_loader_checks_metadata_before_import(self):
        source_path = os.environ.get('NESTLET_PROOF_PUBLIC_CHAT_SOURCE')
        self.assertTrue(source_path, 'Provide only the pinned public chat.js source path')
        source = Path(source_path).read_bytes()
        self.assertEqual(hashlib.sha256(source).hexdigest(), 'fdb895877c19ce71fa8bb8039283b33bce4bcb7cb1ce3f4620ea569cbb1a2c3a')
        tests = r'''
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, unlinkSync, linkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
const root = mkdtempSync(tmpdir()+'/nestlet-public-proof-');
const path = root+'/chat.js';
const source = Buffer.from('__PUBLIC_SOURCE__','base64');
const options = {root,uid:process.getuid()};
try {
  writeFileSync(path,source,{mode:0o644});
  assert.equal(typeof await loadParser(options),'function');
  for(const mode of [0o666,0o755]) {
    chmodSync(path,mode);await assert.rejects(loadParser(options));
  }
  chmodSync(path,0o644);
  await assert.rejects(loadParser({...options,uid:process.getuid()+1}));
  writeFileSync(path,'small');await assert.rejects(loadParser(options));
  writeFileSync(path,Buffer.alloc(source.length,32));await assert.rejects(loadParser(options));
  writeFileSync(path,source);
  linkSync(path,root+'/hardlink');await assert.rejects(loadParser(options));unlinkSync(root+'/hardlink');
  unlinkSync(path);symlinkSync(root+'/missing',path);await assert.rejects(loadParser(options));unlinkSync(path);
  writeFileSync(path,source,{mode:0o644});
  symlinkSync(root,root+'-link');await assert.rejects(loadParser({...options,root:root+'-link'}));unlinkSync(root+'-link');
  chmodSync(root,0o777);await assert.rejects(loadParser(options));chmodSync(root,0o700);
} finally { rmSync(root,{recursive:true,force:true}); }
process.stdout.write('public loader contracts passed\n');
'''.replace('__PUBLIC_SOURCE__',base64.b64encode(source).decode())
        result = subprocess.run(['node', '--input-type=module', '-'], input=proof.NODE + tests,
                                capture_output=True, text=True, timeout=15, env={'PATH':os.environ['PATH']})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, 'public loader contracts passed\n')
        self.assertEqual(result.stderr, '')

    def test_real_public_parser_with_mocked_provider(self):
        source_path = os.environ.get('NESTLET_PROOF_PUBLIC_CHAT_SOURCE')
        self.assertTrue(source_path, 'Provide only the pinned public chat.js source path')
        source = Path(source_path).read_bytes()
        self.assertEqual(hashlib.sha256(source).hexdigest(), 'fdb895877c19ce71fa8bb8039283b33bce4bcb7cb1ce3f4620ea569cbb1a2c3a')
        loader = "\nconst parserLoader = async () => (await import('data:text/javascript;base64," + base64.b64encode(source).decode() + "')).parseProviderStream;\n"
        tests = r'''
import assert from 'node:assert/strict';
const env = { DEEPSEEK_API_KEY:'SYNTHETIC-NOT-A-REAL-KEY', ENABLE_LIVE_AI:'true', DEEPSEEK_MODEL:'deepseek-flash' };
const frame = value => 'data: '+JSON.stringify(value)+'\n\n';
const delta = text => frame({choices:[{delta:{content:text},finish_reason:null}]});
const finish = reason => frame({choices:[{delta:{},finish_reason:reason}]});
const good = delta('OK')+finish('stop')+'data: [DONE]\n\n';
const response = body => new Response(body,{headers:{'Content-Type':'text/event-stream'}});
let calls = 0;
const accept = async (url,options) => {
  calls++;
  assert.equal(url,'https://api.deepseek.com/chat/completions');
  assert.equal(options.method,'POST'); assert.equal(options.redirect,'error');
  assert.equal(options.headers.Authorization,'Bearer '+env.DEEPSEEK_API_KEY);
  assert.deepEqual(JSON.parse(options.body),{ model:'deepseek-flash',stream:true,thinking:{type:'disabled'},max_tokens:16,
    messages:[{role:'user',content:'This is a synthetic connectivity test with no personal or case data. Reply only with OK.'}] });
  assert.ok(!options.body.includes(env.DEEPSEEK_API_KEY));
  return response(good);
};
assert.equal(await streamProof({env,parserLoader,fetchImpl:accept}),true);
assert.equal(calls,1);
for (const override of [{DEEPSEEK_API_KEY:''},{DEEPSEEK_API_KEY:null},{ENABLE_LIVE_AI:'false'},{DEEPSEEK_MODEL:'other'}]) {
  assert.equal(await streamProof({env:{...env,...override},parserLoader,fetchImpl:accept}),false);
}
assert.equal(await streamProof({env,parserLoader:async()=>{throw new Error('PRIVATE');},fetchImpl:accept}),false);
assert.equal(calls,1);
// The default app contract permits an omitted DEEPSEEK_MODEL as Flash.
assert.equal(await streamProof({env:{...env,DEEPSEEK_MODEL:undefined},parserLoader,fetchImpl:accept}),true);
for (const body of [delta('OK'),delta('OK')+'data: [DONE]\n\n',delta('OK')+finish('length')+'data: [DONE]\n\n',finish('stop')+'data: [DONE]\n\n','data: invalid\n\n',frame({error:{message:'PRIVATE'}}),frame({choices:[{delta:{tool_calls:[]}}]}),delta('x'.repeat(129))+finish('stop')+'data: [DONE]\n\n','x'.repeat(65537),new Uint8Array([0xff,0xff])]) {
  let attempts=0;
  assert.equal(await streamProof({env,parserLoader,fetchImpl:async()=>{attempts++;return response(body);}}),false);
  assert.equal(attempts,1);
}
for (const value of [new Response('PRIVATE',{status:401}), new Response(good), new Response(good,{headers:{'Content-Type':'text/event-stream','Content-Length':'65537'}}),new Response(good,{headers:{'Content-Type':'text/event-stream','Content-Length':'wrong'}})]) {
  let attempts=0;
  assert.equal(await streamProof({env,parserLoader,fetchImpl:async()=>{attempts++;return value;}}),false);
  assert.equal(attempts,1);
}
// Fragmented actual SSE parsing, including a complete multibyte UTF-8 scalar.
const bytes = new TextEncoder().encode(delta('好')+finish('stop')+'data: [DONE]\n\n');
assert.equal(await streamProof({env,parserLoader,fetchImpl:async()=>response(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close();}}))}),true);
let fetchTimeouts=0;
assert.equal(await streamProof({env,parserLoader,timeoutMs:10,fetchImpl:async()=>{fetchTimeouts++;return new Promise(()=>{});}}),false);
assert.equal(fetchTimeouts,1);
let bodyTimeouts=0,cancelled=false;
assert.equal(await streamProof({env,parserLoader,timeoutMs:10,fetchImpl:async()=>{bodyTimeouts++;return response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}}));}}),false);
assert.equal(bodyTimeouts,1);assert.equal(cancelled,true);
let throws=0;
assert.equal(await streamProof({env,parserLoader,fetchImpl:async()=>{throws++;throw new Error('PRIVATE');}}),false);
assert.equal(throws,1);
process.stdout.write('mocked stream contracts passed\n');
'''
        result = subprocess.run(['node', '--input-type=module', '-'], input=proof.NODE + loader + tests,
                                capture_output=True, text=True, timeout=15, env={'PATH':os.environ['PATH']})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, 'mocked stream contracts passed\n')
        self.assertEqual(result.stderr, '')


if __name__ == '__main__':
    unittest.main()
