#!/usr/bin/env node
/**
 * Input: backend Express route modules and optional performance result files
 * Output: API route inventory with coverage and SLA classification
 * Pos: Route-level coverage map for the 2s API performance goal
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROUTES_DIR = path.join(ROOT, 'backend/src/routes');
const OUTPUT_DIR = path.join(ROOT, 'tmp/performance');
const API_RESULTS_PATH = path.join(OUTPUT_DIR, 'api-response-times.json');
const PAGE_RESULTS_PATH = path.join(OUTPUT_DIR, 'page-navigation-times.json');

const indexSource = fs.readFileSync(path.join(ROUTES_DIR, 'index.js'), 'utf8');

const requireMap = new Map();
for (const match of indexSource.matchAll(/const\s+(\w+)\s*=\s*require\('([^']+)'\);/g)) {
  requireMap.set(match[1], match[2]);
}

const mounts = [];
for (const match of indexSource.matchAll(/router\.use\('([^']+)'\s*,\s*(\w+)\);/g)) {
  const [, prefix, variable] = match;
  const modulePath = requireMap.get(variable);
  if (!modulePath) continue;
  mounts.push({ prefix, variable, modulePath });
}

const joinPath = (prefix, routePath) => {
  const normalizedRoute = routePath === '/' ? '' : routePath;
  const joined = `/api/v1${prefix === '/' ? '' : prefix}${normalizedRoute}`.replace(/\/+/g, '/');
  return joined || '/';
};

const classify = (method, routePath) => {
  const lower = routePath.toLowerCase();
  if (lower.startsWith('/api/v1/ai/') && (method !== 'GET' || lower.includes('stream'))) return 'ai_external';
  if (lower.includes('/import') || lower.includes('batch-import') || lower.includes('upload')) return 'import';
  if (lower.includes('/export') || lower.includes('/download') || lower.includes('/pdf') || lower.includes('/excel')) return 'export';
  if (method === 'GET') return 'read';
  if (lower.startsWith('/api/v1/auth/')) return 'auth_write';
  return 'write';
};

const getRoutesFromRouter = (router, mount) => {
  const rows = [];
  for (const layer of router.stack || []) {
    if (!layer.route) continue;
    const routePath = joinPath(mount.prefix, layer.route.path);
    for (const method of Object.keys(layer.route.methods)) {
      const upper = method.toUpperCase();
      rows.push({
        method: upper,
        path: routePath,
        source: `backend/src/routes/${mount.modulePath.replace('./', '')}.js`,
        category: classify(upper, routePath),
      });
    }
  }
  return rows;
};

const routeToRegex = (routePath) => {
  const escaped = routePath
    .split('/')
    .map((segment) => {
      if (!segment) return '';
      if (segment.startsWith(':')) return '[^/]+';
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${escaped}(?:\\?.*)?$`);
};

const loadMeasuredCalls = () => {
  const calls = [];
  if (fs.existsSync(API_RESULTS_PATH)) {
    const payload = JSON.parse(fs.readFileSync(API_RESULTS_PATH, 'utf8'));
    for (const row of payload.results || []) {
      if (!row.path || row.status === 'SKIPPED') continue;
      calls.push({
        method: row.method,
        path: row.path,
        source: 'api-response-times',
        durationMs: row.durationMs,
        status: row.httpStatus || row.status,
      });
    }
  }

  if (fs.existsSync(PAGE_RESULTS_PATH)) {
    const payload = JSON.parse(fs.readFileSync(PAGE_RESULTS_PATH, 'utf8'));
    for (const row of payload.results || []) {
      for (const request of row.apiRequests || []) {
        calls.push({
          method: request.method,
          path: request.url,
          source: `page-navigation:${row.id}:pass${row.pass}`,
          durationMs: request.durationMs,
          status: request.status,
        });
      }
    }
  }
  return calls;
};

const rows = [
  { method: 'GET', path: '/health', source: 'backend/src/app.js', category: 'read' },
];

for (const mount of mounts) {
  const routerPath = path.join(ROUTES_DIR, `${mount.modulePath.replace('./', '')}.js`);
  const router = require(routerPath);
  rows.push(...getRoutesFromRouter(router, mount));
}

const measuredCalls = loadMeasuredCalls();
for (const row of rows) {
  const regex = routeToRegex(row.path);
  const matches = measuredCalls.filter((call) => call.method === row.method && regex.test(call.path));
  row.measured = matches.length > 0;
  row.measurementCount = matches.length;
  row.maxMeasuredMs = matches.reduce((max, call) => (
    typeof call.durationMs === 'number' && call.durationMs > max ? call.durationMs : max
  ), 0);
  row.measurementSources = [...new Set(matches.map((call) => call.source))].slice(0, 5);
}

rows.sort((a, b) => `${a.category}:${a.path}:${a.method}`.localeCompare(`${b.category}:${b.path}:${b.method}`));

const summary = {
  totalRoutes: rows.length,
  measuredRoutes: rows.filter((row) => row.measured).length,
  unmeasuredRoutes: rows.filter((row) => !row.measured).length,
  byCategory: {},
  generatedAt: new Date().toISOString(),
};

for (const row of rows) {
  summary.byCategory[row.category] ||= { total: 0, measured: 0, unmeasured: 0 };
  summary.byCategory[row.category].total += 1;
  if (row.measured) summary.byCategory[row.category].measured += 1;
  else summary.byCategory[row.category].unmeasured += 1;
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const jsonPath = path.join(OUTPUT_DIR, 'api-route-inventory.json');
const mdPath = path.join(OUTPUT_DIR, 'api-route-inventory.md');
fs.writeFileSync(jsonPath, `${JSON.stringify({ summary, routes: rows }, null, 2)}\n`);

const categoryLines = Object.entries(summary.byCategory)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([category, item]) => `| ${category} | ${item.total} | ${item.measured} | ${item.unmeasured} |`)
  .join('\n');

const routeLines = rows
  .map((row) => `| ${row.category} | ${row.measured ? 'YES' : 'NO'} | ${row.method} | ${row.path} | ${row.maxMeasuredMs || '-'} | ${row.source} |`)
  .join('\n');

fs.writeFileSync(mdPath, `# API Route Inventory

## Summary
- Total routes: ${summary.totalRoutes}
- Measured routes: ${summary.measuredRoutes}
- Unmeasured routes: ${summary.unmeasuredRoutes}
- Generated at: ${summary.generatedAt}

## By Category
| Category | Total | Measured | Unmeasured |
|---|---:|---:|---:|
${categoryLines}

## Routes
| Category | Measured | Method | Path | Max measured ms | Source |
|---|---|---|---|---:|---|
${routeLines}
`);

console.log(`Wrote ${jsonPath}`);
console.log(`Wrote ${mdPath}`);
