const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { evaluateExportPacket, historicalQuoteAllowed } = require('./exportPacketService');
const { evaluateExportReadiness, getExportReadiness } = require('./exportReadinessService');
const defaults = require('../../../config/pricing.json');
const fixtures = require('../../../tests/fixtures/pricing-synthetic.json');
const fixture = fixtures[0];

function withPolicy(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-matrix-'));
  const target = path.join(dir, 'pricing.json');
  const previous = process.env.JIESONG_PRICING_CONFIG;
  process.env.JIESONG_PRICING_CONFIG = target;
  t.after(() => { if (previous === undefined) delete process.env.JIESONG_PRICING_CONFIG; else process.env.JIESONG_PRICING_CONFIG = previous; fs.rmSync(dir, { recursive: true }); });
  return change => fs.writeFileSync(target, JSON.stringify({ ...defaults, ...change }));
}

function packet(refundRate, options = {}, history = []) {
  const readiness = evaluateExportReadiness(fixture.contract, { hsRecords: [{ ...fixture.readinessOptions.hsRecords[0], refundRate }] });
  return evaluateExportPacket(fixture.contract, readiness, history, { ...fixture.packetOptions, ...options });
}

test('packet loads each configured parameter and uses multiplier only after explicit mode selection', t => {
  const write = withPolicy(t);
  const results = [];
  for (const [change, refund, unit] of [[{}, 13, 130], [{}, 0, 110], [{ exchangeAdjustment: -0.1 }, 13, 128], [{ refundableMarkup: 0.4 }, 13, 140], [{ noRefundMarkup: 0.2 }, 0, 120], [{ mode: 'multiplier' }, 0, 130], [{ mode: 'multiplier', multiplier: 1.5 }, 0, 150], [{ multiplier: 1.5 }, 13, 130]]) {
    write(change);
    const actual = packet(refund);
    assert.equal(actual.lines[0].unitPriceUsd, unit);
    assert.equal(actual.summary.totalUsd, unit * 10);
    results.push({ change, refund, actual });
  }
  if (process.env.JIESONG_TEST_EVIDENCE_DIR) {
    fs.mkdirSync(process.env.JIESONG_TEST_EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.JIESONG_TEST_EVIDENCE_DIR, 'packet-parameter-matrix.json'), JSON.stringify(results, null, 2));
  }
});

test('configured policy applies to historical/manual prices and messages, including multiplier zero-refund lines', t => {
  const write = withPolicy(t);
  const quote = unitPriceUsd => ({ productId: 'product-1', productName: '合成商品', specification: '100*200*300', unitPriceUsd, contractNo: 'SYNTHETIC-HISTORY' });
  write({ noRefundMarkup: 0.2 });
  assert.equal(packet(0, {}, [quote(120)]).lines[0].pricingSource, 'history');
  const override = unitPriceUsd => ({ priceOverrides: [{ packingItemId: 'packing-1', unitPriceUsd }] });
  assert.equal(packet(0, override(130)).lines[0].issues[0].code, 'NO_REFUND_MARKUP_EXCEEDED');
  assert.match(packet(0, override(130)).lines[0].issues[0].message, /20%/);
  write({ refundableMarkup: 0.4 });
  assert.equal(packet(13, {}, [quote(130)]).lines[0].pricingSource, 'formula');
  assert.match(packet(13, override(130)).lines[0].issues[0].message, /40%/);
  write({ mode: 'multiplier', multiplier: 1.5 });
  assert.equal(packet(0, {}, [quote(150)]).lines[0].pricingSource, 'history');
  assert.equal(packet(0, {}, [quote(110)]).lines[0].pricingSource, 'formula');
  assert.match(packet(0, override(110)).lines[0].issues[0].message, /50%/);
  assert.equal(historicalQuoteAllowed({ unitPriceUsd: 150, quantity: 10, effectiveRate: 6.6, costCny: 6600, refundRate: 0 }).allowed, true);
});

test('real Python proposals and packet service consume the same file across the parameter matrix', t => {
  const write = withPolicy(t);
  const root = path.resolve(__dirname, '../../..');
  const evidence = [];
  for (const change of [{}, { exchangeAdjustment: -0.1 }, { refundableMarkup: 0.4 }, { noRefundMarkup: 0.2 }, { mode: 'multiplier' }, { mode: 'multiplier', multiplier: 1.5 }]) {
    write(change);
    const python = spawnSync('python3', ['tests/pricing_snapshot.py', root], { cwd: root, env: process.env, encoding: 'utf8' });
    assert.equal(python.status, 0, python.stderr);
    const proposals = JSON.parse(python.stdout);
    for (const refund of [13, 0]) {
      const py = proposals.find(item => item.name === `${refund}-normal`).proposal;
      const js = packet(refund);
      const readiness = evaluateExportReadiness(fixture.contract, { hsRecords: [{ ...fixture.readinessOptions.hsRecords[0], refundRate: refund }] });
      assert.equal(readiness.lines[0].recommendedUnitPriceUsd, py.rows[0].pricing.unit_price_usd);
      assert.equal(readiness.lines[0].effectiveExchangeRate, py.pricing_policy.effective_rate);
      assert.equal(js.pricingPolicy.effectiveRate, py.pricing_policy.effective_rate);
      assert.equal(js.lines[0].unitPriceUsd, py.rows[0].pricing.unit_price_usd);
      assert.equal(js.lines[0].totalUsd, py.rows[0].pricing.total_usd);
      assert.equal(js.lines[0].targetMarkup, py.rows[0].pricing.target_markup);
      evidence.push({ change, refund, readiness: readiness.lines[0], js: js.lines[0], python: py.rows[0].pricing });
    }
  }
  if (process.env.JIESONG_TEST_EVIDENCE_DIR) fs.writeFileSync(path.join(process.env.JIESONG_TEST_EVIDENCE_DIR, 'python-packet-parity.json'), JSON.stringify(evidence, null, 2));
});


