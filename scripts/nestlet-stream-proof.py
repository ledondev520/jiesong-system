#!/usr/bin/env python3
"""One reviewed synthetic stream, independent of deployment or account flows.

Run only through the existing reviewed maintenance channel. Provider credentials stay
inside the already-running container. No environment file or database is read.
A durable, exclusive private marker precedes execution: ambiguous outcomes and
repeat dispatches remain unconfirmed, never retried or reset automatically.
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
ATTEMPT = '20261007-a782d6f3419c'
MARKER = '.stream-proof-' + ATTEMPT
ACCEPTED = 'stream-completed'
UNCONFIRMED = 'provider-unconfirmed'
# The only outbound content is one fixed synthetic prompt. No account, case,
# image, document, caller-selected endpoint or configurable prompt is accepted.
NODE = r'''
import { createHash } from 'node:crypto';
import { constants, openSync, fstatSync, readFileSync, closeSync } from 'node:fs';
const CHAT_SOURCE_SHA256 = 'fdb895877c19ce71fa8bb8039283b33bce4bcb7cb1ce3f4620ea569cbb1a2c3a';
const CHAT_SOURCE_BYTES = 12143;
const discard = response => { try { Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch {} };
async function loadParser({root = '/app', uid = 1000} = {}) {
  // Fixed runtime call only; overrides below are used solely by local fixtures.
  // No app mount is permitted by the host guard. Open parents/module no-follow,
  // verify public metadata before reads, then import only the exact verified bytes.
  const directory = openSync(root, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  let fd;
  try {
    const parent = fstatSync(directory);
    if (!parent.isDirectory() || (parent.mode & 0o022)) throw new Error();
    fd = openSync(`/proc/self/fd/${directory}/chat.js`, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = fstatSync(fd);
    if (!before.isFile() || before.nlink !== 1 || before.uid !== uid
        || (before.mode & 0o133) || before.size !== CHAT_SOURCE_BYTES) throw new Error();
    const source = readFileSync(fd);
    const after = fstatSync(fd);
    if (source.length !== CHAT_SOURCE_BYTES || before.dev !== after.dev || before.ino !== after.ino
        || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
        || createHash('sha256').update(source).digest('hex') !== CHAT_SOURCE_SHA256) throw new Error();
    // Pinned 4d source is pure and has no imports. This avoids a path reopen race.
    return (await import('data:text/javascript;base64,' + source.toString('base64'))).parseProviderStream;
  } finally {
    if (fd !== undefined) closeSync(fd);
    closeSync(directory);
  }
}
async function streamProof({env = process.env, fetchImpl = globalThis.fetch, parserLoader = loadParser, timeoutMs = 20000} = {}) {
  let timer, upstream, reader;
  const controller = new AbortController();
  const cancel = () => { try { Promise.resolve(reader?.cancel()).catch(() => {}); } catch {} };
  try {
    // Follow the existing app's exact server-environment contract. No key fallback,
    // settings API, runtime.env read or other model/endpoint is allowed.
    const apiKey = env.DEEPSEEK_API_KEY;
    if (typeof apiKey !== 'string' || !apiKey || env.ENABLE_LIVE_AI !== 'true'
        || (env.DEEPSEEK_MODEL && env.DEEPSEEK_MODEL !== 'deepseek-flash')) return false;
    const parseProviderStream = await parserLoader();
    if (typeof parseProviderStream !== 'function') return false;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); cancel(); reject(new Error()); }, timeoutMs);
    });
    const request = (async () => {
      upstream = await fetchImpl('https://api.deepseek.com/chat/completions', {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'deepseek-flash', stream: true, thinking: { type: 'disabled' }, max_tokens: 16,
          messages: [{ role: 'user', content: 'This is a synthetic connectivity test with no personal or case data. Reply only with OK.' }] }),
      });
      const size = upstream.headers?.get('content-length');
      if (controller.signal.aborted || !upstream.ok || !upstream.body
          || !(upstream.headers.get('content-type') || '').toLowerCase().includes('text/event-stream')
          || (size != null && (!/^\d+$/.test(size) || Number(size) > 65536))) {
        discard(upstream); return false;
      }
      reader = upstream.body.getReader();
      controller.signal.addEventListener('abort', cancel, { once: true });
      async function* chunks() {
        let bytes = 0;
        for (;;) {
          controller.signal.throwIfAborted();
          const part = await reader.read();
          controller.signal.throwIfAborted();
          if (part.done) return;
          bytes += part.value.byteLength;
          if (bytes > 65536) throw new Error();
          yield part.value;
        }
      }
      let done = false, characters = 0;
      for await (const event of parseProviderStream(chunks())) {
        controller.signal.throwIfAborted();
        if (event.type === 'delta') {
          characters += event.text.length;
          if (characters > 128 || done) throw new Error();
        } else if (event.type === 'done') {
          if (done) throw new Error();
          done = true;
        } else throw new Error();
      }
      // The pinned app parser also requires stop + [DONE] and nonempty content.
      return done && characters > 0;
    })();
    return await Promise.race([request, deadline]);
  } catch { return false; }
  finally {
    clearTimeout(timer);
    controller.abort(); cancel();
    if (reader) { try { reader.releaseLock(); } catch {} }
    else discard(upstream);
  }
}
'''
NODE_MAIN = "\nconst completed = await streamProof(); process.stdout.write(completed ? 'stream-completed\\n' : 'provider-unconfirmed\\n'); process.exitCode = completed ? 0 : 1;\n"



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
            output.write((ATTEMPT + '\nattempt-reserved; do not repeat\n').encode())
            output.flush(); os.fsync(output.fileno())
        os.fsync(directory_fd)
    except BaseException:
        # A failed reservation stays in place and must not permit a later request.
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
        mark_attempt(directory_fd)
        # No -e, files, mounts, new container, or app API. Existing credentials are
        # read only by Node already inside this exact running container.
        return docker('exec', '-i', container, 'node', '--input-type=module', '-',
                      code=NODE + NODE_MAIN, timeout=30) == ACCEPTED
    finally:
        os.close(lock_fd); os.close(directory_fd); os.close(base_fd)


if __name__ == '__main__':
    try:
        accepted = run()
    except BaseException:
        accepted = False
    print(ACCEPTED if accepted else UNCONFIRMED)
    sys.exit(0 if accepted else 1)
