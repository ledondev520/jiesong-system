#!/usr/bin/env python3
"""One reviewed plain test email, independent of deployment or account flows.

Run only through the existing reviewed maintenance channel. Mail credentials stay
inside the already-running container. No environment file or database is read.
A durable, exclusive private marker precedes execution: ambiguous outcomes and
repeat dispatches must be reconciled against the inbox, never retried blindly.
"""
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

BASE = Path('/opt/nestlet')
PIN = '4d4c15315d80b5fb7e9f8c2f3f883b10c1121c40'
ATTEMPT = '20261007-9d842c72e618'
MARKER = '.mail-proof-' + ATTEMPT
ACCEPTED = 'provider-accepted'
UNCONFIRMED = 'provider-unconfirmed'
# All inputs to the external message are fixed here. No links, tokens, credentials,
# account creation, database access, or caller-supplied recipient/message fields.
NODE = r'''
import { createHmac, randomUUID } from 'node:crypto';
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
const clean = value => typeof value === 'string' ? value.trim() : '';
const singleEmail = value => value.length <= 254 && /^[^\s@,;<>()[\]\\"]+@[^\s@,;<>()[\]\\"]+\.[^\s@,;<>()[\]\\"]+$/.test(value) && !/[\x00-\x1f\x7f]/.test(value);
const discard = response => { try { Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch {} };
async function sendProof({env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 10000} = {}) {
  let timer;
  const controller = new AbortController();
  try {
    const keyId = clean(env.ALIBABA_CLOUD_ACCESS_KEY_ID);
    const keySecret = clean(env.ALIBABA_CLOUD_ACCESS_KEY_SECRET);
    const sender = clean(env.NESTLET_EMAIL_FROM);
    if (!keyId || !keySecret || !singleEmail(sender)) return false;
    const params = {
      AccessKeyId: keyId, Action: 'SingleSendMail', Version: '2015-11-23',
      RegionId: 'cn-hangzhou', Format: 'JSON', SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0',
      SignatureNonce: randomUUID(), Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      AccountName: sender, AddressType: '1', ReplyToAddress: 'false', FromAlias: 'Nestlet',
      ToAddress: 'may-stans@agentmail.to',
      Subject: 'Nestlet DirectMail delivery test [20261007-9d842c72e618]',
      TextBody: 'This is a one-time Nestlet email delivery test. No action is required. No account was created. This message contains no verification code, password, reset token, or sign-in link.\n\nTest reference: 20261007-9d842c72e618',
    };
    const token = clean(env.ALIBABA_CLOUD_SECURITY_TOKEN);
    if (token) params.SecurityToken = token;
    const canonical = Object.keys(params).sort().map(key => `${encode(key)}=${encode(params[key])}`).join('&');
    params.Signature = createHmac('sha1', `${keySecret}&`).update(`POST&%2F&${encode(canonical)}`).digest('base64');
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error()); }, timeoutMs);
    });
    const request = (async () => {
      const response = await fetchImpl('https://dm.aliyuncs.com/', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(), redirect: 'error', signal: controller.signal,
      });
      const size = response.headers?.get('content-length');
      if (controller.signal.aborted || !response.ok || !response.body || (size != null && (!/^\d+$/.test(size) || Number(size) > 65536))) {
        discard(response); return false;
      }
      const reader = response.body.getReader();
      const cancel = () => { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} };
      controller.signal.addEventListener('abort', cancel, { once: true });
      const chunks = [];
      let length = 0;
      try {
        for (;;) {
          controller.signal.throwIfAborted();
          const part = await reader.read();
          controller.signal.throwIfAborted();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > 65536) return false;
          chunks.push(Buffer.from(part.value));
        }
        const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, length)));
        return !!value && typeof value === 'object' && !Array.isArray(value) && !Object.hasOwn(value, 'Code')
          && typeof value.RequestId === 'string' && !!value.RequestId.trim()
          && typeof value.EnvId === 'string' && !!value.EnvId.trim();
      } finally {
        controller.signal.removeEventListener('abort', cancel);
        cancel(); reader.releaseLock();
      }
    })();
    return await Promise.race([request, deadline]);
  } catch { return false; }
  finally { clearTimeout(timer); }
}
'''
NODE_MAIN = "\nconst accepted = await sendProof(); process.stdout.write(accepted ? 'provider-accepted\\n' : 'provider-unconfirmed\\n'); process.exitCode = accepted ? 0 : 1;\n"


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


def mark_attempt(directory_fd):
    # Never replace, truncate, remove, or automatically reset this marker.
    fd = os.open(MARKER, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory_fd)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write((ATTEMPT + '\nattempt-reserved; do not resend\n').encode())
            output.flush(); os.fsync(output.fileno())
        os.fsync(directory_fd)
    except BaseException:
        # A failed reservation stays in place and must not permit a later send.
        raise


def run():
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
        mark_attempt(directory_fd)
        # No -e, files, mounts, new container, or app API. Existing credentials are
        # read only by Node already inside this exact running container.
        return docker('exec', '-i', container, 'node', '--input-type=module', '-',
                      code=NODE + NODE_MAIN, timeout=20) == ACCEPTED
    finally:
        os.close(lock_fd); os.close(directory_fd); os.close(base_fd)


if __name__ == '__main__':
    try:
        accepted = run()
    except BaseException:
        accepted = False
    print(ACCEPTED if accepted else UNCONFIRMED)
    sys.exit(0 if accepted else 1)
