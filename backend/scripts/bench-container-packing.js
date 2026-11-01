#!/usr/bin/env node
/* Usage: node scripts/bench-container-packing.js [sizes:maxQty ...]  (default 300:5 300:8 1000:2 1000:3). Prints wall time, placed, status for the real buildLoadingPlan. */
const { buildLoadingPlan } = require('../src/services/shipmentReadinessService');
const { makeBenchContract } = require('../src/services/containerPackingBench');

const cases = process.argv.slice(2);
for (const spec of cases.length ? cases : ['300:5', '300:8', '1000:2', '1000:3']) {
  const [n, maxQty] = spec.split(':').map(Number);
  const contract = makeBenchContract(n, { maxQty });
  const total = contract.packingItems.reduce((s, i) => s + i.boxes, 0);
  const t0 = process.hrtime.bigint();
  const { plan } = buildLoadingPlan(contract);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const placed = plan.containers.reduce((s, c) => s + c.cartons, 0);
  const budget = plan.unplaced.some((u) => u.reason === 'compute-budget');
  console.log(JSON.stringify({
    sizes: n, maxQty, cartons: total, ms: Math.round(ms), placed, containers: plan.containers.length,
    unplaced: plan.unplaced.reduce((s, u) => s + u.cartons, 0), budgetExhausted: budget,
    status: plan.check.status, ready: plan.check.ready, vol: +plan.check.volumePct.toFixed(1), kg: +plan.check.weightPct.toFixed(1),
  }));
}