test('readiness and packet formula recommendations agree for all synthetic inputs and configured modes', t => {
  const write = withPolicy(t);
  for (const change of [{}, { exchangeAdjustment: -0.1 }, { refundableMarkup: 0.4 }, { noRefundMarkup: 0.2 }, { multiplier: 1.5 }, { mode: 'multiplier' }, { mode: 'multiplier', multiplier: 1.5 }]) {
    write(change);
    for (const entry of fixtures) {
      const readiness = evaluateExportReadiness(entry.contract, entry.readinessOptions);
      const actual = evaluateExportPacket(entry.contract, readiness, [], { ...entry.packetOptions, priceOverrides: [] });
      for (const [index, line] of readiness.lines.entries()) {
        const expected = actual.lines[index];
        const label = `${entry.name} ${JSON.stringify(change)}`;
        assert.equal(line.recommendedUnitPriceUsd, expected.unitPriceUsd || null, label);
        assert.equal(line.pricingProfitRate, 1 + expected.targetMarkup, label);
        assert.equal(line.effectiveExchangeRate, actual.pricingPolicy.effectiveRate, label);
      }
    }
  }
});

test('readiness reloads the same file as packet and Python when individual policy values change', t => {
  const write = withPolicy(t);
  for (const [change, refund, unit] of [[{}, 13, 130], [{}, 0, 110], [{ exchangeAdjustment: -0.1 }, 13, 128], [{ refundableMarkup: 0.4 }, 13, 140], [{ noRefundMarkup: 0.2 }, 0, 120], [{ multiplier: 1.5 }, 0, 110], [{ mode: 'multiplier' }, 0, 130], [{ mode: 'multiplier', multiplier: 1.5 }, 13, 150], [{ mode: 'multiplier', multiplier: 1.5 }, 0, 150]]) {
    write(change);
    const readiness = evaluateExportReadiness(fixture.contract, { hsRecords: [{ ...fixture.readinessOptions.hsRecords[0], refundRate: refund }], profitRate: 4 });
    assert.equal(readiness.lines[0].recommendedUnitPriceUsd, unit);
    assert.equal(packet(refund).lines[0].unitPriceUsd, unit);
    assert.ok(!readiness.lines[0].pricingFormula.includes('× 4'));
  }
});

test('readiness stops on missing or invalid policy instead of retaining a previous valid snapshot', t => {
  const write = withPolicy(t);
  write({});
  assert.equal(evaluateExportReadiness(fixture.contract, fixture.readinessOptions).lines[0].recommendedUnitPriceUsd, 130);
  for (const change of [{ mode: 'unknown' }, { refundableMarkup: '0.3' }, { exchangeAdjustment: 3 }, { unknown: 1 }]) {
    write(change);
    assert.throws(() => evaluateExportReadiness(fixture.contract, fixture.readinessOptions));
  }
  fs.unlinkSync(process.env.JIESONG_PRICING_CONFIG);
  assert.throws(() => evaluateExportReadiness(fixture.contract, fixture.readinessOptions));
});

test('readiness uses the packet effective-rate precision and withholds a formula price at nonpositive rates', t => {
  const write = withPolicy(t);
  write({});
  for (const exchangeRate of [-1, 0, 0.1, 0.2, 0.2000004, 0.2000006, 6.87654321]) {
    const contract = { ...fixture.contract, exchangeRate };
    const readiness = evaluateExportReadiness(contract, fixture.readinessOptions);
    const actual = evaluateExportPacket(contract, readiness, [], fixture.packetOptions);
    assert.equal(readiness.lines[0].recommendedUnitPriceUsd, actual.lines[0].unitPriceUsd || null);
    assert.equal(readiness.effectiveExchangeRate, actual.pricingPolicy.effectiveRate);
  }
});


test('async readiness fixes one policy snapshot before loading sources and observes changes on the next call', async t => {
  const write = withPolicy(t);
  write({});
  const source = {
    salesContract: { findUnique: async () => { write({ refundableMarkup: 0.4 }); return fixture.contract; } },
    customsDeclarationItem: { findMany: async () => [] },
    hsCode: { findMany: async () => fixture.readinessOptions.hsRecords },
    taxRate: { findMany: async () => [] },
  };
  const first = await getExportReadiness(fixture.contract.id, {}, source);
  const second = await getExportReadiness(fixture.contract.id, {}, source);
  assert.equal(first.lines[0].recommendedUnitPriceUsd, 130);
  assert.equal(second.lines[0].recommendedUnitPriceUsd, 140);
  assert.equal(second.lines[0].pricingProfitRate, 1.4);
  assert.match(second.lines[0].pricingFormula, /× 1.4/);
});
