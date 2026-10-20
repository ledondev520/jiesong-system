/**
 * Input: test-only IPC gates and a private synthetic SQLite URL
 * Output: actual HTTP app with observable transaction/query boundaries
 * Pos: sales transition race integration helper; does not mock database results
 */
const db = require('../../utils/prisma');
let gate, release;
const transact = db.$transaction.bind(db);
db.$transaction = (...args) => {
  if (gate) process.send({ type: 'transactionRequested' });
  return transact(...args);
};
db.$use(async (params, next) => {
  const current = gate;
  const matches = current && params.runInTransaction && (
    (current === 'status' && params.model === 'SalesContract' && params.action === 'findUnique' && params.args?.select?.packingItems)
    || (current === 'payment' && params.model === 'Payment' && params.action === 'create')
    || (current === 'header' && params.model === 'SalesContract' && params.action === 'findUnique' && params.args?.select?.status)
  );
  const result = await next(params);
  if (matches) {
    gate = null;
    const waiting = new Promise(resolve => { release = resolve; });
    process.send({ type: 'gated', status: result?.status });
    await waiting;
  }
  return result;
});
const app = require('../../app');
const server = app.listen(0, '127.0.0.1', () => process.send({ type: 'ready', port: server.address().port }));
process.on('message', async message => {
  if (message.type === 'arm') { gate = message.gate; process.send({ type: 'armed' }); }
  if (message.type === 'release') { release?.(); release = null; }
  if (message.type === 'stop') {
    release?.(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    await db.$disconnect(); process.exit(0);
  }
});
