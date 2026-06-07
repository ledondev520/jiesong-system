#!/usr/bin/env node
/**
 * Input: running local backend, development login credentials
 * Output: JSON/Markdown non-read guard-path response-time baseline
 * Pos: Safe SLA audit for non-read interfaces using validation/auth/missing-fixture paths
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const USERNAME = process.env.API_BENCH_USERNAME || 'admin';
const PASSWORD = process.env.API_BENCH_PASSWORD || '123456';
const THRESHOLD_MS = Number(process.env.API_BENCH_THRESHOLD_MS || 2000);
const TIMEOUT_MS = Number(process.env.API_BENCH_TIMEOUT_MS || 10000);
const DELAY_MS = Number(process.env.API_BENCH_DELAY_MS || 300);
const OUTPUT_DIR = path.resolve(process.cwd(), 'tmp/performance');

const buildUrl = (pathname) => new URL(pathname, BASE_URL).toString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readJson = (text) => {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const cases = [
  // Auth write routes: validation or wrong-current-password paths, no mutation.
  { id: 'auth_reset_password_missing_fields', category: 'auth_write', method: 'POST', path: '/api/v1/auth/reset-password', auth: false, body: {}, expectedStatuses: [400, 429] },
  { id: 'auth_register_missing_fields', category: 'auth_write', method: 'POST', path: '/api/v1/auth/register', body: {}, expectedStatuses: [400] },
  { id: 'auth_change_password_wrong_old', category: 'auth_write', method: 'POST', path: '/api/v1/auth/change-password', body: { oldPassword: '__perf_wrong_old__', newPassword: '123456' }, expectedStatuses: [400] },

  // AI routes: local validation/auth guards only. These must not invoke model providers.
  { id: 'ai_anthropic_messages_unauthorized', category: 'ai_external_guard', method: 'POST', path: '/api/v1/ai/anthropic/v1/messages', auth: false, body: {}, expectedStatuses: [401] },
  { id: 'ai_anthropic_count_tokens_unauthorized', category: 'ai_external_guard', method: 'POST', path: '/api/v1/ai/anthropic/v1/messages/count_tokens', auth: false, body: {}, expectedStatuses: [401] },
  { id: 'ai_chat_missing_message', category: 'ai_external_guard', method: 'POST', path: '/api/v1/ai/chat', body: {}, expectedStatuses: [400] },
  { id: 'ai_chat_stream_missing_message', category: 'ai_external_guard', method: 'POST', path: '/api/v1/ai/chat/stream', body: {}, expectedStatuses: [400] },
  { id: 'ai_parse_missing_type', category: 'ai_external_guard', method: 'POST', path: '/api/v1/ai/parse', body: {}, expectedStatuses: [400] },
  { id: 'ai_agent_prompt_missing_message', category: 'ai_external_guard', method: 'POST', path: '/api/v1/ai/agents/prompt', body: {}, expectedStatuses: [400] },
  { id: 'ai_agent_prompt_stream_missing_message', category: 'ai_external_guard', method: 'POST', path: '/api/v1/ai/agents/prompt-stream', body: {}, expectedStatuses: [400] },
  { id: 'ai_agent_execute_action_missing_id', category: 'ai_external_guard', method: 'POST', path: '/api/v1/ai/agents/execute-action', body: {}, expectedStatuses: [400] },
  { id: 'ai_agent_cancel_action_missing_id', category: 'ai_external_guard', method: 'POST', path: '/api/v1/ai/agents/cancel-action', body: {}, expectedStatuses: [400] },

  // Import routes: missing-file or empty-data paths, no import execution.
  { id: 'bank_flow_import_preview_missing_file', category: 'import_guard', method: 'POST', path: '/api/v1/bank-flow/import/preview', expectedStatuses: [400] },
  { id: 'bank_flow_import_missing_file', category: 'import_guard', method: 'POST', path: '/api/v1/bank-flow/import', expectedStatuses: [400] },
  { id: 'bank_flow_invoice_preview_missing_file', category: 'import_guard', method: 'POST', path: '/api/v1/bank-flow/invoices/import/preview', expectedStatuses: [400] },
  { id: 'bank_flow_invoice_import_missing_file', category: 'import_guard', method: 'POST', path: '/api/v1/bank-flow/invoices/import', expectedStatuses: [400] },
  { id: 'batch_import_purchase_empty_data', category: 'import_guard', method: 'POST', path: '/api/v1/batch-import/purchase', body: {}, expectedStatuses: [400, 403] },
  { id: 'batch_import_sales_empty_data', category: 'import_guard', method: 'POST', path: '/api/v1/batch-import/sales', body: {}, expectedStatuses: [400, 403] },
  { id: 'finance_statement_import_file_missing_file', category: 'import_guard', method: 'POST', path: '/api/v1/finance/statements/import-file', expectedStatuses: [400] },
  { id: 'data_import_missing_file', category: 'import_guard', method: 'POST', path: '/api/v1/import', expectedStatuses: [400] },
  { id: 'data_import_preview_missing_file', category: 'import_guard', method: 'POST', path: '/api/v1/import/preview', expectedStatuses: [400] },
  { id: 'data_import_execute_empty_records', category: 'import_guard', method: 'POST', path: '/api/v1/import/execute', body: {}, expectedStatuses: [400] },
  { id: 'purchase_import_missing_file', category: 'import_guard', method: 'POST', path: '/api/v1/purchases/import', expectedStatuses: [400] },
  { id: 'system_import_missing_file', category: 'import_guard', method: 'POST', path: '/api/v1/system/import', expectedStatuses: [400] },

  // Export/download routes: missing resource or small metadata export paths.
  { id: 'file_download_missing', category: 'export_guard', method: 'GET', path: '/api/v1/files/perf-missing-file/download', expectedStatuses: [404] },
  { id: 'purchase_file_download_missing', category: 'export_guard', method: 'GET', path: '/api/v1/purchases/files/perf-missing-file/download', expectedStatuses: [404] },
  { id: 'sales_file_download_missing', category: 'export_guard', method: 'GET', path: '/api/v1/sales/files/perf-missing-file/download', expectedStatuses: [404] },
  { id: 'sales_export_excel_missing_contract', category: 'export_guard', method: 'GET', path: '/api/v1/sales/perf-missing-sales/export-excel', expectedStatuses: [404] },
  { id: 'sales_export_pdf_missing_contract', category: 'export_guard', method: 'GET', path: '/api/v1/sales/perf-missing-sales/export-pdf', expectedStatuses: [404] },
  { id: 'contract_doc_pdf_missing_contract', category: 'export_guard', method: 'GET', path: '/api/v1/contract-doc/pdf/perf-missing-contract', expectedStatuses: [404] },
  { id: 'three_forms_export_missing_contract', category: 'export_guard', method: 'GET', path: '/api/v1/three-forms/export/perf-missing-sales', expectedStatuses: [404] },
  { id: 'system_logs_export_csv', category: 'export_guard', method: 'GET', path: '/api/v1/system/logs/export/csv', expectedStatuses: [200] },

  // Common write routes with explicit validation guards.
  { id: 'agent_create_missing_fields', category: 'write_guard', method: 'POST', path: '/api/v1/agents', body: {}, expectedStatuses: [400] },
  { id: 'container_create_missing_port', category: 'write_guard', method: 'POST', path: '/api/v1/containers', body: {}, expectedStatuses: [400] },
  { id: 'contract_template_create_missing_fields', category: 'write_guard', method: 'POST', path: '/api/v1/contract-templates', body: {}, expectedStatuses: [400] },
  { id: 'contract_file_upload_missing_file', category: 'write_guard', method: 'POST', path: '/api/v1/contracts/perf-contract/files', expectedStatuses: [400] },
  { id: 'finance_payment_create_missing_fields', category: 'write_guard', method: 'POST', path: '/api/v1/finance/payments', body: {}, expectedStatuses: [400] },
  { id: 'finance_match_missing_fields', category: 'write_guard', method: 'POST', path: '/api/v1/finance/match', body: {}, expectedStatuses: [400] },
  { id: 'finance_unmatch_missing_fields', category: 'write_guard', method: 'POST', path: '/api/v1/finance/unmatch', body: {}, expectedStatuses: [400] },
  { id: 'finance_ignore_missing_fields', category: 'write_guard', method: 'POST', path: '/api/v1/finance/ignore', body: {}, expectedStatuses: [400] },
  { id: 'product_create_missing_name', category: 'write_guard', method: 'POST', path: '/api/v1/products', body: {}, expectedStatuses: [400] },
  { id: 'product_record_price_invalid_price', category: 'write_guard', method: 'POST', path: '/api/v1/products/perf-product/price-history', body: {}, expectedStatuses: [400] },
  { id: 'purchase_create_missing_supplier', category: 'write_guard', method: 'POST', path: '/api/v1/purchases', body: {}, expectedStatuses: [400] },
  { id: 'purchase_upload_file_missing_file', category: 'write_guard', method: 'POST', path: '/api/v1/purchases/perf-purchase/files', expectedStatuses: [400] },
  { id: 'sales_create_missing_exchange_rate', category: 'write_guard', method: 'POST', path: '/api/v1/sales', body: {}, expectedStatuses: [400] },
  { id: 'sales_upload_file_missing_file', category: 'write_guard', method: 'POST', path: '/api/v1/sales/perf-sales/files', expectedStatuses: [400] },
  { id: 'store_create_missing_fields', category: 'write_guard', method: 'POST', path: '/api/v1/stores', body: {}, expectedStatuses: [400] },
  { id: 'supplier_create_missing_name', category: 'write_guard', method: 'POST', path: '/api/v1/suppliers', body: {}, expectedStatuses: [400] },
  { id: 'three_forms_generate_missing_contract', category: 'write_guard', method: 'POST', path: '/api/v1/three-forms/generate', body: {}, expectedStatuses: [400] },
  { id: 'three_forms_customs_missing_contract', category: 'write_guard', method: 'POST', path: '/api/v1/three-forms/customs-declaration', body: {}, expectedStatuses: [400] },
  { id: 'three_forms_forex_missing_fields', category: 'write_guard', method: 'POST', path: '/api/v1/three-forms/forex-verification', body: {}, expectedStatuses: [400] },
  { id: 'three_forms_tax_refund_missing_fields', category: 'write_guard', method: 'POST', path: '/api/v1/three-forms/tax-refund', body: {}, expectedStatuses: [400] },
  { id: 'user_create_missing_fields', category: 'write_guard', method: 'POST', path: '/api/v1/users', body: {}, expectedStatuses: [400] },
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  let response;
  let text = '';

  try {
    const headers = {};
    if (testCase.auth !== false) headers.Authorization = `Bearer ${token}`;
    if (testCase.body !== undefined) headers['Content-Type'] = 'application/json';
    response = await fetch(buildUrl(testCase.path), {
      method: testCase.method,
      headers,
      body: testCase.body !== undefined ? JSON.stringify(testCase.body) : undefined,
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    const durationMs = Math.round(performance.now() - started);
    return {
      id: testCase.id,
      category: testCase.category,
      method: testCase.method,
      path: testCase.path,
      status: 'REQUEST_ERROR',
      durationMs,
      overThreshold: durationMs > THRESHOLD_MS,
      message: error.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : error.message,
      guardPath: true,
    };
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Math.round(performance.now() - started);
  const json = readJson(text);
  const expectedStatus = testCase.expectedStatuses.includes(response.status);

  return {
    id: testCase.id,
    category: testCase.category,
    method: testCase.method,
    path: testCase.path,
    status: expectedStatus ? 'OK' : 'HTTP_ERROR',
    httpStatus: response.status,
    durationMs,
    overThreshold: durationMs > THRESHOLD_MS,
    contentLength: Number(response.headers.get('content-length')) || Buffer.byteLength(text),
    message: expectedStatus ? (json?.message || `expected HTTP ${response.status}`) : (json?.message || text.slice(0, 160)),
    guardPath: true,
  };
};

const writeOutputs = (results) => {
  const okCount = results.filter((item) => item.status === 'OK').length;
  const errorCount = results.filter((item) => item.status !== 'OK').length;
  const overThreshold = results.filter((item) => item.overThreshold).length;
  const problemCases = results.filter((item) => item.status !== 'OK' || item.overThreshold);
  const max = results
    .filter((item) => typeof item.durationMs === 'number')
    .reduce((winner, item) => (!winner || item.durationMs > winner.durationMs ? item : winner), null);

  const summary = {
    baseUrl: BASE_URL,
    thresholdMs: THRESHOLD_MS,
    totalCases: results.length,
    ok: okCount,
    errors: errorCount,
    overThreshold,
    problemCases: problemCases.length,
    maxDurationMs: max?.durationMs || null,
    maxDurationCase: max?.id || null,
    generatedAt: new Date().toISOString(),
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, 'api-non-read-guard-times.json');
  const mdPath = path.join(OUTPUT_DIR, 'api-non-read-guard-times.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify({ meta: summary, results }, null, 2)}\n`);

  const categoryLines = Object.entries(results.reduce((acc, item) => {
    acc[item.category] ||= { total: 0, ok: 0, overThreshold: 0 };
    acc[item.category].total += 1;
    if (item.status === 'OK') acc[item.category].ok += 1;
    if (item.overThreshold) acc[item.category].overThreshold += 1;
    return acc;
  }, {}))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, item]) => `| ${category} | ${item.total} | ${item.ok} | ${item.overThreshold} |`)
    .join('\n');

  const problemLines = problemCases.length
    ? problemCases.map((item) => `- ${item.id}: ${item.status} ${item.httpStatus || ''} ${item.durationMs}ms ${item.message}`).join('\n')
    : '- None';

  const resultLines = results
    .map((item) => `| ${item.id} | ${item.category} | ${item.method} | ${item.httpStatus || item.status} | ${item.durationMs} | ${item.overThreshold ? 'YES' : 'NO'} | ${item.path} | ${String(item.message || '').replace(/\|/g, '/')} |`)
    .join('\n');

  fs.writeFileSync(mdPath, `# API Non-Read Guard-Path Audit

## Summary
- Base URL: ${summary.baseUrl}
- Threshold: ${summary.thresholdMs}ms
- Total cases: ${summary.totalCases}
- OK: ${summary.ok}
- Errors: ${summary.errors}
- Over threshold: ${summary.overThreshold}
- Problem cases: ${summary.problemCases}
- Max duration: ${summary.maxDurationMs}ms (${summary.maxDurationCase})
- Generated at: ${summary.generatedAt}

## Scope
This audit intentionally uses validation, authorization, missing-file, or missing-resource paths. It is safe for the current business database, but it is not a substitute for success-path write/import/export/AI SLA tests.

## By Category
| Category | Total | OK | >2s |
|---|---:|---:|---:|
${categoryLines}

## Over Threshold Or Error
${problemLines}

## Results
| ID | Category | Method | HTTP/Status | Duration ms | >2s | Path | Message |
|---|---|---|---:|---:|---|---|---|
${resultLines}
`);

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
};

const main = async () => {
  const token = await getToken();
  const results = [];

  for (const testCase of cases) {
    const result = await runRequest(testCase, token);
    results.push(result);
    const display = `${result.status.padEnd(14)} ${String(result.durationMs).padStart(5)}ms ${testCase.id}`;
    console.log(display);
    await sleep(DELAY_MS);
  }

  writeOutputs(results);
  const problemCases = results.filter((item) => item.status !== 'OK' || item.overThreshold);
  if (problemCases.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
