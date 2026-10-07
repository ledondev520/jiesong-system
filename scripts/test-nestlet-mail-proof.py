#!/usr/bin/env python3
"""Local-only tests: synthetic environment and mocked fetch; never Docker/SSH/mail."""
import contextlib
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
import yaml
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/nestlet-mail-proof.py'
spec = importlib.util.spec_from_file_location('mailproof', SCRIPT)
proof = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proof)


class MailProofSafety(unittest.TestCase):
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

    def test_docker_cli_uses_only_existing_daemon_and_suppresses_errors(self):
        result = subprocess.CompletedProcess([], 0, 'provider-accepted\n', '')
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

    def test_script_has_no_other_external_or_mutating_routes(self):
        text = SCRIPT.read_text()
        self.assertEqual(proof.NODE.count('fetchImpl('), 1)
        for forbidden in ['runtime.env', '/api/', 'sqlite', 'docker compose', 'restart', 'stop', 'prune', 'Config.Env']:
            self.assertNotIn(forbidden, proof.NODE)
        self.assertIn("mark_attempt(directory_fd)\n", text)
        self.assertLess(text.index('mark_attempt(directory_fd)\n', text.index('def run():')), text.index("return docker('exec'"))
        self.assertNotIn("'-e'", text)
        self.assertEqual(proof.NODE.count('may-stans@agentmail.to'), 1)

    def test_workflow_is_dispatch_only_and_uses_pinned_script(self):
        text = (ROOT / '.github/workflows/deploy.yml').read_text()
        workflow = yaml.load(text, Loader=yaml.BaseLoader)
        self.assertEqual(set(workflow['on']), {'workflow_dispatch'})
        self.assertEqual(workflow['permissions'], {'contents': 'read'})
        self.assertEqual(workflow['concurrency'], {'group':'nestlet-stage','cancel-in-progress':'false'})
        job = workflow['jobs']['preflight']
        self.assertIn("github.ref == 'refs/heads/ops/nestlet-schema5-email-release-20261007'",job['if'])
        self.assertIn("github.actor == 'ledondev520'",job['if'])
        self.assertEqual(job['environment'],'staging')
        command=job['steps'][-1]['run']
        self.assertIn(hashlib.sha256(SCRIPT.read_bytes()).hexdigest()+'  scripts/nestlet-mail-proof.py',command)
        self.assertIn('[[ "$RELEASE_SHA" == '+proof.PIN+' ]]',command)
        self.assertIn('StrictHostKeyChecking=yes',command)
        self.assertNotIn('StrictHostKeyChecking=no',command)
        self.assertIn('< scripts/nestlet-mail-proof.py >"$proof_output" 2>"$proof_errors"',command)
        self.assertIn('if [[ "$(cat "$proof_output")" == provider-accepted ]]',command)
        result=subprocess.run(['bash','-n'],input=command,capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_node_mocked_request_contracts(self):
        tests = r'''
import assert from 'node:assert/strict';
const env = {ALIBABA_CLOUD_ACCESS_KEY_ID:'SYNTHETIC-ID',ALIBABA_CLOUD_ACCESS_KEY_SECRET:'SYNTHETIC-SECRET',NESTLET_EMAIL_FROM:'synthetic@example.invalid'};
let calls = 0;
const good = () => new Response(JSON.stringify({RequestId:'synthetic-request',EnvId:'synthetic-event'}));
const accept = async (url, options) => {
  calls++;
  assert.equal(url, 'https://dm.aliyuncs.com/');
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'error');
  const params = Object.fromEntries(new URLSearchParams(options.body));
  assert.equal(params.ToAddress, 'may-stans@agentmail.to');
  assert.equal(params.Subject, 'Nestlet DirectMail delivery test [20261007-9d842c72e618]');
  assert.match(params.TextBody, /No action is required\. No account was created\./);
  assert.equal(params.Action, 'SingleSendMail');
  assert.equal(params.AccountName, env.NESTLET_EMAIL_FROM);
  assert.equal(params.ReplyToAddress, 'false');
  assert.equal(params.SecurityToken, undefined);
  assert.ok(!options.body.includes(env.ALIBABA_CLOUD_ACCESS_KEY_SECRET));
  const {Signature, ...unsigned} = params;
  const canonical = Object.keys(unsigned).sort().map(key => `${encode(key)}=${encode(unsigned[key])}`).join('&');
  assert.equal(Signature, createHmac('sha1', env.ALIBABA_CLOUD_ACCESS_KEY_SECRET+'&').update('POST&%2F&'+encode(canonical)).digest('base64'));
  return good();
};
assert.equal(await sendProof({env,fetchImpl:accept}),true);
assert.equal(calls,1);
assert.equal(await sendProof({env:{...env,ALIBABA_CLOUD_ACCESS_KEY_SECRET:''},fetchImpl:accept}),false);
assert.equal(await sendProof({env:{...env,NESTLET_EMAIL_FROM:'first@invalid.test,other@invalid.test'},fetchImpl:accept}),false);
assert.equal(calls,1);
let tokenCalls=0;
assert.equal(await sendProof({env:{...env,ALIBABA_CLOUD_SECURITY_TOKEN:'SYNTHETIC-TOKEN'},fetchImpl:async(url,options)=>{
  tokenCalls++; assert.equal(new URLSearchParams(options.body).get('SecurityToken'),'SYNTHETIC-TOKEN'); return good();
}}),true);
assert.equal(tokenCalls,1);
for (const body of ['{}','null','[]','{"RequestId":"x"}','{"EnvId":"x"}','{"RequestId":" ","EnvId":"x"}','{"RequestId":"x","EnvId":"x","Code":"Rejected"}','not json']) {
  let attempts=0;
  assert.equal(await sendProof({env,fetchImpl:async()=>{attempts++;return new Response(body);}}),false);
  assert.equal(attempts,1);
}
for(const response of [new Response('PRIVATE PROVIDER ERROR',{status:400}), new Response('x'.repeat(65537)), new Response('{}',{headers:{'Content-Length':'65537'}})]) {
  let attempts=0;
  assert.equal(await sendProof({env,fetchImpl:async()=>{attempts++;return response;}}),false);
  assert.equal(attempts,1);
}
let timeouts=0;
assert.equal(await sendProof({env,timeoutMs:10,fetchImpl:async()=>{timeouts++; return new Promise(()=>{});}}),false);
assert.equal(timeouts,1);
let bodyTimeouts=0;
assert.equal(await sendProof({env,timeoutMs:10,fetchImpl:async()=>{bodyTimeouts++; return new Response(new ReadableStream({pull(){return new Promise(()=>{});}}));}}),false);
assert.equal(bodyTimeouts,1);
let throws=0;
assert.equal(await sendProof({env,fetchImpl:async()=>{throws++;throw new Error('PRIVATE');}}),false);
assert.equal(throws,1);
// Official Alibaba DirectMail HMAC-SHA1 worked example, not an operational key.
const official = "AccessKeyId=testid&AccountName=%3Ca%25b%27%3E&Action=SingleSendMail&AddressType=1&Format=XML&HtmlBody=4&RegionId=cn-hangzhou&ReplyToAddress=true&SignatureMethod=HMAC-SHA1&SignatureNonce=c1b2c332-4cfb-4a0f-b8cc-ebe622aa0a5c&SignatureVersion=1.0&Subject=3&TagName=2&Timestamp=2016-10-20T06%3A27%3A56Z&ToAddress=1%40test.com&Version=2015-11-23";
assert.equal(createHmac('sha1','testsecret&').update('POST&%2F&'+encode(official)).digest('base64'),'llJfXJjBW3OacrVgxxsITgYaYm0=');
process.stdout.write('mocked mail contracts passed\n');
'''
        result = subprocess.run(['node', '--input-type=module', '-'], input=proof.NODE + tests,
                                capture_output=True, text=True, timeout=15, env={'PATH':os.environ['PATH']})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, 'mocked mail contracts passed\n')
        self.assertEqual(result.stderr, '')


if __name__ == '__main__':
    unittest.main()
