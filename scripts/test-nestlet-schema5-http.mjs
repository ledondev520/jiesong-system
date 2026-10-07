#!/usr/bin/env node
// Exact release HTTP gate against a local candidate with synthetic configuration.
// Provider calls are neither needed nor triggered; status flags prove recognition only.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, scryptSync } from 'node:crypto';
assert.equal(process.argv.length, 3, 'Supply the reviewed candidate source root');
const source = resolve(process.argv[2]), directory = mkdtempSync('/tmp/nestlet-schema5-http-');
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const salt = randomBytes(16), passwordHash = `scrypt$${salt.toString('base64url')}$${scryptSync('synthetic-local-release-check', salt, 32).toString('base64url')}`;
const child = spawn(process.execPath, ['server.js'], { cwd: source, stdio: ['ignore', 'ignore', 'pipe'], env: {
  PATH: process.env.PATH, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'production',
  PUBLIC_ORIGIN: 'https://nestlet.celerada.link', NESTLET_DB_PATH: join(directory, 'nestlet.sqlite'),
  NESTLET_OPERATOR_PASSWORD_HASH: passwordHash, NESTLET_OPERATOR_USERNAME: 'synthetic-owner-alias',
  ALIBABA_CLOUD_ACCESS_KEY_ID: 'synthetic-not-a-provider-key', ALIBABA_CLOUD_ACCESS_KEY_SECRET: 'synthetic-not-a-provider-secret',
  NESTLET_EMAIL_FROM: 'synthetic-sender@example.invalid', ENABLE_LIVE_AI: 'false',
} });
let diagnostic = '';child.stderr.on('data', bytes => { diagnostic += bytes; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) break;
    try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).status === 200) { ready = true; break; } } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready, 'Synthetic local candidate did not start: ' + diagnostic);
  const shell = readFileSync(new URL('./nestlet-upgrade-schema5.sh', import.meta.url), 'utf8');
  const section = shell.slice(shell.indexOf('check_http() {'));
  const code = section.match(/<<'PY'\n([\s\S]*?)\nPY/)[1].replace('127.0.0.1:4173', '127.0.0.1:' + port);
  const result = spawnSync('python3', ['-', 'true'], { input: code, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /unauthenticated boundaries passed/u);
  const status = await (await fetch(`http://127.0.0.1:${port}/api/status`)).json();
  assert.equal(status.emailDeliveryConfigured, true); assert.equal(status.registrationEnabled, true);
  console.log('PASS: exact release HTTP gate on real local schema5 server with synthetic operator/mail configuration; public capability flags, authenticated boundaries and no email/account diagnostic leakage. No provider send or production access.');
} finally {
  if (child.exitCode === null) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); }
  rmSync(directory, { recursive: true, force: true });
}
