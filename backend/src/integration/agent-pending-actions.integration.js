/** Agent pending actions on a private SQLite built from the committed migrations: concurrent confirm executes once,
 *  confirm from a second "process" (fresh module graph + Prisma client) works, expired -> 404, cancel/other-user. Synthetic data only. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('agent pending actions are shared across processes and claimed atomically', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-agent-pending-'));
  fs.chmodSync(directory, 0o700);
  const database = path.join(directory, 'synthetic.db');
  process.env.DATABASE_URL = `file:${database}`;
  process.env.UPLOAD_DIR = path.join(directory, 'uploads');
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-only-agent-pending-fixture-never-for-production';
  require('../testHelpers/financial-library-data').applyMigrations(database);

  const load = () => {
    const prefix = path.resolve(__dirname, '..') + path.sep;
    for (const key of Object.keys(require.cache)) if (key.startsWith(prefix)) delete require.cache[key];
    delete global.prisma; // utils/prisma caches a global singleton outside production; a real second process has its own client
    return { agent: require('../services/openAgentService'), db: require('../utils/prisma') };
  };
  const procA = load();
  const procB = load();
  assert.notEqual(procA.db, procB.db);
  t.after(async () => {
    await procA.db.$disconnect();
    await procB.db.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const user = await procA.db.user.create({ data: { username: 'synthetic-purchaser', password: 'x', name: 'Synthetic', role: 'PURCHASE' } });
  const propose = async (proc, name) => {
    const tool = proc.agent.buildWriteToolPool((spec) => spec, user.id, 'PURCHASE', [], [])
      .find((item) => item.name === 'CreateSupplierRecord');
    return JSON.parse(await tool.call({ name })).actionId;
  };
  const supplierCount = (name) => procA.db.supplier.count({ where: { name } });

  await t.test('concurrent double confirm executes exactly once', async () => {
    const id = await propose(procA, 'Synthetic Supplier Race');
    const results = await Promise.allSettled([
      procA.agent.executeAction(id, user.id),
      procA.agent.executeAction(id, user.id),
      procB.agent.executeAction(id, user.id),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    for (const r of results.filter((x) => x.status === 'rejected')) assert.equal(r.reason.statusCode, 409);
    assert.equal(await supplierCount('Synthetic Supplier Race'), 1);
    assert.equal(await procA.db.operationLog.count({ where: { entityId: id, action: 'AGENT_WRITE_EXECUTE' } }), 1);
    await assert.rejects(procB.agent.executeAction(id, user.id), (e) => e.statusCode === 409);
  });

  await t.test('confirm from a different process than the one that proposed', async () => {
    const id = await propose(procA, 'Synthetic Supplier Cross');
    const result = await procB.agent.executeAction(id, user.id);
    assert.equal(result.success, true);
    assert.equal(await supplierCount('Synthetic Supplier Cross'), 1);
  });

  await t.test('other user is refused, cancel is shared and blocks execution', async () => {
    const id = await propose(procA, 'Synthetic Supplier Cancel');
    await assert.rejects(procB.agent.executeAction(id, 'someone-else'), (e) => e.statusCode === 403);
    await procB.agent.cancelAction(id, user.id);
    await assert.rejects(procA.agent.executeAction(id, user.id), (e) => e.statusCode === 409);
    assert.equal(await supplierCount('Synthetic Supplier Cancel'), 0);
  });

  await t.test('expired action -> 404 and is purged by the next create', async () => {
    const id = await propose(procA, 'Synthetic Supplier Expired');
    await procA.db.agentPendingAction.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(procB.agent.executeAction(id, user.id), (e) => e.statusCode === 404);
    await propose(procA, 'Synthetic Supplier Trigger Cleanup');
    assert.equal(await procA.db.agentPendingAction.count({ where: { id } }), 0);
    assert.equal(await supplierCount('Synthetic Supplier Expired'), 0);
  });

  await t.test('failed executor is recorded as failed with a reason and is not retried', async () => {
    const tool = procA.agent.buildWriteToolPool((spec) => spec, user.id, 'PURCHASE', [], [])
      .find((item) => item.name === 'UpdateSupplierRecord');
    const supplier = await procA.db.supplier.create({ data: { name: 'Synthetic Supplier Gone' } });
    const id = JSON.parse(await tool.call({ id: supplier.id, name: 'Synthetic Renamed' })).actionId;
    assert.ok(id);
    await procA.db.supplier.delete({ where: { id: supplier.id } }); // vanishes between propose and confirm
    await assert.rejects(procA.agent.executeAction(id, user.id));
    const row = await procA.db.agentPendingAction.findUnique({ where: { id } });
    assert.equal(row.status, 'failed');
    assert.ok(row.failureReason);
    await assert.rejects(procB.agent.executeAction(id, user.id), (e) => e.statusCode === 409);
  });
});
