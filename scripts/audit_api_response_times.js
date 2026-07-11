#!/usr/bin/env node
/**
 * Input: running local backend, development login credentials
 * Output: JSON/Markdown API response-time baseline
 * Pos: Read-only API performance audit for interactive page-switching endpoints
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const USERNAME = process.env.API_BENCH_USERNAME || 'admin';
const PASSWORD = process.env.API_BENCH_PASSWORD || '123456';
const THRESHOLD_MS = Number(process.env.API_BENCH_THRESHOLD_MS || 2000);
const DETAIL_TARGET_MS = Number(process.env.API_BENCH_DETAIL_TARGET_MS || 500);
const ORDINARY_TARGET_MS = Number(process.env.API_BENCH_ORDINARY_TARGET_MS || 1000);
const DEFERRED_TARGET_MS = Number(process.env.API_BENCH_DEFERRED_TARGET_MS || 2000);
const TIMEOUT_MS = Number(process.env.API_BENCH_TIMEOUT_MS || 10000);
const DELAY_MS = Number(process.env.API_BENCH_DELAY_MS || 650);
const OUTPUT_DIR = path.resolve(process.cwd(), 'tmp/performance');

const state = {};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildUrl = (pathname) => {
  const url = new URL(pathname, BASE_URL);
  return url.toString();
};

const readJson = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const firstItem = (json) => {
  const data = json?.data;
  if (Array.isArray(data)) return data[0] || null;
  if (Array.isArray(data?.items)) return data.items[0] || null;
  if (Array.isArray(data?.data)) return data.data[0] || null;
  if (Array.isArray(data?.records)) return data.records[0] || null;
  return null;
};

const saveFirstId = (key) => (json) => {
  const item = firstItem(json);
  if (item?.id) state[key] = item.id;
  if (item?.contractNo) state[`${key}ContractNo`] = item.contractNo;
};

const saveFirstFields = (mapping) => (json) => {
  const item = firstItem(json);
  if (!item || typeof item !== 'object') return;
  for (const [stateKey, field] of Object.entries(mapping)) {
    if (item[field] !== undefined && item[field] !== null && item[field] !== '') {
      state[stateKey] = item[field];
    }
  }
};

const saveFirstValue = (key) => (json) => {
  const item = firstItem(json);
  if (item !== null && item !== undefined && item !== '') state[key] = item;
};

const optionalPath = (key, template) => () => {
  const value = state[key];
  return value ? template(value) : null;
};

const optionalPathAll = (keys, template) => () => {
  const values = keys.map((key) => state[key]);
  return values.every(Boolean) ? template(...values) : null;
};

const resolveSla = (testCase) => {
  if (testCase.sla) return testCase.sla;
  if (/(^|_)detail($|_)|_files$/.test(testCase.id)) {
    return { profile: 'detail', targetMs: DETAIL_TARGET_MS };
  }
  if (
    testCase.acceptsBlob ||
    /(^|_)(export|download|upload|import|sync|trigger|stream)($|_)/.test(testCase.id) ||
    /^hsciq_/.test(testCase.id)
  ) {
    return { profile: 'deferred', targetMs: DEFERRED_TARGET_MS };
  }
  return { profile: 'ordinary', targetMs: ORDINARY_TARGET_MS };
};

const coreCases = [
  { id: 'health', method: 'GET', path: '/health', auth: false },
  { id: 'auth_login', method: 'POST', path: '/api/v1/auth/login', auth: false, body: () => ({ username: USERNAME, password: PASSWORD }), skipAfterToken: true },
  { id: 'auth_me', method: 'GET', path: '/api/v1/auth/me' },
  { id: 'auth_users', method: 'GET', path: '/api/v1/auth/users' },

  { id: 'dashboard_stats', method: 'GET', path: '/api/v1/dashboard/stats' },
  { id: 'dashboard_analytics', method: 'GET', path: '/api/v1/dashboard/analytics' },
  { id: 'dashboard_trade_workflows', method: 'GET', path: '/api/v1/dashboard/trade-workflows' },
  { id: 'reports_business_overview', method: 'GET', path: '/api/v1/reports/business-overview' },

  { id: 'suppliers_list', method: 'GET', path: '/api/v1/suppliers?page=1&pageSize=20', save: saveFirstId('supplierId') },
  { id: 'supplier_detail', method: 'GET', path: optionalPath('supplierId', (id) => `/api/v1/suppliers/${id}`) },
  { id: 'stores_list', method: 'GET', path: '/api/v1/stores?page=1&pageSize=20', save: (json) => { saveFirstId('storeId')(json); saveFirstFields({ storeName: 'name' })(json); } },
  { id: 'store_detail', method: 'GET', path: optionalPath('storeId', (id) => `/api/v1/stores/${id}`) },
  { id: 'store_ports_options', method: 'GET', path: '/api/v1/stores/options/ports', save: saveFirstFields({ portId: 'id' }) },
  { id: 'products_list', method: 'GET', path: '/api/v1/products?page=1&pageSize=20', save: (json) => { saveFirstId('productId')(json); saveFirstFields({ productName: 'customsName' })(json); } },
  { id: 'product_detail', method: 'GET', path: optionalPath('productId', (id) => `/api/v1/products/${id}`) },
  { id: 'product_suppliers', method: 'GET', path: optionalPath('productId', (id) => `/api/v1/products/${id}/suppliers`) },
  { id: 'product_price_history', method: 'GET', path: optionalPath('productId', (id) => `/api/v1/products/${id}/price-history`) },
  { id: 'product_price_trend', method: 'GET', path: optionalPath('productId', (id) => `/api/v1/products/${id}/price-trend`) },
  { id: 'product_categories_options', method: 'GET', path: '/api/v1/products/options/categories' },
  { id: 'dashboard_track_product', method: 'GET', path: optionalPath('productName', (name) => `/api/v1/dashboard/track-product?product=${encodeURIComponent(name)}`) },

  { id: 'purchases_list', method: 'GET', path: '/api/v1/purchases?page=1&pageSize=20', save: saveFirstId('purchaseId') },
  { id: 'purchase_next_no', method: 'GET', path: '/api/v1/purchases/options/next-no' },
  { id: 'purchase_detail', method: 'GET', path: optionalPath('purchaseId', (id) => `/api/v1/purchases/${id}`) },
  { id: 'purchase_files', method: 'GET', path: optionalPath('purchaseId', (id) => `/api/v1/purchases/${id}/files`) },
  { id: 'purchase_invoice_preparation', method: 'GET', path: optionalPath('purchaseId', (id) => `/api/v1/purchases/${id}/invoice-preparation`) },
  { id: 'purchase_export', method: 'GET', path: '/api/v1/purchases/export', acceptsBlob: true },
  { id: 'purchase_product_price_history', method: 'GET', path: optionalPath('productId', (id) => `/api/v1/purchases/price-history/${id}`) },

  { id: 'sales_list', method: 'GET', path: '/api/v1/sales?page=1&pageSize=20', save: saveFirstId('salesId') },
  { id: 'sales_next_no', method: 'GET', path: '/api/v1/sales/options/next-no' },
  { id: 'sales_detail', method: 'GET', path: optionalPath('salesId', (id) => `/api/v1/sales/${id}`) },
  { id: 'sales_files', method: 'GET', path: optionalPath('salesId', (id) => `/api/v1/sales/${id}/files`) },
  { id: 'sales_available_purchase_items', method: 'GET', path: optionalPath('salesId', (id) => `/api/v1/sales/${id}/available-purchase-items`) },
  { id: 'sales_finance_summary', method: 'GET', path: optionalPath('salesId', (id) => `/api/v1/sales/${id}/finance-summary`) },
  { id: 'sales_packing_list_checks', method: 'GET', path: optionalPath('salesId', (id) => `/api/v1/sales/${id}/packing-list-checks`) },
  { id: 'sales_tax_refund_preparation', method: 'GET', path: optionalPath('salesId', (id) => `/api/v1/sales/${id}/tax-refund-preparation`) },
  { id: 'sales_tax_refund_preparation_export', method: 'GET', path: optionalPath('salesId', (id) => `/api/v1/sales/${id}/tax-refund-preparation/export`), acceptsBlob: true },

  { id: 'containers_list', method: 'GET', path: '/api/v1/containers?page=1&pageSize=20', save: saveFirstId('containerId') },
  { id: 'container_next_no', method: 'GET', path: optionalPath('portId', (id) => `/api/v1/containers/next-no/${id}`) },
  { id: 'container_detail', method: 'GET', path: optionalPath('containerId', (id) => `/api/v1/containers/${id}`) },
  { id: 'container_items', method: 'GET', path: optionalPath('containerId', (id) => `/api/v1/containers/${id}/items`) },
  { id: 'container_items_summary', method: 'GET', path: optionalPath('containerId', (id) => `/api/v1/containers/${id}/items/summary`) },
  { id: 'container_products', method: 'GET', path: optionalPath('containerId', (id) => `/api/v1/containers/${id}/products`) },
  { id: 'container_visualization', method: 'GET', path: optionalPath('containerId', (id) => `/api/v1/containers/${id}/visualization`) },

  { id: 'inventory_list', method: 'GET', path: '/api/v1/inventory?page=1&pageSize=20', save: saveFirstId('inventoryId') },
  { id: 'inventory_stats', method: 'GET', path: '/api/v1/inventory/stats' },
  { id: 'inventory_snapshot', method: 'GET', path: '/api/v1/inventory/snapshot' },
  { id: 'inventory_alerts', method: 'GET', path: '/api/v1/inventory/alerts?page=1&pageSize=20' },
  { id: 'inventory_detail', method: 'GET', path: optionalPath('inventoryId', (id) => `/api/v1/inventory/${id}`) },
  { id: 'inventory_by_product', method: 'GET', path: optionalPath('productId', (id) => `/api/v1/inventory/product/${id}`) },
  { id: 'inventory_by_contract', method: 'GET', path: optionalPath('salesId', (id) => `/api/v1/inventory/contract/${id}`) },

  { id: 'finance_payments', method: 'GET', path: '/api/v1/finance/payments?page=1&pageSize=20', save: saveFirstId('paymentId') },
  { id: 'finance_payables', method: 'GET', path: '/api/v1/finance/payables?page=1&pageSize=20' },
  { id: 'finance_receivables', method: 'GET', path: '/api/v1/finance/receivables?page=1&pageSize=20' },
  { id: 'finance_stats', method: 'GET', path: '/api/v1/finance/stats' },
  { id: 'finance_payment_trends', method: 'GET', path: '/api/v1/finance/payment-trends' },
  { id: 'finance_overdue_receivables', method: 'GET', path: '/api/v1/finance/overdue-receivables' },
  { id: 'finance_unallocated_payments', method: 'GET', path: '/api/v1/finance/unallocated-payments' },
  { id: 'finance_statements', method: 'GET', path: '/api/v1/finance/statements', save: saveFirstFields({ statementYear: 'year', statementMonth: 'month' }) },
  { id: 'finance_statement_detail', method: 'GET', path: optionalPathAll(['statementYear', 'statementMonth'], (year, month) => `/api/v1/finance/statements/${year}/${month}`) },
  { id: 'finance_statements_analytics', method: 'GET', path: '/api/v1/finance/statements/analytics' },
  { id: 'finance_unmatched', method: 'GET', path: '/api/v1/finance/unmatched?page=1&pageSize=20' },
  { id: 'finance_purchase_contracts_for_match', method: 'GET', path: '/api/v1/finance/contracts-for-match?contractType=PURCHASE' },
  { id: 'finance_sales_contracts_for_match', method: 'GET', path: '/api/v1/finance/contracts-for-match?contractType=SALES' },

  { id: 'bank_transactions', method: 'GET', path: '/api/v1/bank-flow/transactions?page=1&pageSize=20', save: saveFirstFields({ bankCounterpart: 'counterpart' }) },
  { id: 'bank_transaction_stats', method: 'GET', path: '/api/v1/bank-flow/transactions/stats' },
  { id: 'bank_invoices', method: 'GET', path: '/api/v1/bank-flow/invoices?page=1&pageSize=20' },
  { id: 'bank_invoice_stats', method: 'GET', path: '/api/v1/bank-flow/invoices/stats' },
  { id: 'bank_invoices_by_seller', method: 'GET', path: '/api/v1/bank-flow/invoices/by-seller' },
  { id: 'bank_batches', method: 'GET', path: '/api/v1/bank-flow/batches' },
  { id: 'bank_reconciliation', method: 'GET', path: optionalPath('bankCounterpart', (counterpart) => `/api/v1/bank-flow/reconciliation?counterpart=${encodeURIComponent(counterpart)}`) },
  { id: 'bank_reconciliation_full', method: 'GET', path: '/api/v1/bank-flow/reconciliation/full' },
  { id: 'bank_incoming_summary', method: 'GET', path: '/api/v1/bank-flow/incoming-summary' },

  { id: 'customs_list', method: 'GET', path: '/api/v1/customs-declarations?page=1&pageSize=20', save: saveFirstId('customsId') },
  { id: 'customs_detail', method: 'GET', path: optionalPath('customsId', (id) => `/api/v1/customs-declarations/${id}`) },
  { id: 'forex_list', method: 'GET', path: '/api/v1/forex-verifications?page=1&pageSize=20', save: saveFirstId('forexId') },
  { id: 'forex_detail', method: 'GET', path: optionalPath('forexId', (id) => `/api/v1/forex-verifications/${id}`) },
  { id: 'tax_refunds_list', method: 'GET', path: '/api/v1/tax-refunds?page=1&pageSize=20', save: saveFirstId('taxRefundId') },
  { id: 'tax_refund_detail', method: 'GET', path: optionalPath('taxRefundId', (id) => `/api/v1/tax-refunds/${id}`) },
  { id: 'tax_rates_list', method: 'GET', path: '/api/v1/tax-rates?page=1&pageSize=20', save: saveFirstId('taxRateId') },
  { id: 'tax_rate_detail', method: 'GET', path: optionalPath('taxRateId', (id) => `/api/v1/tax-rates/${id}`) },
  { id: 'tax_rate_detail_missing', method: 'GET', path: '/api/v1/tax-rates/perf-missing-tax-rate', expectedStatuses: [404] },

  { id: 'hs_codes_list', method: 'GET', path: '/api/v1/hs-codes?page=1&pageSize=20', save: saveFirstFields({ hsCode: 'hsCode' }) },
  { id: 'hs_codes_search', method: 'GET', path: '/api/v1/hs-codes/search?keyword=%E7%93%B7%E7%A0%96' },
  { id: 'hs_code_detail', method: 'GET', path: optionalPath('hsCode', (code) => `/api/v1/hs-codes/${code}`) },
  { id: 'hsciq_detail', method: 'GET', path: optionalPath('hsCode', (code) => `/api/v1/hs-codes/hsciq-detail/${code}`), expectedStatuses: [200, 403, 429, 503] },
  { id: 'hsciq_usage', method: 'GET', path: '/api/v1/hs-codes/hsciq-usage' },

  { id: 'ai_models', method: 'GET', path: '/api/v1/ai/models' },
  { id: 'ai_greeting', method: 'GET', path: '/api/v1/ai/greeting' },
  { id: 'ai_history', method: 'GET', path: '/api/v1/ai/history' },
  { id: 'ai_sessions', method: 'GET', path: '/api/v1/ai/sessions' },
  { id: 'ai_token_stats', method: 'GET', path: '/api/v1/ai/token-stats' },
  { id: 'ai_standalone_token_usage', method: 'GET', path: '/api/v1/ai/standalone-token-usage' },
  { id: 'ai_usage_trend', method: 'GET', path: '/api/v1/ai/usage/trend' },
  { id: 'ai_usage_calls', method: 'GET', path: '/api/v1/ai/usage/calls' },
  { id: 'ai_usage_summary', method: 'GET', path: '/api/v1/ai/usage/summary' },
  { id: 'ai_agent_tools', method: 'GET', path: '/api/v1/ai/agents/tools' },

  { id: 'users_list', method: 'GET', path: '/api/v1/users?page=1&pageSize=20', save: saveFirstId('userId') },
  { id: 'user_detail', method: 'GET', path: optionalPath('userId', (id) => `/api/v1/users/${id}`) },
  { id: 'agents_list', method: 'GET', path: '/api/v1/agents?page=1&pageSize=20', save: saveFirstId('agentId') },
  { id: 'agent_detail', method: 'GET', path: optionalPath('agentId', (id) => `/api/v1/agents/${id}`) },
  { id: 'agent_detail_missing', method: 'GET', path: '/api/v1/agents/perf-missing-agent', expectedStatuses: [404] },
  { id: 'notifications_list', method: 'GET', path: '/api/v1/notifications?page=1&pageSize=20' },
  { id: 'notifications_unread_count', method: 'GET', path: '/api/v1/notifications/unread-count' },

  { id: 'system_configs', method: 'GET', path: '/api/v1/system/configs' },
  { id: 'system_config_domains', method: 'GET', path: '/api/v1/system/configs/domains' },
  { id: 'system_logs', method: 'GET', path: '/api/v1/system/logs?page=1&pageSize=20' },
  { id: 'system_notifications', method: 'GET', path: '/api/v1/system/notifications?page=1&pageSize=20' },
  { id: 'system_exchange_rate', method: 'GET', path: '/api/v1/system/exchange-rate' },
  { id: 'system_ports', method: 'GET', path: '/api/v1/system/ports?page=1&pageSize=20' },
  { id: 'system_categories', method: 'GET', path: '/api/v1/system/categories?page=1&pageSize=20' },
  { id: 'system_customs_brokers', method: 'GET', path: '/api/v1/system/customs-brokers?page=1&pageSize=20' },
  { id: 'system_import_records', method: 'GET', path: '/api/v1/system/import/records?page=1&pageSize=20' },
  { id: 'system_event_ledger', method: 'GET', path: '/api/v1/system/event-ledger?page=1&pageSize=20' },
  { id: 'system_patrol_status', method: 'GET', path: '/api/v1/system/patrol/status' },

  { id: 'data_import_history', method: 'GET', path: '/api/v1/import/history?page=1&pageSize=20' },
  { id: 'data_import_stats', method: 'GET', path: '/api/v1/import/stats' },
  { id: 'search_global', method: 'GET', path: '/api/v1/search?q=EXP&page=1&pageSize=20' },
  { id: 'contract_doc_template_check', method: 'GET', path: '/api/v1/contract-doc/template/check' },
  { id: 'contract_doc_templates', method: 'GET', path: '/api/v1/contract-doc/templates' },
  { id: 'contract_templates', method: 'GET', path: '/api/v1/contract-templates', save: saveFirstId('contractTemplateId') },
  { id: 'contract_template_detail', method: 'GET', path: optionalPath('contractTemplateId', (id) => `/api/v1/contract-templates/${id}`) },
  { id: 'contract_template_detail_missing', method: 'GET', path: '/api/v1/contract-templates/perf-missing-template', expectedStatuses: [404] },
  { id: 'generic_contract_files', method: 'GET', path: optionalPath('salesId', (id) => `/api/v1/contracts/${id}/files`) },
  { id: 'procurement_template_stores', method: 'GET', path: '/api/v1/procurement-template/stores', save: saveFirstValue('procurementStoreName') },
  { id: 'procurement_template_store_detail', method: 'GET', path: optionalPath('procurementStoreName', (name) => `/api/v1/procurement-template/stores/${encodeURIComponent(name)}`) },
  { id: 'procurement_template_universal', method: 'GET', path: '/api/v1/procurement-template/universal' },
];

const getToken = async () => {
  const response = await fetch(buildUrl('/api/v1/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const json = await response.json();
  if (!response.ok || !json?.data?.token) {
    throw new Error(`Login failed with HTTP ${response.status}: ${json?.message || 'no token'}`);
  }
  return json.data.token;
};

const runRequest = async (testCase, token) => {
  const resolvedPath = typeof testCase.path === 'function' ? testCase.path(state) : testCase.path;
  const sla = resolveSla(testCase);
  if (!resolvedPath) {
    return {
      id: testCase.id,
      method: testCase.method,
      path: null,
      status: 'SKIPPED',
      durationMs: null,
      slaProfile: sla.profile,
      targetMs: sla.targetMs,
      overTarget: false,
      overThreshold: false,
      message: 'missing fixture id',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  let response;
  let text = '';

  try {
    const headers = {};
    if (testCase.auth !== false) headers.Authorization = `Bearer ${token}`;
    if (testCase.body) headers['Content-Type'] = 'application/json';
    response = await fetch(buildUrl(resolvedPath), {
      method: testCase.method,
      headers,
      body: testCase.body ? JSON.stringify(testCase.body(state)) : undefined,
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    const durationMs = Math.round(performance.now() - started);
    return {
      id: testCase.id,
      method: testCase.method,
      path: resolvedPath,
      status: 'ERROR',
      httpStatus: null,
      durationMs,
      slaProfile: sla.profile,
      targetMs: sla.targetMs,
      overTarget: durationMs > sla.targetMs,
      overThreshold: durationMs > THRESHOLD_MS,
      message: error.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Math.round(performance.now() - started);
  const json = testCase.acceptsBlob ? null : readJson(text);
  const expectedStatus = Array.isArray(testCase.expectedStatuses) && testCase.expectedStatuses.includes(response.status);
  if (testCase.save && json && (response.ok || expectedStatus)) {
    testCase.save(json, state);
  }
  const ok = response.ok || expectedStatus;

  return {
    id: testCase.id,
    method: testCase.method,
    path: resolvedPath,
    status: ok ? 'OK' : 'HTTP_ERROR',
    httpStatus: response.status,
    durationMs,
    slaProfile: sla.profile,
    targetMs: sla.targetMs,
    overTarget: durationMs > sla.targetMs,
    overThreshold: durationMs > THRESHOLD_MS,
    contentLength: Number(response.headers.get('content-length')) || Buffer.byteLength(text),
    message: response.ok ? '' : (expectedStatus ? `expected HTTP ${response.status}: ${json?.message || text.slice(0, 160)}` : (json?.message || text.slice(0, 160))),
  };
};

const toMarkdown = (results, meta) => {
  const rows = results
    .map((item) => `| ${item.id} | ${item.slaProfile || '-'} | ${item.targetMs ?? '-'} | ${item.method} | ${item.httpStatus ?? item.status} | ${item.durationMs ?? '-'} | ${item.overTarget ? 'YES' : 'NO'} | ${item.overThreshold ? 'YES' : 'NO'} | ${item.path || '-'} | ${String(item.message || '').replace(/\|/g, '/')} |`)
    .join('\n');

  const issueRows = results
    .filter((item) => item.overThreshold || item.overTarget || item.status === 'ERROR' || item.status === 'HTTP_ERROR')
    .map((item) => `- ${item.id}: ${item.durationMs}ms / target ${item.targetMs ?? '-'}ms / hard ${meta.thresholdMs}ms ${item.path || ''} ${item.message ? `(${item.message})` : ''}`)
    .join('\n') || '- None';

  return `# API Response Time Audit

## Summary
- Base URL: ${meta.baseUrl}
- Threshold: ${meta.thresholdMs}ms
- Total cases: ${meta.total}
- OK: ${meta.ok}
- HTTP errors: ${meta.httpErrors}
- Skipped: ${meta.skipped}
- Over target: ${meta.overTarget}
- Over threshold: ${meta.overThreshold}
- Problem cases: ${meta.problemCases}
- Max duration: ${meta.maxDurationMs}ms (${meta.maxDurationCase || 'n/a'})
- Generated at: ${meta.generatedAt}

## Over Target, Over Hard Threshold Or Error
${issueRows}

## Results
| ID | SLA | Target ms | Method | HTTP/Status | Duration ms | >target | >2s | Path | Message |
|---|---|---:|---|---:|---:|---|---|---|---|
${rows}
`;
};

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const token = await getToken();
  const results = [];

  for (const testCase of coreCases) {
    const result = await runRequest(testCase, token);
    results.push(result);
    const marker = result.overThreshold ? 'SLOW' : (result.overTarget ? 'TARGET' : result.status);
    process.stdout.write(`${marker.padEnd(10)} ${String(result.durationMs ?? '-').padStart(5)}ms ${testCase.id}\n`);
    await sleep(DELAY_MS);
  }

  const meta = {
    baseUrl: BASE_URL,
    thresholdMs: THRESHOLD_MS,
    targets: {
      detailMs: DETAIL_TARGET_MS,
      ordinaryMs: ORDINARY_TARGET_MS,
      deferredMs: DEFERRED_TARGET_MS,
    },
    total: results.length,
    ok: results.filter((item) => item.status === 'OK').length,
    httpErrors: results.filter((item) => item.status === 'HTTP_ERROR' || item.status === 'ERROR').length,
    skipped: results.filter((item) => item.status === 'SKIPPED').length,
    overTarget: results.filter((item) => item.overTarget).length,
    overThreshold: results.filter((item) => item.overThreshold).length,
    problemCases: results.filter((item) => item.overTarget || item.overThreshold || item.status === 'ERROR' || item.status === 'HTTP_ERROR').length,
    generatedAt: new Date().toISOString(),
  };
  const completed = results.filter((item) => typeof item.durationMs === 'number');
  const slowest = completed.sort((a, b) => b.durationMs - a.durationMs)[0];
  meta.maxDurationMs = slowest?.durationMs ?? null;
  meta.maxDurationCase = slowest?.id ?? null;

  const payload = { meta, state, results };
  const jsonPath = path.join(OUTPUT_DIR, 'api-response-times.json');
  const mdPath = path.join(OUTPUT_DIR, 'api-response-times.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(mdPath, toMarkdown(results, meta));

  process.stdout.write(`\nWrote ${jsonPath}\nWrote ${mdPath}\n`);

  if (meta.problemCases > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
