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
    'config/pricing.schema.json',
    'lifecycle/legacy-routes.json',
    'backend/package.json',
    'backend/src/integration/resource-lifecycle.integration.js',
    'frontend/src/lib/hooks/list-lifecycle.test.tsx',
    ...registry.resources.flatMap((r) => [r.update?.file, r.test].filter(Boolean)),
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

test('renamed Express Router factories and saved route handles remain visible', () => {
  const source = `
    const { Router: makeRouter } = require('express');
    const api = makeRouter();
    const writeApi = api;
    const item = writeApi.route('/saved');
    const itemAlias = item;
    itemAlias.post(handler).patch(handler);
  `;
  assert.deepEqual(
    scanSource(source, 'fixture.js')
      .map((row) => row.key)
      .sort(),
    ['fixture.js PATCH /saved', 'fixture.js POST /saved'],
  );
});

const saveRegistry = (f) =>
  fs.writeFileSync(
    path.join(f.temp, 'lifecycle/resources.json'),
    JSON.stringify(f.registry),
  );
const singleton = (f) => {
  const resource = f.registry.resources.find((r) => r.id === 'pricing-config');
  assert.ok(
    resource,
    'pricing-config must be registered as a singleton-config',
  );
  return resource;
};

test('pricing singleton uses the real schema defaults and a reusable template', (t) => {
  const f = fixture(t);
  const resource = singleton(f);
  assert.equal(resource.kind, 'singleton-config');
  assert.deepEqual(
    resource.matrix.initial,
    require('../../../config/pricing.json'),
  );
  assert.deepEqual(
    resource,
    require('../../../lifecycle/singleton-config.template.json'),
  );
  assert.equal(f.verify().resources, f.registry.resources.length);
});

test('missing singleton registration fails red and restoring it passes green', (t) => {
  const f = fixture(t);
  const resource = singleton(f);
  f.registry.resources = f.registry.resources.filter((r) => r !== resource);
  saveRegistry(f);
  assert.throws(f.verify, /unregistered.*PUT \/pricing-config/);
  f.registry.resources.push(resource);
  saveRegistry(f);
  assert.doesNotThrow(f.verify);
});

for (const [name, change, message] of [
  [
    'kind',
    (r) => {
      delete r.kind;
    },
    /pricing-config.*matrix.*routes/,
  ],
  [
    'route',
    (r) => {
      r.routes = ['PUT /config'];
    },
    /singleton matrix/,
  ],
  [
    'path',
    (r) => {
      r.matrix.path = '/api/v1/system/ports';
    },
    /singleton matrix/,
  ],
  [
    'adapter',
    (r) => {
      r.matrix.adapter = 'sqlite';
    },
    /singleton matrix/,
  ],
  [
    'handler',
    (r) => {
      r.update.handler = 'getPricing';
    },
    /updatePricingConfig/,
  ],
  [
    'initial',
    (r) => {
      r.matrix.initial = { mode: 'tiered' };
    },
    /singleton matrix cases/,
  ],
  [
    'replacement',
    (r) => {
      r.matrix.replace.multiplier = 0;
    },
    /singleton matrix cases/,
  ],
  [
    'identical replacement',
    (r) => {
      r.matrix.replace = r.matrix.initial;
    },
    /singleton matrix cases/,
  ],
  [
    'missing invalid',
    (r) => {
      r.matrix.invalid = [];
    },
    /singleton matrix cases/,
  ],
  [
    'valid invalid',
    (r) => {
      r.matrix.invalid = [r.matrix.initial];
    },
    /singleton matrix cases/,
  ],
]) {
  test(`wrong singleton ${name} fails red and restoring it passes green`, (t) => {
    const f = fixture(t);
    const resource = singleton(f);
    const original = structuredClone(resource);
    change(resource);
    saveRegistry(f);
    assert.throws(f.verify, message);
    Object.assign(resource, original);
    saveRegistry(f);
    assert.doesNotThrow(f.verify);
  });
}

test('singleton update cannot bypass validated complete replacement', (t) => {
  const f = fixture(t);
  const resource = singleton(f);
  const file = path.join(f.temp, resource.update.file);
  const original = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(
    file,
    original.replace('pricing.updatePricingConfig(', 'pricing.writeUnchecked('),
  );
  assert.throws(
    f.verify,
    /updatePricing must construct updates with updatePricingConfig/,
  );
  fs.writeFileSync(file, original);
  assert.doesNotThrow(f.verify);
});

const actionEntry = (f) => {
  const resource = f.registry.resources.find((r) => r.kind === 'action');
  assert.ok(resource, 'an action resource must be registered');
  return resource;
};
const saveRegistryFile = (f) =>
  fs.writeFileSync(path.join(f.temp, 'lifecycle/resources.json'), JSON.stringify(f.registry));

test('action resources: the registered POST route passes, a missing proof test fails red', (t) => {
  const f = fixture(t);
  const resource = actionEntry(f);
  assert.equal(f.verify().resources, f.registry.resources.length);
  fs.unlinkSync(path.join(f.temp, resource.test));
  assert.throws(f.verify, /sales-purchase-drafts action needs exactly one POST route.*action\.template\.json/s);
});

test('action resources: a test file that never calls the route path fails', (t) => {
  const f = fixture(t);
  const resource = actionEntry(f);
  fs.writeFileSync(path.join(f.temp, resource.test), "test('unrelated', () => {});\n");
  assert.throws(f.verify, /sales-purchase-drafts action needs exactly one POST route/);
});

test('action resources: two routes, a matrix or an update helper are rejected', (t) => {
  for (const mutate of [
    (r) => r.routes.push('PUT /:id/purchase-drafts'),
    (r) => { r.matrix = { path: '/api/v1/sales' }; },
    (r) => { r.update = { file: 'backend/src/controllers/purchaseDraftController.js', handler: 'generate' }; },
  ]) {
    const f = fixture(t);
    mutate(actionEntry(f));
    saveRegistryFile(f);
    assert.throws(f.verify, /action needs exactly one POST route|does not exist/);
  }
});

test('an unregistered new POST route still fails even with the action kind available', (t) => {
  const f = fixture(t);
  fs.appendFileSync(
    path.join(f.temp, 'backend/src/routes/sales.js'),
    "\nrouter.post('/:id/synthetic-action', handler);\n",
  );
  assert.throws(f.verify, /sales.js:\d+: unregistered.*POST \/:id\/synthetic-action/);
});
