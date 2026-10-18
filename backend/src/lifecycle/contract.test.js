const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  check,
  scanSource,
  scanRoutes,
} = require('../../../scripts/check-lifecycle.cjs');
const root = path.resolve(__dirname, '../../..');

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-gate-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const registry = JSON.parse(
    fs.readFileSync(path.join(root, 'lifecycle/resources.json')),
  );
  const files = [
    'lifecycle/resources.json',
    'lifecycle/legacy-routes.json',
    'backend/package.json',
    'backend/src/integration/resource-lifecycle.integration.js',
    'frontend/src/lib/hooks/list-lifecycle.test.tsx',
    ...registry.resources.map((r) => r.update.file),
    ...registry.lists.flatMap((list) => [list.file, list.test]),
  ];
  fs.cpSync(
    path.join(root, 'backend/src/routes'),
    path.join(temp, 'backend/src/routes'),
    { recursive: true },
  );
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(temp, file)), { recursive: true });
    fs.copyFileSync(path.join(root, file), path.join(temp, file));
  }
  const baselineRoutes = new Set(scanRoutes(root).map((r) => r.key));
  return { temp, verify: () => check(temp, { baselineRoutes }), registry };
}
const appendRoute = (temp) =>
  fs.appendFileSync(
    path.join(temp, 'backend/src/routes/system.js'),
    "\nrouter.post('/synthetic-new-resource', handler);\n",
  );

test('lifecycle gate accepts the current registry and reasoned legacy baseline', (t) => {
  const f = fixture(t);
  assert.equal(f.verify().resources, f.registry.resources.length);
});

test('new routes in an existing module fail with registry, template and test paths', (t) => {
  const f = fixture(t);
  appendRoute(f.temp);
  assert.throws(
    f.verify,
    /system.js:\d+: unregistered.*resources.json.*resource.template.json.*resource-lifecycle.integration.js/s,
  );
});

test('new nested route files and PATCH registrations cannot escape the scan', (t) => {
  const f = fixture(t);
  const file = path.join(f.temp, 'backend/src/routes/new/nested.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    "const api = Router(); api.route('/new').patch(handler);",
  );
  assert.throws(f.verify, /new\/nested.js.*PATCH \/new/);
});

test('new routes cannot be added to the legacy baseline', (t) => {
  const f = fixture(t);
  appendRoute(f.temp);
  const file = path.join(f.temp, 'lifecycle/legacy-routes.json');
  const legacy = JSON.parse(fs.readFileSync(file));
  legacy.routes.push({
    key: 'backend/src/routes/system.js POST /synthetic-new-resource',
    reason: 'Trying to bypass registration',
  });
  fs.writeFileSync(file, JSON.stringify(legacy));
  assert.throws(f.verify, /new since PR #62 and cannot be exempted/);
});

test('missing matrix cases fail even when the test file exists', (t) => {
  const f = fixture(t);
  delete f.registry.resources[0].matrix;
  fs.writeFileSync(
    path.join(f.temp, 'lifecycle/resources.json'),
    JSON.stringify(f.registry),
  );
  assert.throws(
    f.verify,
    /needs all lifecycle matrix cases.*resource.template.json/,
  );
});

test('legacy routes require reasons', (t) => {
  const f = fixture(t);
  const file = path.join(f.temp, 'lifecycle/legacy-routes.json');
  const legacy = JSON.parse(fs.readFileSync(file));
  legacy.routes[0].reason = '';
  fs.writeFileSync(file, JSON.stringify(legacy));
  assert.throws(f.verify, /needs a concrete retention reason/);
});

test('missing generic matrix fails before tests can be silently skipped', (t) => {
  const f = fixture(t);
  fs.unlinkSync(
    path.join(
      f.temp,
      'backend/src/integration/resource-lifecycle.integration.js',
    ),
  );
  assert.throws(f.verify, /missing generic lifecycle matrix/);
});

test('route parser ignores comments and external HTTP calls and supports literal computed methods', () => {
  const rows = scanSource(
    "const router = Router(); /* router.post('/fake') */ router['put']('/real', handler); client.post(remote, data); router.route('/chain').post(handler).patch(handler);",
    'fixture.js',
  );
  assert.deepEqual(rows.map((r) => r.key).sort(), [
    'fixture.js PATCH /chain',
    'fixture.js POST /chain',
    'fixture.js PUT /real',
  ]);
  assert.throws(
    () =>
      scanSource(
        'const router = Router(); router.post(dynamic, handler)',
        'fixture.js',
      ),
    /literal route path/,
  );
  assert.throws(
    () =>
      scanSource(
        'const router = Router(); router[method](path, handler)',
        'fixture.js',
      ),
    /dynamic route method/,
  );
});

test('registered updates cannot return to hand-written persistence payloads', (t) => {
  const f = fixture(t);
  const file = path.join(f.temp, f.registry.resources[0].update.file);
  fs.writeFileSync(
    file,
    fs
      .readFileSync(file, 'utf8')
      .replace(
        'const data = partialUpdate(req.body, brokerFields)',
        'const data = req.body',
      ),
  );
  assert.throws(
    f.verify,
    /customsBrokerController.js.*updateCustomsBroker must construct updates with partialUpdate.*resource.template.json/,
  );
});

test('registered lists cannot add a second filter owner beside the shared hook', (t) => {
  const f = fixture(t);
  fs.appendFileSync(
    path.join(f.temp, f.registry.lists[0].file),
    "\nconst [keyword, setKeyword] = useState('');\n",
  );
  assert.throws(
    f.verify,
    /InventoryTab.tsx.*use frontend\/src\/lib\/hooks\/useListUrlState.ts/,
  );
});

test('router aliases cannot hide a new write endpoint', (t) => {
  const f = fixture(t);
  fs.appendFileSync(
    path.join(f.temp, 'backend/src/routes/system.js'),
    "\nconst writeApi = router; writeApi.post('/synthetic-alias', handler);\n",
  );
  assert.throws(f.verify, /unregistered.*POST \/synthetic-alias/);
});

test('registering a new route with an unrelated existing matrix is rejected', (t) => {
  const f = fixture(t);
  appendRoute(f.temp);
  f.registry.resources.push({
    ...f.registry.resources[0],
    id: 'synthetic-new-resource',
    routes: ['POST /synthetic-new-resource'],
  });
  fs.writeFileSync(
    path.join(f.temp, 'lifecycle/resources.json'),
    JSON.stringify(f.registry),
  );
  assert.throws(f.verify, /synthetic-new-resource.*matrix.*routes/);
});
