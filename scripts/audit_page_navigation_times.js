#!/usr/bin/env node
/**
 * Input: running frontend and backend reachable through the frontend proxy
 * Output: JSON/Markdown page navigation and API timing baseline
 * Pos: Read-only performance audit for dashboard page switching
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const { chromium } = require(path.resolve(__dirname, '../frontend/node_modules/playwright'));

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const AUTH_BASE_URL = process.env.PAGE_BENCH_AUTH_BASE_URL || FRONTEND_URL;
const USERNAME = process.env.API_BENCH_USERNAME || 'admin';
const PASSWORD = process.env.API_BENCH_PASSWORD || '123456';
const THRESHOLD_MS = Number(process.env.PAGE_BENCH_THRESHOLD_MS || 2000);
const NAV_TIMEOUT_MS = Number(process.env.PAGE_BENCH_NAV_TIMEOUT_MS || 15000);
const SETTLE_TIMEOUT_MS = Number(process.env.PAGE_BENCH_SETTLE_TIMEOUT_MS || 3500);
const PASSES = Number(process.env.PAGE_BENCH_PASSES || 2);
const ROUTE_DELAY_MS = Number(process.env.PAGE_BENCH_ROUTE_DELAY_MS || 500);
const ROUTE_IDS = (process.env.PAGE_BENCH_ROUTE_IDS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const OUTPUT_DIR = path.resolve(process.cwd(), 'tmp/performance');

const allRoutes = [
  { id: 'dashboard_home', path: '/dashboard' },
  { id: 'reports', path: '/dashboard/reports' },
  { id: 'contracts', path: '/dashboard/contracts' },
  { id: 'suppliers', path: '/dashboard/suppliers' },
  { id: 'inventory_status', path: '/dashboard/inventory-status' },
  { id: 'sales_list', path: '/dashboard/sales' },
  { id: 'tax_refunds', path: '/dashboard/tax-refunds' },
  { id: 'tax_refunds_customs', path: '/dashboard/tax-refunds?view=customs' },
  { id: 'hs_codes', path: '/dashboard/hs-codes' },
  { id: 'finance_home', path: '/dashboard/finance' },
  { id: 'finance_statements', path: '/dashboard/finance/statements' },
  { id: 'payments', path: '/dashboard/payments' },
  { id: 'finance_bank_flow', path: '/dashboard/finance/bank-flow' },
  { id: 'finance_invoices', path: '/dashboard/finance/invoices' },
  { id: 'finance_reconciliation', path: '/dashboard/finance/reconciliation' },
  { id: 'products', path: '/dashboard/products' },
  { id: 'ai_sessions', path: '/dashboard/ai/sessions' },
  { id: 'settings_home', path: '/dashboard/settings' },
  { id: 'users', path: '/dashboard/users' },
  { id: 'settings_ports', path: '/dashboard/settings/ports' },
  { id: 'settings_categories', path: '/dashboard/settings/categories' },
  { id: 'settings_customs_brokers', path: '/dashboard/settings/customs-brokers' },
  { id: 'system_home', path: '/dashboard/system' },
  { id: 'system_logs', path: '/dashboard/system/logs' },
  { id: 'system_notifications', path: '/dashboard/system/notifications' },
  { id: 'about', path: '/dashboard/about' },
];
const routes = ROUTE_IDS.length > 0
  ? allRoutes.filter((route) => ROUTE_IDS.includes(route.id))
  : allRoutes;

if (ROUTE_IDS.length > 0 && routes.length !== ROUTE_IDS.length) {
  const known = new Set(allRoutes.map((route) => route.id));
  const missing = ROUTE_IDS.filter((id) => !known.has(id));
  throw new Error(`Unknown PAGE_BENCH_ROUTE_IDS: ${missing.join(', ')}`);
}

const buildUrl = (pathname) => new URL(pathname, FRONTEND_URL).toString();
const buildAuthUrl = (pathname) => new URL(pathname, AUTH_BASE_URL).toString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const login = async () => {
  const response = await fetch(buildAuthUrl('/api/v1/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const json = await response.json();
  if (!response.ok || !json?.data?.token || !json?.data?.user) {
    throw new Error(`Login failed through ${AUTH_BASE_URL}: HTTP ${response.status} ${json?.message || ''}`);
  }
  return json.data;
};

const writeReport = (results, meta) => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, 'page-navigation-times.json');
  const mdPath = path.join(OUTPUT_DIR, 'page-navigation-times.md');

  const completed = results.filter((row) => row.status === 'OK');
  const failed = results.filter((row) => row.status !== 'OK');
  const overThreshold = results.filter((row) => row.durationMs !== null && row.durationMs > THRESHOLD_MS);
  const max = results.reduce((acc, row) => (!acc || row.durationMs > acc.durationMs ? row : acc), null);
  const apiOverThreshold = results.flatMap((row) =>
    row.apiRequests.filter((request) => request.durationMs !== null && request.durationMs > THRESHOLD_MS)
      .map((request) => ({ routeId: row.id, pass: row.pass, ...request })),
  );
  const apiHttpErrors = results.flatMap((row) =>
    row.apiRequests.filter((request) => {
      if (request.status === 'FAILED') return true;
      return typeof request.status === 'number' && request.status >= 400;
    }).map((request) => ({ routeId: row.id, pass: row.pass, ...request })),
  );

  const summary = {
    frontendUrl: FRONTEND_URL,
    thresholdMs: THRESHOLD_MS,
    routeDelayMs: ROUTE_DELAY_MS,
    passes: PASSES,
    totalRoutes: routes.length,
    totalRuns: results.length,
    ok: completed.length,
    failed: failed.length,
    overThreshold: overThreshold.length,
    apiOverThreshold: apiOverThreshold.length,
    apiHttpErrors: apiHttpErrors.length,
    maxDurationMs: max?.durationMs ?? null,
    maxDurationRoute: max?.id ?? null,
    generatedAt: new Date().toISOString(),
    ...meta,
  };

  fs.writeFileSync(jsonPath, JSON.stringify({ summary, results, apiOverThreshold, apiHttpErrors }, null, 2));

  const lines = [
    '# Page Navigation Time Audit',
    '',
    '## Summary',
    `- Frontend URL: ${summary.frontendUrl}`,
    `- Threshold: ${summary.thresholdMs}ms`,
    `- Route delay: ${summary.routeDelayMs}ms`,
    `- Passes: ${summary.passes}`,
    `- Routes: ${summary.totalRoutes}`,
    `- Runs: ${summary.totalRuns}`,
    `- OK: ${summary.ok}`,
    `- Failed: ${summary.failed}`,
    `- Page runs over threshold: ${summary.overThreshold}`,
    `- API calls over threshold: ${summary.apiOverThreshold}`,
    `- API HTTP errors: ${summary.apiHttpErrors}`,
    `- Max page duration: ${summary.maxDurationMs ?? '-'}ms (${summary.maxDurationRoute ?? '-'})`,
    `- Generated at: ${summary.generatedAt}`,
    '',
    '## Page Runs Over Threshold Or Failed',
    ...(
      [...failed, ...overThreshold.filter((row) => row.status === 'OK')]
        .map((row) => `- pass ${row.pass} ${row.id}: ${row.status}, ${row.durationMs ?? '-'}ms, ${row.path}, ${row.message || ''}`)
    ),
    failed.length || overThreshold.length ? '' : '- None',
    '',
    '## API Calls Over Threshold',
    ...(apiOverThreshold.map((row) => `- pass ${row.pass} ${row.routeId}: ${row.method} ${row.url} ${row.status || '-'} ${row.durationMs}ms`)),
    apiOverThreshold.length ? '' : '- None',
    '',
    '## API HTTP Errors',
    ...(apiHttpErrors.map((row) => `- pass ${row.pass} ${row.routeId}: ${row.method} ${row.url} ${row.status || '-'} ${row.durationMs}ms ${row.errorText || ''}`)),
    apiHttpErrors.length ? '' : '- None',
    '',
    '## Results',
    '| Pass | ID | Status | Duration ms | >2s | API count | Slowest API ms | Path | Message |',
    '|---:|---|---|---:|---|---:|---:|---|---|',
    ...results.map((row) => {
      const slowestApi = row.apiRequests.reduce((acc, item) => {
        if (item.durationMs === null) return acc;
        return !acc || item.durationMs > acc.durationMs ? item : acc;
      }, null);
      return `| ${row.pass} | ${row.id} | ${row.status} | ${row.durationMs ?? '-'} | ${row.durationMs !== null && row.durationMs > THRESHOLD_MS ? 'YES' : 'NO'} | ${row.apiRequests.length} | ${slowestApi?.durationMs ?? '-'} | ${row.path} | ${(row.message || '').replace(/\|/g, '/')} |`;
    }),
  ];
  fs.writeFileSync(mdPath, `${lines.join('\n')}\n`);

  return { summary, jsonPath, mdPath };
};

const run = async () => {
  const loginData = await login();
  const browser = await chromium.launch({ headless: process.env.PAGE_BENCH_HEADLESS !== 'false' });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });

  await context.addInitScript(({ user, token }) => {
    window.sessionStorage.setItem('jiesong_access_token', token);
    window.sessionStorage.setItem('auth-storage', JSON.stringify({
      state: { user, token, isAuthenticated: true },
      version: 0,
    }));
  }, { user: loginData.user, token: loginData.token });

  const page = await context.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
  page.setDefaultTimeout(NAV_TIMEOUT_MS);

  const requestStartedAt = new Map();
  let activeRequests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.includes('/api/v1/')) return;
    requestStartedAt.set(request, performance.now());
  });
  page.on('response', (response) => {
    const request = response.request();
    if (!requestStartedAt.has(request)) return;
    activeRequests.push({
      method: request.method(),
      url: response.url().replace(FRONTEND_URL, ''),
      status: response.status(),
      durationMs: Math.round(performance.now() - requestStartedAt.get(request)),
    });
    requestStartedAt.delete(request);
  });
  page.on('requestfailed', (request) => {
    if (!requestStartedAt.has(request)) return;
    activeRequests.push({
      method: request.method(),
      url: request.url().replace(FRONTEND_URL, ''),
      status: 'FAILED',
      durationMs: Math.round(performance.now() - requestStartedAt.get(request)),
      errorText: request.failure()?.errorText || '',
    });
    requestStartedAt.delete(request);
  });

  const results = [];
  for (let pass = 1; pass <= PASSES; pass += 1) {
    for (const route of routes) {
      activeRequests = [];
      const started = performance.now();
      let status = 'OK';
      let message = '';
      try {
        await page.goto(buildUrl(route.path), { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
        try {
          await page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS });
        } catch {
          message = `networkidle not reached within ${SETTLE_TIMEOUT_MS}ms`;
        }
        const visibleText = await page.locator('body').innerText({ timeout: 1500 }).catch(() => '');
        if (/Application error|Unhandled Runtime Error|This page could not be found|404: This page could not be found/i.test(visibleText)) {
          status = 'PAGE_ERROR';
          message = visibleText.slice(0, 180).replace(/\s+/g, ' ');
        }
      } catch (error) {
        status = 'ERROR';
        message = error.message;
      }
      const durationMs = Math.round(performance.now() - started);
      const row = {
        pass,
        id: route.id,
        path: route.path,
        status,
        durationMs,
        overThreshold: durationMs > THRESHOLD_MS,
        apiRequests: activeRequests,
        message,
      };
      const apiErrorCount = row.apiRequests.filter((request) => {
        if (request.status === 'FAILED') return true;
        return typeof request.status === 'number' && request.status >= 400;
      }).length;
      if (status === 'OK' && apiErrorCount > 0) {
        row.status = 'API_HTTP_ERROR';
        row.message = `${apiErrorCount} API request(s) returned HTTP error`;
      }
      results.push(row);
      const flag = row.overThreshold || row.status !== 'OK' ? 'SLOW/ERR' : 'OK';
      console.log(`${flag.padEnd(8)} pass=${pass} ${String(durationMs).padStart(5)}ms ${route.id}`);
      if (ROUTE_DELAY_MS > 0) {
        await sleep(ROUTE_DELAY_MS);
      }
    }
  }

  await browser.close();
  const report = writeReport(results, {
    user: loginData.user?.username || USERNAME,
  });
  console.log(`\nWrote ${report.jsonPath}`);
  console.log(`Wrote ${report.mdPath}`);

  if (report.summary.failed || report.summary.overThreshold || report.summary.apiOverThreshold || report.summary.apiHttpErrors) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
