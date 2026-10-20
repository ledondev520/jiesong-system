/**
 * Input: private synthetic SQLite URL and test-only IPC transaction gate
 * Output: actual Express HTTP app paused before an allocation transaction starts
 * Pos: receivable allocation race helper; never mocks database results or roles
 */
const db = require('../../utils/prisma');
const transact = db.$transaction.bind(db);
let armed = false, release;
db.$transaction = async (...args) => {
  if (armed) {
    armed = false;
    await new Promise(resolve => {
      release = resolve;
      process.send({ type: 'gated' });
    });
  }
  return transact(...args);
};
const app = require('../../app');
const server = app.listen(0, '127.0.0.1', () => process.send({ type: 'ready', port: server.address().port }));
process.on('message', async message => {
  if (message.type === 'arm') { armed = true; process.send({ type: 'armed' }); }
  if (message.type === 'release') { release?.(); release = null; }
  if (message.type === 'stop') {
    release?.();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await db.$disconnect();
    process.exit(0);
  }
});
