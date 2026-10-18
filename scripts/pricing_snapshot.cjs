const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const { evaluateExportPacket } = require(path.join(root, 'backend/src/services/exportPacketService'));
const { evaluateExportReadiness } = require(path.join(root, 'backend/src/services/exportReadinessService'));
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/pricing-synthetic.json'), 'utf8'));
const results = fixtures.map(({ name, contract, readinessOptions, historicalQuotes, packetOptions }) => {
  const readiness = evaluateExportReadiness(contract, readinessOptions);
  return { name, readiness, packet: evaluateExportPacket(contract, readiness, historicalQuotes, packetOptions) };
});
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
