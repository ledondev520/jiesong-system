const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const defaults = require('../../../config/pricing.json');

test('HTTP pricing settings require ADMIN, persist a real file, reject invalid/stale requests and omit values from audit', async t => {
  t.mock.method(Date.prototype, 'toISOString', () => '2026-10-18T01:01:01.400Z');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-http-'));
  const target = path.join(dir, 'pricing.json');
  fs.writeFileSync(target, JSON.stringify(defaults));
  const previous = process.env.JIESONG_PRICING_CONFIG;
  process.env.JIESONG_PRICING_CONFIG = target;
  t.after(() => { if (previous === undefined) delete process.env.JIESONG_PRICING_CONFIG; else process.env.JIESONG_PRICING_CONFIG = previous; fs.rmSync(dir, { recursive: true }); });
  const auth = require('../middleware/auth');
  t.mock.method(auth, 'authenticate', (req, res, next) => {
    if (req.get('x-synthetic-role')) req.user = { id: 'synthetic-admin', role: req.get('x-synthetic-role') };
    next();
  });
  const logs = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  t.mock.method(process.stderr, 'write', (line, ...rest) => {
    if (String(line).includes('pricing_config_')) logs.push(JSON.parse(line));
    return originalWrite(line, ...rest);
  });
  const app = express(); app.use(express.json()); app.use('/system', require('./system'));
  app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ message: err.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const send = async (method, role, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/system/pricing-config`, {
      method, headers: { 'Content-Type': 'application/json', ...(role ? { 'x-synthetic-role': role } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  };
  for (const method of ['GET', 'PUT']) {
    assert.equal((await send(method)).status, 401);
    for (const role of ['BOSS', 'SALES', 'PURCHASE', 'WAREHOUSE', 'FINANCE']) assert.equal((await send(method, role)).status, 403);
  }
  const initial = await send('GET', 'ADMIN');
  assert.equal(initial.status, 200); assert.equal(initial.cache, 'no-store');
  const snapshot = initial.body.data;
  assert.deepEqual(snapshot.config, defaults);
  const invalid = await send('PUT', 'ADMIN', { config: { ...defaults, defaultMarkup: '0.4' }, revision: snapshot.revision });
  assert.equal(invalid.status, 400); assert.match(invalid.body.message, /defaultMarkup.*有限数字/);
  assert.deepEqual(JSON.parse(fs.readFileSync(target)), defaults);
  const config = { ...defaults, defaultMarkup: 0.4, roundUpTo: 5 };
  const saved = await send('PUT', 'ADMIN', { config, revision: snapshot.revision });
  assert.equal(saved.status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(target)), config);
  assert.deepEqual((await send('GET', 'ADMIN')).body.data.config, config);
  assert.equal((await send('PUT', 'ADMIN', { config: defaults, revision: snapshot.revision })).status, 409);
  const updated = logs.filter(event => event.event === 'pricing_config_updated');
  assert.equal(updated.length, 1);
  assert.deepEqual(updated[0].changedFields, ['defaultMarkup', 'roundUpTo']);
  assert.equal(updated[0].actorId, 'synthetic-admin');
  assert.deepEqual(updated, [{
    timestamp: '2026-10-18T01:01:01.400Z',
    event: 'pricing_config_updated',
    actorId: 'synthetic-admin',
    previousRevision: snapshot.revision,
    revision: saved.body.data.revision,
    changedFields: ['defaultMarkup', 'roundUpTo'],
  }]);
  // 预览：同一 priceFor 规则；仅 ADMIN；不写文件
  const preview = async (role, query) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/system/pricing-config/preview?${new URLSearchParams(query)}`, {
      headers: role ? { 'x-synthetic-role': role } : {},
    });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await preview(undefined, { costCny: '100' })).status, 401);
  for (const role of ['BOSS', 'SALES', 'PURCHASE', 'WAREHOUSE', 'FINANCE']) assert.equal((await preview(role, { costCny: '100' })).status, 403);
  const before = fs.readFileSync(target, 'utf8');
  const ok = await preview('ADMIN', { costCny: '100', spotRate: '7.2' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.status, 'OK');
  assert.equal(ok.body.data.unitPriceUsd, Math.ceil(Number(((100 * 1.4) / (7.2 - 0.2)).toFixed(6)) / 5) * 5);
  assert.equal((await preview('ADMIN', { costCny: '0' })).body.data.status, 'MISSING_COST');
  const draft = await preview('ADMIN', { costCny: '100', spotRate: '7.2', config: JSON.stringify({ ...defaults, roundUpTo: 1 }) });
  assert.equal(draft.body.data.unitPriceUsd, 19); // 草稿：加价 30%、步长 1 → 130/7=18.57 → 19
  assert.equal((await preview('ADMIN', { costCny: '100', config: '{bad' })).status, 400);
  assert.equal((await preview('ADMIN', { costCny: '100', config: JSON.stringify({ ...defaults, roundUpTo: 0 }) })).status, 400);
  assert.equal(fs.readFileSync(target, 'utf8'), before);
  const evidence = process.env.JIESONG_TEST_EVIDENCE_DIR;
  if (evidence) { fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(path.join(evidence, 'pricing-http-receipt.json'), JSON.stringify({ initial, invalid, saved, fileReadback: JSON.parse(fs.readFileSync(target)), audit: updated }, null, 2)); }
});
