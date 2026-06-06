#!/usr/bin/env node
/**
 * Input: 后端API端点列表、JWT Token
 * Output: 接口性能基线测试报告
 * Pos: 接口压测脚本，记录响应时间P50/P95/P99
 */

const http = require('node:http');

const BASE_URL = process.env.BENCHMARK_BASE_URL || 'http://localhost:3001';
const TOKEN = process.env.BENCHMARK_TOKEN || '';

const ENDPOINTS = [
  { name: 'dashboard/analytics', path: '/api/v1/dashboard/analytics', method: 'GET' },
  { name: 'purchases/list', path: '/api/v1/purchases?page=1&pageSize=20&lite=true', method: 'GET' },
  { name: 'sales/list', path: '/api/v1/sales?page=1&pageSize=20&lite=true', method: 'GET' },
  { name: 'suppliers/list', path: '/api/v1/suppliers?page=1&pageSize=20', method: 'GET' },
  { name: 'products/list', path: '/api/v1/products?page=1&pageSize=20', method: 'GET' },
  { name: 'finance/payments', path: '/api/v1/finance/payments?page=1&pageSize=20', method: 'GET' },
  { name: 'inventory/list', path: '/api/v1/inventory?page=1&pageSize=20', method: 'GET' },
  { name: 'finance/receivables', path: '/api/v1/finance/receivables?page=1&pageSize=20', method: 'GET' },
  { name: 'finance/payables', path: '/api/v1/finance/payables?page=1&pageSize=20', method: 'GET' },
  { name: 'search', path: '/api/v1/search?q=瓷砖', method: 'GET' },
];

const CONCURRENCY = parseInt(process.env.BENCHMARK_CONCURRENCY || '10', 10);
const REQUESTS_PER_ENDPOINT = parseInt(process.env.BENCHMARK_REQUESTS || '50', 10);
const TARGET_MS = 1000;

function request(path, method = 'GET') {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const url = new URL(path, BASE_URL);
    const req = http.request(url, { method, headers: { Authorization: `Bearer ${TOKEN}` } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const end = process.hrtime.bigint();
        const ms = Number(end - start) / 1_000_000;
        resolve({ status: res.statusCode, ms, size: data.length });
      });
    });
    req.on('error', () => resolve({ status: 0, ms: -1, size: 0 }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ status: 0, ms: -1, size: 0 }); });
    req.end();
  });
}

async function benchmarkEndpoint(endpoint) {
  const times = [];
  const errors = [];

  for (let i = 0; i < REQUESTS_PER_ENDPOINT; i += CONCURRENCY) {
    const batch = Array(Math.min(CONCURRENCY, REQUESTS_PER_ENDPOINT - i))
      .fill(null)
      .map(() => request(endpoint.path, endpoint.method));
    const results = await Promise.all(batch);
    for (const r of results) {
      if (r.status === 200 && r.ms >= 0) times.push(r.ms);
      else errors.push(r.status);
    }
  }

  times.sort((a, b) => a - b);
  const p50 = times[Math.floor(times.length * 0.5)] || 0;
  const p95 = times[Math.floor(times.length * 0.95)] || 0;
  const p99 = times[Math.floor(times.length * 0.99)] || 0;
  const avg = times.reduce((a, b) => a + b, 0) / (times.length || 1);
  const min = times[0] || 0;
  const max = times[times.length - 1] || 0;
  const pass = p95 <= TARGET_MS;

  return {
    name: endpoint.name,
    path: endpoint.path,
    samples: times.length,
    errors: errors.length,
    min: min.toFixed(2),
    avg: avg.toFixed(2),
    p50: p50.toFixed(2),
    p95: p95.toFixed(2),
    p99: p99.toFixed(2),
    max: max.toFixed(2),
    pass,
  };
}

async function main() {
  if (!TOKEN) {
    console.error('Error: BENCHMARK_TOKEN is required');
    console.error('Usage: BENCHMARK_TOKEN=<jwt> node api-benchmark.js');
    process.exit(1);
  }

  console.log(`\n捷淞系统 API 性能基线测试`);
  console.log(`目标: P95 < ${TARGET_MS}ms | 并发: ${CONCURRENCY} | 每端点: ${REQUESTS_PER_ENDPOINT} 次`);
  console.log(`Base URL: ${BASE_URL}\n`);

  const results = [];
  for (const endpoint of ENDPOINTS) {
    process.stdout.write(`Testing ${endpoint.name} ... `);
    const result = await benchmarkEndpoint(endpoint);
    results.push(result);
    console.log(`${result.pass ? 'PASS' : 'FAIL'} | P95=${result.p95}ms | avg=${result.avg}ms`);
  }

  console.log(`\n${'='.repeat(100)}`);
  console.log(`| 端点名称               | 样本 | 错误 | 最小 | 平均 | P50  | P95  | P99  | 最大 | 结果 |`);
  console.log(`${'-'.repeat(100)}`);
  for (const r of results) {
    const status = r.pass ? '✅ 通过' : '❌ 超标';
    console.log(
      `| ${r.name.padEnd(22)} | ${String(r.samples).padStart(4)} | ${String(r.errors).padStart(4)} | ${String(r.min).padStart(5)} | ${String(r.avg).padStart(5)} | ${String(r.p50).padStart(5)} | ${String(r.p95).padStart(5)} | ${String(r.p99).padStart(5)} | ${String(r.max).padStart(5)} | ${status.padEnd(6)} |`
    );
  }
  console.log(`${'='.repeat(100)}`);

  const allPass = results.every((r) => r.pass);
  console.log(`\n总体结果: ${allPass ? '全部通过 ✅' : '存在超标接口 ❌'}`);

  // 持久化记录到文件
  const fs = require('node:fs');
  const record = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    concurrency: CONCURRENCY,
    requestsPerEndpoint: REQUESTS_PER_ENDPOINT,
    results,
  };
  const logDir = `${__dirname}/../benchmark-logs`;
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = `${logDir}/benchmark-${Date.now()}.json`;
  fs.writeFileSync(logPath, JSON.stringify(record, null, 2));
  console.log(`结果已保存: ${logPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
