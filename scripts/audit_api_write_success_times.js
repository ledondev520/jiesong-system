#!/usr/bin/env node
/**
 * Input: disposable backend instance, development login credentials
 * Output: JSON/Markdown write success-path response-time baseline
 * Pos: Safe success-path SLA audit for selected write interfaces on a disposable database copy
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const BASE_URL = process.env.API_BASE_URL;
const USERNAME = process.env.API_BENCH_USERNAME || 'admin';
const PASSWORD = process.env.API_BENCH_PASSWORD || '123456';
const THRESHOLD_MS = Number(process.env.API_BENCH_THRESHOLD_MS || 2000);
const TIMEOUT_MS = Number(process.env.API_BENCH_TIMEOUT_MS || 10000);
const DELAY_MS = Number(process.env.API_BENCH_DELAY_MS || 250);
const OUTPUT_DIR = path.resolve(process.cwd(), 'tmp/performance');

const state = {
  runId: `perf-${Date.now()}`,
};

const requireDisposableTarget = () => {
  if (process.env.API_PERF_ALLOW_WRITES !== 'true') {
    throw new Error('Refusing to run write audit: set API_PERF_ALLOW_WRITES=true for a disposable backend only.');
  }
  if (process.env.API_PERF_DISPOSABLE_DB !== 'true') {
    throw new Error('Refusing to run write audit: set API_PERF_DISPOSABLE_DB=true after pointing backend at a copied database.');
  }
  if (!BASE_URL) {
    throw new Error('Refusing to run write audit: API_BASE_URL must point at the disposable backend instance.');
  }
  const url = new URL(BASE_URL);
  if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && ['3000', '3001'].includes(url.port)) {
    throw new Error(`Refusing to run write audit against normal local port ${url.port}; use a disposable backend port.`);
  }
};

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

const dataOf = (json) => json?.data || null;
const saveId = (key) => (json) => {
  const id = dataOf(json)?.id;
  if (id) state[key] = id;
};
const readPath = (value, segments) => segments.reduce((current, segment) => current?.[segment], value);
const savePath = (key, segments) => (json) => {
  const value = readPath(json, segments);
  if (value) state[key] = value;
};

const cases = [
  {
    id: 'system_config_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/system/configs/perfWriteAudit_${state.runId}`,
    body: () => ({ value: { runId: state.runId, enabled: true }, note: 'performance write success audit' }),
  },
  {
    id: 'system_port_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/system/ports',
    body: () => ({ name: `性能港口-${state.runId}`, code: `P${state.runId.replace(/\D/g, '').slice(-7)}` }),
    save: saveId('portId'),
    expectedStatuses: [200],
  },
  {
    id: 'system_port_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/system/ports/${state.portId}`,
    body: () => ({ name: `性能港口更新-${state.runId}` }),
  },
  {
    id: 'store_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/stores',
    body: () => ({
      name: `性能门店-${state.runId}`,
      portId: state.portId,
      contactName: '性能巡检',
      contactPhone: '10000000000',
    }),
    save: saveId('storeId'),
    expectedStatuses: [201],
  },
  {
    id: 'store_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/stores/${state.storeId}`,
    body: () => ({ name: `性能门店更新-${state.runId}`, portId: state.portId }),
  },
  {
    id: 'store_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/stores/${state.storeId}`,
  },
  {
    id: 'system_port_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/system/ports/${state.portId}`,
  },
  {
    id: 'system_category_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/system/categories',
    body: () => ({ name: `性能分类-${state.runId}` }),
    save: saveId('categoryId'),
    expectedStatuses: [200],
  },
  {
    id: 'system_category_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/system/categories/${state.categoryId}`,
    body: () => ({ name: `性能分类更新-${state.runId}` }),
  },
  {
    id: 'system_category_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/system/categories/${state.categoryId}`,
  },
  {
    id: 'system_customs_broker_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/system/customs-brokers',
    body: () => ({ name: `性能报关行-${state.runId}`, contact: '性能巡检' }),
    save: saveId('customsBrokerId'),
    expectedStatuses: [200],
  },
  {
    id: 'system_customs_broker_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/system/customs-brokers/${state.customsBrokerId}`,
    body: () => ({ phone: '10000000001' }),
  },
  {
    id: 'system_customs_broker_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/system/customs-brokers/${state.customsBrokerId}`,
  },
  {
    id: 'supplier_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/suppliers',
    body: () => ({ name: `性能供应商-${state.runId}`, shortName: `性能供-${state.runId.slice(-5)}` }),
    save: saveId('supplierId'),
    expectedStatuses: [201],
  },
  {
    id: 'supplier_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/suppliers/${state.supplierId}`,
    body: () => ({ contactName: '性能巡检', contactPhone: '10000000002' }),
  },
  {
    id: 'supplier_alias_create_success',
    category: 'write_success',
    method: 'POST',
    path: () => `/api/v1/suppliers/${state.supplierId}/aliases`,
    body: () => ({ alias: `性能供别名-${state.runId}` }),
    expectedStatuses: [201],
  },
  {
    id: 'supplier_quality_issue_success',
    category: 'write_success',
    method: 'POST',
    path: () => `/api/v1/suppliers/${state.supplierId}/quality-issue`,
    body: () => ({ hasQualityIssue: true, qualityNote: 'performance write success audit' }),
  },
  {
    id: 'product_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/products',
    body: () => ({ customsName: `性能商品-${state.runId}`, unit: '件', lowStockThreshold: 1 }),
    save: saveId('productId'),
    expectedStatuses: [201],
  },
  {
    id: 'product_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/products/${state.productId}`,
    body: () => ({ customsName: `性能商品更新-${state.runId}`, unit: '箱', lowStockThreshold: 2 }),
  },
  {
    id: 'product_supplier_link_success',
    category: 'write_success',
    method: 'POST',
    path: () => `/api/v1/products/${state.productId}/suppliers`,
    body: () => ({ supplierId: state.supplierId, price: 12.34 }),
  },
  {
    id: 'product_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/products/${state.productId}`,
  },
  {
    id: 'supplier_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/suppliers/${state.supplierId}`,
  },
  {
    id: 'user_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/users',
    body: () => ({ username: `perf_user_${state.runId}`, password: '123456', name: '性能巡检用户', role: 'SALES' }),
    save: saveId('userId'),
    expectedStatuses: [201],
  },
  {
    id: 'auth_user_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/auth/users/${state.userId}`,
    body: () => ({ name: '性能巡检用户-认证路由', role: 'SALES', isActive: true }),
  },
  {
    id: 'user_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/users/${state.userId}`,
    body: () => ({ name: '性能巡检用户-用户路由', role: 'WAREHOUSE', isActive: true }),
  },
  {
    id: 'user_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/users/${state.userId}`,
  },
  {
    id: 'agent_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/agents',
    body: () => ({
      name: `性能Agent-${state.runId}`,
      slug: `perf-agent-${state.runId}`,
      description: 'performance agent success audit',
    }),
    save: saveId('agentId'),
    expectedStatuses: [201],
  },
  {
    id: 'agent_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/agents/${state.agentId}`,
    body: () => ({
      name: `性能Agent更新-${state.runId}`,
      slug: `perf-agent-${state.runId}`,
      description: 'performance agent update audit',
      status: 'ACTIVE',
    }),
  },
  {
    id: 'agent_credential_issue_success',
    category: 'write_success',
    method: 'POST',
    path: () => `/api/v1/agents/${state.agentId}/credentials`,
    body: () => ({ label: `perf-${state.runId}`, expiresInDays: 7 }),
    save: savePath('agentCredentialId', ['data', 'credential', 'id']),
    expectedStatuses: [201],
  },
  {
    id: 'agent_credential_rotate_success',
    category: 'write_success',
    method: 'POST',
    path: () => `/api/v1/agents/credentials/${state.agentCredentialId}/rotate`,
    body: () => ({ expiresInDays: 14 }),
    save: savePath('rotatedAgentCredentialId', ['data', 'credential', 'id']),
    expectedStatuses: [201],
  },
  {
    id: 'agent_credential_revoke_success',
    category: 'write_success',
    method: 'POST',
    path: () => `/api/v1/agents/credentials/${state.rotatedAgentCredentialId}/revoke`,
    body: () => ({}),
  },
  {
    id: 'notification_list_for_mark_read_success',
    category: 'write_success_fixture',
    method: 'GET',
    path: '/api/v1/notifications?page=1&pageSize=1',
    save: savePath('notificationId', ['data', 'items', 0, 'id']),
  },
  {
    id: 'notification_mark_read_success',
    category: 'write_success',
    method: 'POST',
    path: () => `/api/v1/notifications/${state.notificationId}/read`,
    body: () => ({}),
  },
  {
    id: 'notification_mark_all_read_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/notifications/read-all',
    body: () => ({}),
  },
  {
    id: 'contract_template_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/contract-templates',
    body: () => ({ name: `性能模板-${state.runId}`, type: 'PURCHASE', items: [{ name: '性能条款', required: false }] }),
    save: saveId('contractTemplateId'),
    expectedStatuses: [201],
  },
  {
    id: 'contract_template_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/contract-templates/${state.contractTemplateId}`,
  },
  {
    id: 'sales_calculate_price_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/sales/calculate-price',
    body: () => ({ costPrice: 100, exchangeRate: 7, profitRate: 1.3 }),
  },
  {
    id: 'contract_fixture_port_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/system/ports',
    body: () => ({ name: `性能合同港口-${state.runId}`, code: `C${state.runId.replace(/\D/g, '').slice(-7)}` }),
    save: saveId('contractPortId'),
    expectedStatuses: [200],
  },
  {
    id: 'contract_fixture_store_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/stores',
    body: () => ({
      name: `性能合同门店-${state.runId}`,
      portId: state.contractPortId,
      contactName: '性能巡检',
      contactPhone: '10000000003',
    }),
    save: saveId('contractStoreId'),
    expectedStatuses: [201],
  },
  {
    id: 'contract_fixture_supplier_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/suppliers',
    body: () => ({ name: `性能合同供应商-${state.runId}`, shortName: `合同供-${state.runId.slice(-5)}` }),
    save: saveId('contractSupplierId'),
    expectedStatuses: [201],
  },
  {
    id: 'contract_fixture_product_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/products',
    body: () => ({
      customsName: `性能合同商品-${state.runId}`,
      hsCode: `6907${state.runId.replace(/\D/g, '').slice(-6)}`,
      unit: '件',
      lowStockThreshold: 1,
      grossWeight: 1.2,
      netWeight: 1,
      volume: 0.03,
      length: 500,
      width: 400,
      height: 300,
    }),
    save: saveId('contractProductId'),
    expectedStatuses: [201],
  },
  {
    id: 'purchase_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/purchases',
    body: () => ({
      contractNo: `CG-PERF-${state.runId}`,
      supplierId: state.contractSupplierId,
      taxRate: 13,
      note: 'performance purchase success audit',
      items: [{
        productId: state.contractProductId,
        quantity: 2,
        unit: '件',
        unitPrice: 11,
        specification: 'performance fixture',
      }],
    }),
    save: saveId('purchaseId'),
    expectedStatuses: [201],
  },
  {
    id: 'purchase_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/purchases/${state.purchaseId}`,
    body: () => ({ taxRate: 13, invoiceNo: `INV-${state.runId}`, note: 'performance purchase update audit' }),
  },
  {
    id: 'purchase_add_item_success',
    category: 'write_success',
    method: 'POST',
    path: () => `/api/v1/purchases/${state.purchaseId}/items`,
    body: () => ({
      productId: state.contractProductId,
      quantity: 1,
      unit: '件',
      unitPrice: 12,
      specification: 'performance added item',
    }),
    expectedStatuses: [201],
  },
  {
    id: 'purchase_status_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/purchases/${state.purchaseId}/status`,
    body: () => ({ status: 'PENDING_INSPECTION' }),
  },
  {
    id: 'purchase_suppliers_by_products_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/purchases/suppliers-by-products',
    body: () => ({ productIds: [state.contractProductId] }),
  },
  {
    id: 'sales_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/sales',
    body: () => ({
      contractNo: `EXP-PERF-SALE-${state.runId}`,
      exchangeRate: 7,
      note: 'performance sales success audit',
    }),
    save: saveId('salesId'),
    expectedStatuses: [201],
  },
  {
    id: 'sales_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/sales/${state.salesId}`,
    body: () => ({ exchangeRate: 7.1, portId: state.contractPortId, note: 'performance sales update audit' }),
  },
  {
    id: 'sales_add_item_success',
    category: 'write_success',
    method: 'POST',
    path: () => `/api/v1/sales/${state.salesId}/items`,
    body: () => ({
      productId: state.contractProductId,
      storeId: state.contractStoreId,
      quantity: 1,
      unit: '件',
      costPrice: 20,
      sellingPrice: 4,
      specification: 'performance sales item',
    }),
    expectedStatuses: [201],
  },
  {
    id: 'sales_add_packing_item_success',
    category: 'write_success',
    method: 'POST',
    path: () => `/api/v1/sales/${state.salesId}/packing-items`,
    body: () => ({
      productId: state.contractProductId,
      storeId: state.contractStoreId,
      quantity: 1,
      unit: '件',
      boxes: 1,
      grossWeight: 1.2,
      netWeight: 1,
      volume: 0.03,
      unitPrice: 4,
      length: 500,
      width: 400,
      height: 300,
      note: 'performance packing item',
    }),
    save: saveId('salesPackingItemId'),
    expectedStatuses: [201],
  },
  {
    id: 'sales_update_packing_item_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/sales/${state.salesId}/packing-items/${state.salesPackingItemId}`,
    body: () => ({
      storeId: state.contractStoreId,
      quantity: 2,
      unit: '件',
      boxes: 2,
      grossWeight: 2.4,
      netWeight: 2,
      volume: 0.06,
      unitPrice: 4,
      length: 500,
      width: 400,
      height: 300,
      note: 'performance packing item updated',
    }),
  },
  {
    id: 'customs_auto_drafts_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/customs-declarations/auto-drafts',
    body: () => ({ salesContractId: state.salesId, replaceExisting: true }),
    save: savePath('autoCustomsDeclarationId', ['data', 'items', 0, 'customsDeclarationId']),
  },
  {
    id: 'tax_refund_auto_drafts_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/tax-refunds/auto-drafts',
    body: () => ({ customsDeclarationId: state.autoCustomsDeclarationId, replaceExisting: true }),
  },
  {
    id: 'customs_auto_draft_delete_success',
    category: 'write_success_cleanup',
    method: 'DELETE',
    path: () => `/api/v1/customs-declarations/${state.autoCustomsDeclarationId}`,
  },
  {
    id: 'sales_delete_packing_item_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/sales/${state.salesId}/packing-items/${state.salesPackingItemId}`,
  },
  {
    id: 'sales_status_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/sales/${state.salesId}/status`,
    body: () => ({ status: 'PENDING_SHIPMENT' }),
  },
  {
    id: 'container_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/containers',
    body: () => ({
      contractNo: `EXP-PERF-CTN-${state.runId}`,
      portId: state.contractPortId,
      exchangeRate: 7,
      status: 'DRAFT',
      note: 'performance container success audit',
    }),
    save: saveId('containerId'),
    expectedStatuses: [201],
  },
  {
    id: 'container_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/containers/${state.containerId}`,
    body: () => ({
      portId: state.contractPortId,
      exchangeRate: 7.2,
      customsBroker: 'performance broker',
      isFumigated: true,
      hasTaxRefund: true,
      note: 'performance container update audit',
    }),
  },
  {
    id: 'container_add_item_success',
    category: 'write_success',
    method: 'POST',
    path: () => `/api/v1/containers/${state.containerId}/items`,
    body: () => ({
      productId: state.contractProductId,
      storeId: state.contractStoreId,
      quantity: 3,
      unit: '件',
      boxes: 3,
      grossWeight: 3.6,
      netWeight: 3,
      volume: 0.09,
      unitPrice: 5,
      length: 500,
      width: 400,
      height: 300,
      note: 'performance container item',
    }),
    save: saveId('containerItemId'),
    expectedStatuses: [201],
  },
  {
    id: 'container_update_item_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/containers/${state.containerId}/items/${state.containerItemId}`,
    body: () => ({
      storeId: state.contractStoreId,
      quantity: 4,
      unit: '件',
      boxes: 4,
      grossWeight: 4.8,
      netWeight: 4,
      volume: 0.12,
      unitPrice: 5,
      length: 500,
      width: 400,
      height: 300,
      note: 'performance container item updated',
    }),
  },
  {
    id: 'container_delete_item_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/containers/${state.containerId}/items/${state.containerItemId}`,
  },
  {
    id: 'container_status_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/containers/${state.containerId}/status`,
    body: () => ({ status: 'SHIPPED' }),
  },
  {
    id: 'container_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/containers/${state.containerId}`,
  },
  {
    id: 'tax_rate_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/tax-rates',
    body: () => ({
      productId: state.contractProductId,
      hsCode: `6907${state.runId.replace(/\D/g, '').slice(-6)}`,
      purchaseTaxRate: 13,
      refundRate: 9,
      effectiveFrom: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      isActive: true,
      note: 'performance tax rate success audit',
    }),
    save: saveId('taxRateId'),
    expectedStatuses: [201],
  },
  {
    id: 'tax_rate_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/tax-rates/${state.taxRateId}`,
    body: () => ({ refundRate: 11, note: 'performance tax rate update audit' }),
  },
  {
    id: 'tax_rate_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/tax-rates/${state.taxRateId}`,
  },
  {
    id: 'customs_declaration_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/customs-declarations',
    body: () => ({
      declarationNo: `CUS-PERF-${state.runId}`,
      salesContractId: state.salesId,
      declaredAt: new Date().toISOString(),
      customsBroker: 'performance broker',
      currency: 'USD',
      exchangeRate: 7.1,
      totalAmount: 40,
      totalQuantity: 2,
      totalNetWeight: 2,
      totalGrossWeight: 2.4,
      status: 'DRAFT',
      note: 'performance customs declaration success audit',
    }),
    save: saveId('customsDeclarationId'),
    expectedStatuses: [201],
  },
  {
    id: 'customs_declaration_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/customs-declarations/${state.customsDeclarationId}`,
    body: () => ({ status: 'DECLARED', totalAmount: 42, note: 'performance customs declaration update audit' }),
  },
  {
    id: 'tax_refund_create_success',
    category: 'write_success',
    method: 'POST',
    path: '/api/v1/tax-refunds',
    body: () => ({
      refundNo: `TR-PERF-${state.runId}`,
      salesContractId: state.salesId,
      customsDeclarationId: state.customsDeclarationId,
      declaredAmount: 42,
      refundableAmount: 4.62,
      refundedAmount: 0,
      appliedAt: new Date().toISOString(),
      status: 'DRAFT',
      match_status: 'pending',
      note: 'performance tax refund success audit',
    }),
    save: saveId('taxRefundId'),
    expectedStatuses: [201],
  },
  {
    id: 'tax_refund_update_success',
    category: 'write_success',
    method: 'PUT',
    path: () => `/api/v1/tax-refunds/${state.taxRefundId}`,
    body: () => ({ status: 'APPLIED', refundableAmount: 5.12, note: 'performance tax refund update audit' }),
  },
  {
    id: 'tax_refund_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/tax-refunds/${state.taxRefundId}`,
  },
  {
    id: 'customs_declaration_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/customs-declarations/${state.customsDeclarationId}`,
  },
  {
    id: 'sales_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/sales/${state.salesId}`,
  },
  {
    id: 'purchase_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/purchases/${state.purchaseId}`,
  },
  {
    id: 'contract_fixture_product_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/products/${state.contractProductId}`,
  },
  {
    id: 'contract_fixture_supplier_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/suppliers/${state.contractSupplierId}`,
  },
  {
    id: 'contract_fixture_store_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/stores/${state.contractStoreId}`,
  },
  {
    id: 'contract_fixture_port_delete_success',
    category: 'write_success',
    method: 'DELETE',
    path: () => `/api/v1/system/ports/${state.contractPortId}`,
  },
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

const resolvePath = (testCase) => {
  const pathname = typeof testCase.path === 'function' ? testCase.path() : testCase.path;
  if (!pathname || pathname.includes('undefined')) {
    throw new Error(`Missing fixture for ${testCase.id}: ${pathname || 'empty path'}`);
  }
  return pathname;
};

const runRequest = async (testCase, token) => {
  let pathname;
  try {
    pathname = resolvePath(testCase);
  } catch (error) {
    return {
      id: testCase.id,
      category: testCase.category,
      method: testCase.method,
      path: null,
      status: 'SKIPPED',
      durationMs: null,
      overThreshold: false,
      message: error.message,
      successPath: true,
    };
  }

  const body = typeof testCase.body === 'function' ? testCase.body() : testCase.body;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  let response;
  let text = '';

  try {
    const headers = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    response = await fetch(buildUrl(pathname), {
      method: testCase.method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    const durationMs = Math.round(performance.now() - started);
    return {
      id: testCase.id,
      category: testCase.category,
      method: testCase.method,
      path: pathname,
      status: 'REQUEST_ERROR',
      durationMs,
      overThreshold: durationMs > THRESHOLD_MS,
      message: error.name === 'AbortError' ? `timeout after ${TIMEOUT_MS}ms` : error.message,
      successPath: true,
    };
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Math.round(performance.now() - started);
  const json = readJson(text);
  const expectedStatuses = testCase.expectedStatuses || [200];
  const expectedStatus = expectedStatuses.includes(response.status);
  if (expectedStatus && typeof testCase.save === 'function') {
    testCase.save(json);
  }

  return {
    id: testCase.id,
    category: testCase.category,
    method: testCase.method,
    path: pathname,
    status: expectedStatus ? 'OK' : 'HTTP_ERROR',
    httpStatus: response.status,
    durationMs,
    overThreshold: durationMs > THRESHOLD_MS,
    contentLength: Number(response.headers.get('content-length')) || Buffer.byteLength(text),
    message: expectedStatus ? (json?.message || `expected HTTP ${response.status}`) : (json?.message || text.slice(0, 180)),
    successPath: true,
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
    runId: state.runId,
    generatedAt: new Date().toISOString(),
    safety: {
      allowWrites: process.env.API_PERF_ALLOW_WRITES === 'true',
      disposableDb: process.env.API_PERF_DISPOSABLE_DB === 'true',
    },
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, 'api-write-success-times.json');
  const mdPath = path.join(OUTPUT_DIR, 'api-write-success-times.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify({ meta: summary, results }, null, 2)}\n`);

  const problemLines = problemCases.length
    ? problemCases.map((item) => `- ${item.id}: ${item.status} ${item.httpStatus || ''} ${item.durationMs}ms ${item.message}`).join('\n')
    : '- None';

  const resultLines = results
    .map((item) => `| ${item.id} | ${item.method} | ${item.httpStatus || item.status} | ${item.durationMs ?? '-'} | ${item.overThreshold ? 'YES' : 'NO'} | ${item.path || '-'} | ${String(item.message || '').replace(/\|/g, '/')} |`)
    .join('\n');

  fs.writeFileSync(mdPath, `# API Write Success-Path Audit

## Summary
- Base URL: ${summary.baseUrl}
- Threshold: ${summary.thresholdMs}ms
- Total cases: ${summary.totalCases}
- OK: ${summary.ok}
- Errors: ${summary.errors}
- Over threshold: ${summary.overThreshold}
- Problem cases: ${summary.problemCases}
- Max duration: ${summary.maxDurationMs}ms (${summary.maxDurationCase})
- Run ID: ${summary.runId}
- Generated at: ${summary.generatedAt}

## Scope
This audit writes to a disposable database copy only. It covers selected success-path write interfaces for users, suppliers, products, stores, system dictionaries, contract templates, purchase contracts, sales contracts, containers, Agent credentials, notifications, customs declarations, tax refunds, tax rates, and price calculation. It does not cover file uploads, large imports/exports, provider-backed AI calls, or operational jobs.

## Over Threshold Or Error
${problemLines}

## Results
| ID | Method | HTTP/Status | Duration ms | >2s | Path | Message |
|---|---|---:|---:|---|---|---|
${resultLines}
`);

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath}`);
};

const main = async () => {
  requireDisposableTarget();
  const token = await getToken();
  const results = [];

  for (const testCase of cases) {
    const result = await runRequest(testCase, token);
    results.push(result);
    const display = `${result.status.padEnd(14)} ${String(result.durationMs ?? '-').padStart(5)}ms ${testCase.id}`;
    console.log(display);
    await sleep(DELAY_MS);
  }

  writeOutputs(results);
  const problemCases = results.filter((item) => item.status !== 'OK' || item.overThreshold);
  if (problemCases.length > 0) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
