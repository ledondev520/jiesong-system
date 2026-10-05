/** Actual HTTP/auth/SQLite worker; only delay the return of a real pending-invoice read. */
process.umask(0o022);
const prisma = require('../../utils/prisma');
const app = require('../../app');
const findMany = prisma.invoiceRecord.findMany.bind(prisma.invoiceRecord);
let invoiceId, release;
prisma.invoiceRecord.findMany = async args => {
  const rows = await findMany(args);
  if (invoiceId && args?.where?.matchStatus === 'PENDING' && rows.some(row => row.id === invoiceId)) {
    invoiceId = null;
    await new Promise(resolve => { release = resolve; process.send({ type: 'gated' }); });
  }
  return rows;
};
const server = app.listen(0, '127.0.0.1', () => process.send({ type: 'ready', port: server.address().port }));
process.on('message', async message => {
  if (message.type === 'arm') {
    invoiceId = message.invoiceId;
    process.send({ type: 'armed' });
  } else if (message.type === 'release') {
    release?.(); release = null;
  } else if (message.type === 'stop') {
    release?.();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await prisma.$disconnect();
    process.exit(0);
  }
});
