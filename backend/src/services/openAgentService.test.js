const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config');
const prisma = require('../utils/prisma');
const customsDeclarationService = require('./customsDeclarationService');
const forexVerificationService = require('./forexVerificationService');
const taxRefundService = require('./taxRefundService');
const financeService = require('./financeService');
const openAgentService = require('./openAgentService');

const withPatched = async (patchMap, callback) => {
  const originals = [];
  Object.entries(patchMap).forEach(([path, replacement]) => {
    const [rootName, maybeDelegateName, maybeMethodName] = path.split('.');
    const root = {
      prisma,
      financeService,
      customsDeclarationService,
      forexVerificationService,
      taxRefundService,
    }[rootName];
    if (!root) throw new Error(`unknown patch root: ${rootName}`);

    if (maybeMethodName) {
      const delegate = root[maybeDelegateName] || {};
      const originalDelegate = root[maybeDelegateName];
      const original = delegate[maybeMethodName];
      if (!originalDelegate) root[maybeDelegateName] = delegate;
      originals.push({ root: delegate, methodName: maybeMethodName, original, restoreRoot: root, restoreKey: maybeDelegateName, originalDelegate });
      delegate[maybeMethodName] = replacement;
      return;
    }

    const methodName = maybeDelegateName;
    originals.push({ root, methodName, original: root[methodName] });
    root[methodName] = replacement;
  });

  try {
    await callback();
  } finally {
    originals.reverse().forEach(({ root, methodName, original, restoreRoot, restoreKey, originalDelegate }) => {
      root[methodName] = original;
      if (restoreRoot && typeof originalDelegate === 'undefined') {
        delete restoreRoot[restoreKey];
      }
    });
  }
};

test('getAgentPreset: 支持三类业务 agent', () => {
  const finance = openAgentService.getAgentPreset('finance');
  const exportAgent = openAgentService.getAgentPreset('export');
  const executive = openAgentService.getAgentPreset('executive');

  assert.equal(finance.id, 'finance');
  assert.equal(exportAgent.id, 'export');
  assert.equal(executive.id, 'executive');
  assert.match(finance.prompt, /财务/);
  assert.match(exportAgent.prompt, /出口|单证/);
  assert.match(executive.prompt, /老板|经营|驾驶舱/);
});

test('unified preset: 作为唯一主公开入口，legacy preset 退为内部兼容态', () => {
  const unified = openAgentService.getAgentPreset('unified');
  const finance = openAgentService.getAgentPreset('finance');

  assert.equal(openAgentService.PRIMARY_AGENT_TYPE, 'unified');
  assert.equal(unified.isPublic, true);
  assert.equal(unified.isLegacy, false);
  assert.equal(finance.isPublic, false);
  assert.equal(finance.isLegacy, true);
});

test('persistAgentRun: 使用交互式事务统一持久化运行记录与回放摘要', async () => {
  const writes = [];
  const tx = {
    chatHistory: {
      create: async ({ data }) => writes.push(['chatHistory', data.role]),
    },
    tokenUsage: {
      create: async () => writes.push(['tokenUsage']),
    },
    operationLog: {
      create: async ({ data }) => writes.push(['operationLog', data.action]),
    },
    agentReplaySummary: {
      upsert: async () => writes.push(['agentReplaySummary']),
    },
  };

  await withPatched({
    'prisma.$transaction': async (transaction) => {
      assert.equal(typeof transaction, 'function');
      return transaction(tx);
    },
  }, async () => {
    await openAgentService.persistAgentRun({
      userId: 'user-1',
      sessionId: 'session-1',
      agentType: 'unified',
      message: '检查运行状态',
      responseText: '运行正常',
      usage: { input_tokens: 2, output_tokens: 2 },
      model: 'test-model',
      routePlan: null,
      selectedToolNames: [],
      toolTraceSummary: null,
      actionRecommendations: [],
      pendingActionSummary: [],
    });
  });

  assert.deepEqual(writes, [
    ['chatHistory', 'user'],
    ['chatHistory', 'assistant'],
    ['tokenUsage'],
    ['operationLog', 'AGENT_RUN'],
    ['operationLog', 'AGENT_REPLAY_SNAPSHOT'],
    ['agentReplaySummary'],
  ]);
});

test('listToolRegistry: 暴露通用主 Agent 的跨域工具面与写操作确认标记', () => {
  const registry = openAgentService.listToolRegistry();
  const names = registry.map((item) => item.name);

  assert.ok(names.includes('SearchEntities'));
  assert.ok(names.includes('GetPurchaseOverview'));
  assert.ok(names.includes('GetSupplierOverview'));
  assert.ok(names.includes('GetSalesContractDetail'));
  assert.ok(names.includes('GetPurchaseContractDetail'));
  assert.ok(names.includes('GetFinanceRiskOverview'));
  assert.ok(names.includes('GetInventoryOverview'));
  assert.ok(names.includes('GetLowStockAlerts'));
  assert.ok(names.includes('GetTaxComplianceOverview'));
  assert.ok(names.includes('GetCustomsDeclarationDetail'));
  assert.ok(names.includes('GetTaxRefundDetail'));
  assert.ok(names.includes('GetForexVerificationDetail'));
  assert.ok(names.includes('GetRecentEvents'));
  assert.ok(names.includes('DiagnoseSalesContractFlow'));
  assert.ok(names.includes('DiagnosePurchaseExecution'));
  assert.ok(names.includes('DiagnoseTradeComplianceReadiness'));
  assert.ok(names.includes('CreateSupplierRecord'));
  assert.ok(names.includes('UpdateSupplierRecord'));
  assert.ok(names.includes('CreatePurchaseContract'));
  assert.ok(names.includes('UpdatePurchaseContract'));
  assert.ok(names.includes('UpdateInventoryStatus'));

  const searchTool = registry.find((item) => item.name === 'SearchEntities');
  assert.equal(searchTool.domain, 'search');
  assert.equal(searchTool.access, 'read');
  assert.equal(searchTool.confirmationRequired, false);

  const configWriteTool = registry.find((item) => item.name === 'UpdateSystemConfig');
  assert.equal(configWriteTool.domain, 'system');
  assert.equal(configWriteTool.access, 'write');
  assert.equal(configWriteTool.confirmationRequired, true);
  assert.ok(Array.isArray(configWriteTool.allowedRoles));
  assert.ok(configWriteTool.allowedRoles.includes('ADMIN'));

  const salesDiagnosticTool = registry.find((item) => item.name === 'DiagnoseSalesContractFlow');
  assert.equal(salesDiagnosticTool.access, 'read');
  assert.equal(salesDiagnosticTool.domain, 'sales-export');
  assert.equal(salesDiagnosticTool.isComposite, true);
});

test('isToolAllowedForRole: 按工具 allowedRoles 控制写工具授权', () => {
  assert.equal(openAgentService.isToolAllowedForRole('UpdateSystemConfig', 'ADMIN'), true);
  assert.equal(openAgentService.isToolAllowedForRole('UpdateSystemConfig', 'FINANCE'), false);
  assert.equal(openAgentService.isToolAllowedForRole('AllocatePayment', 'FINANCE'), true);
  assert.equal(openAgentService.isToolAllowedForRole('UpdateInventoryStatus', 'WAREHOUSE'), true);
  assert.equal(openAgentService.isToolAllowedForRole('UpdateInventoryStatus', 'SALES'), false);
  assert.equal(openAgentService.isToolAllowedForRole('SearchEntities', 'SALES'), true);
});

test('buildToolRegistryPayload: 按当前角色给出可用工具与域级摘要', () => {
  const payload = openAgentService.buildToolRegistryPayload('FINANCE');

  assert.equal(payload.primaryAgentType, 'unified');
  assert.equal(payload.viewerRole, 'FINANCE');
  assert.ok(Array.isArray(payload.domains));
  assert.ok(payload.tools.some((tool) => tool.name === 'AllocatePayment' && tool.availableForViewer === true));
  assert.ok(payload.tools.some((tool) => tool.name === 'CreateSupplierRecord' && tool.availableForViewer === false));

  const financeDomain = payload.domains.find((item) => item.domain === 'finance');
  assert.ok(financeDomain);
  assert.ok(financeDomain.availableWriteCount >= 1);
  assert.ok(financeDomain.compositeToolCount >= 1);

  const complianceDomain = payload.domains.find((item) => item.domain === 'trade-compliance');
  assert.ok(complianceDomain);
  assert.ok(complianceDomain.compositeToolCount >= 1);
});

test('buildSalesContractFlowDiagnostic: 聚合销售合同、库存、报关、核销、退税链路并给出阻塞项', async () => {
  await withPatched({
    'prisma.salesContract.findFirst': async () => ({
      id: 'sc-1',
      contractNo: 'EXP2600001',
      status: 'SHIPPED',
      totalAmount: 1000,
      receivedAmount: 300,
      hasTaxRefund: true,
      items: [{ id: 'si-1' }],
    }),
    'prisma.inventory.findMany': async () => ([
      { id: 'inv-1', status: 'INBOUND', quantity: 20 },
      { id: 'inv-2', status: 'OUTBOUND', quantity: 10 },
    ]),
    'financeService.listUnallocatedPayments': async () => ([]),
    'customsDeclarationService.listCustomsDeclarations': async () => ({
      total: 1,
      items: [{ id: 'cd-1', declarationNo: 'BG-1', status: 'DECLARED' }],
    }),
    'forexVerificationService.listForexVerifications': async () => ({
      total: 0,
      items: [],
    }),
    'taxRefundService.listTaxRefunds': async () => ({
      total: 0,
      items: [],
    }),
  }, async () => {
    const result = await openAgentService.buildSalesContractFlowDiagnostic({ contractNo: 'EXP2600001' });

    assert.equal(result.contractNo, 'EXP2600001');
    assert.equal(result.finance.outstandingAmount, 700);
    assert.equal(result.inventory.statusBreakdown.INBOUND, 1);
    assert.equal(result.tradeCompliance.customs.total, 1);
    assert.equal(result.tradeCompliance.forex.total, 0);
    assert.ok(result.blockers.some((item) => /核销/.test(item)));
    assert.ok(result.nextActions.some((item) => /核销/.test(item)));
    assert.ok(Array.isArray(result.recommendedActions));
    const forexRecommendation = result.recommendedActions.find((item) => item.code === 'trade-compliance.prepare-forex-verification');
    assert.ok(forexRecommendation);
    assert.equal(forexRecommendation.priority, 'high');
    assert.equal(forexRecommendation.executionMode, 'confirmable_write');
    assert.equal(forexRecommendation.actionType, 'CreateForexVerificationDraft');
    assert.equal(forexRecommendation.params.salesContractId, 'sc-1');
    assert.equal(forexRecommendation.params.customsDeclarationId, 'cd-1');
  });
});

test('buildSalesContractFlowDiagnostic: 唯一高置信待分配收款会升级为 AllocatePayment 建议', async () => {
  await withPatched({
    'prisma.salesContract.findFirst': async () => ({
      id: 'sc-fin-1',
      contractNo: 'EXP2600099',
      status: 'SHIPPED',
      totalAmount: 1000,
      receivedAmount: 300,
      hasTaxRefund: false,
      items: [{ id: 'si-1', quantity: 5 }],
      packingItems: [],
    }),
    'prisma.inventory.findMany': async () => ([]),
    'financeService.listUnallocatedPayments': async () => ([
      {
        id: 'pay-1',
        note: '客户回款 EXP2600099',
        amount: 700,
        remainingAmount: 700,
        customerName: 'SP Food',
      },
    ]),
    'customsDeclarationService.listCustomsDeclarations': async () => ({
      total: 1,
      items: [{ id: 'cd-99', declarationNo: 'BG-99', status: 'DECLARED' }],
    }),
    'forexVerificationService.listForexVerifications': async () => ({
      total: 1,
      items: [{ id: 'fx-99', verificationNo: 'HX-99', status: 'VERIFIED' }],
    }),
    'taxRefundService.listTaxRefunds': async () => ({
      total: 0,
      items: [],
    }),
  }, async () => {
    const result = await openAgentService.buildSalesContractFlowDiagnostic({ contractNo: 'EXP2600099' });

    const receivableRecommendation = result.recommendedActions.find((item) => item.code === 'finance.follow-up-receivable');
    assert.ok(receivableRecommendation);
    assert.equal(receivableRecommendation.executionMode, 'confirmable_write');
    assert.equal(receivableRecommendation.actionType, 'AllocatePayment');
    assert.deepEqual(receivableRecommendation.params, {
      paymentId: 'pay-1',
      contractNo: 'EXP2600099',
      amount: 700,
    });
  });
});

test('buildSalesContractFlowDiagnostic: 多个待分配收款同时命中时保持 manual，避免误挂账', async () => {
  await withPatched({
    'prisma.salesContract.findFirst': async () => ({
      id: 'sc-fin-2',
      contractNo: 'EXP2600100',
      status: 'SHIPPED',
      totalAmount: 1200,
      receivedAmount: 200,
      hasTaxRefund: false,
      items: [{ id: 'si-1', quantity: 5 }],
      packingItems: [],
    }),
    'prisma.inventory.findMany': async () => ([]),
    'financeService.listUnallocatedPayments': async () => ([
      { id: 'pay-1', note: 'EXP2600100 首款', amount: 1000, remainingAmount: 1000, customerName: 'SP Food' },
      { id: 'pay-2', note: 'EXP2600100 尾款', amount: 1000, remainingAmount: 1000, customerName: 'SP Food' },
    ]),
    'customsDeclarationService.listCustomsDeclarations': async () => ({
      total: 1,
      items: [{ id: 'cd-100', declarationNo: 'BG-100', status: 'DECLARED' }],
    }),
    'forexVerificationService.listForexVerifications': async () => ({
      total: 1,
      items: [{ id: 'fx-100', verificationNo: 'HX-100', status: 'VERIFIED' }],
    }),
    'taxRefundService.listTaxRefunds': async () => ({
      total: 0,
      items: [],
    }),
  }, async () => {
    const result = await openAgentService.buildSalesContractFlowDiagnostic({ contractNo: 'EXP2600100' });

    const receivableRecommendation = result.recommendedActions.find((item) => item.code === 'finance.follow-up-receivable');
    assert.ok(receivableRecommendation);
    assert.equal(receivableRecommendation.executionMode, 'manual');
    assert.equal(receivableRecommendation.actionType, null);
    assert.equal(receivableRecommendation.params, null);
  });
});

test('buildPurchaseExecutionDiagnostic: 聚合采购、付款、供应商质量风险与入库状态', async () => {
  await withPatched({
    'prisma.purchaseContract.findFirst': async () => ({
      id: 'pc-1',
      contractNo: 'CG2600001',
      status: 'CONFIRMED',
      totalAmount: 800,
      paidAmount: 200,
      supplier: { id: 'sup-1', name: '宏达工厂', hasQualityIssue: true, qualityNote: '上批次有色差' },
      items: [{ id: 'pi-1' }, { id: 'pi-2' }],
    }),
    'prisma.inventory.findMany': async () => ([
      { id: 'inv-1', status: 'PRODUCING', quantity: 5 },
      { id: 'inv-2', status: 'INBOUND', quantity: 10 },
    ]),
  }, async () => {
    const result = await openAgentService.buildPurchaseExecutionDiagnostic({ contractNo: 'CG2600001' });

    assert.equal(result.contractNo, 'CG2600001');
    assert.equal(result.finance.unpaidAmount, 600);
    assert.equal(result.inventory.statusBreakdown.PRODUCING, 1);
    assert.equal(result.supplier.hasQualityIssue, true);
    assert.ok(result.blockers.some((item) => /质量/.test(item)));
    assert.ok(result.nextActions.some((item) => /入库|催/.test(item)));
  });
});

test('buildTradeComplianceReadinessDiagnostic: 聚合报关/核销/退税就绪度与缺口', async () => {
  await withPatched({
    'prisma.salesContract.findFirst': async () => ({
      id: 'sc-2',
      contractNo: 'EXP2600002',
      status: 'SHIPPED',
      totalAmount: 1500,
      receivedAmount: 1200,
      hasTaxRefund: true,
    }),
    'customsDeclarationService.listCustomsDeclarations': async () => ({
      total: 1,
      items: [{ id: 'cd-2', declarationNo: 'BG-2', status: 'RELEASED' }],
    }),
    'forexVerificationService.listForexVerifications': async () => ({
      total: 1,
      items: [{ id: 'fx-2', verificationNo: 'HX-2', status: 'VERIFIED' }],
    }),
    'taxRefundService.listTaxRefunds': async () => ({
      total: 0,
      items: [],
    }),
  }, async () => {
    const result = await openAgentService.buildTradeComplianceReadinessDiagnostic({ contractNo: 'EXP2600002' });

    assert.equal(result.contractNo, 'EXP2600002');
    assert.equal(result.readiness.customsReady, true);
    assert.equal(result.readiness.forexReady, true);
    assert.equal(result.readiness.taxRefundReady, true);
    assert.ok(result.blockers.some((item) => /退税/.test(item)));
    assert.ok(result.nextActions.some((item) => /退税/.test(item)));
    assert.ok(Array.isArray(result.recommendedActions));
    const taxRefundRecommendation = result.recommendedActions.find((item) => item.code === 'trade-compliance.create-tax-refund-record');
    assert.ok(taxRefundRecommendation);
    assert.equal(taxRefundRecommendation.executionMode, 'confirmable_write');
    assert.equal(taxRefundRecommendation.actionType, 'CreateTaxRefundDraft');
    assert.equal(taxRefundRecommendation.params.salesContractId, 'sc-2');
    assert.equal(taxRefundRecommendation.params.customsDeclarationId, 'cd-2');
    assert.equal(taxRefundRecommendation.params.forexVerificationId, 'fx-2');
  });
});

test('materializeRecommendationPendingActions: 只为 confirmable_write 建议创建待确认动作并自动去重', () => {
  const collectedIds = [];
  const pendingActions = openAgentService.materializeRecommendationPendingActions({
    userId: 'user-1',
    collectedIds,
    recommendations: [
      {
        code: 'trade-compliance.create-tax-refund-record',
        title: '补建退税草稿',
        domain: 'trade-compliance',
        priority: 'medium',
        executionMode: 'confirmable_write',
        reason: '退税链路尚未落单，需补退税记录',
        actionType: 'CreateTaxRefundDraft',
        params: {
          salesContractId: 'sc-2',
          customsDeclarationId: 'cd-2',
          forexVerificationId: 'fx-2',
          refundNo: 'TR-TEST-001',
        },
      },
      {
        code: 'trade-compliance.create-tax-refund-record',
        title: '补建退税草稿',
        domain: 'trade-compliance',
        priority: 'medium',
        executionMode: 'confirmable_write',
        reason: '退税链路尚未落单，需补退税记录',
        actionType: 'CreateTaxRefundDraft',
        params: {
          salesContractId: 'sc-2',
          customsDeclarationId: 'cd-2',
          forexVerificationId: 'fx-2',
          refundNo: 'TR-TEST-001',
        },
      },
      {
        code: 'finance.follow-up-receivable',
        title: '跟进合同回款',
        domain: 'finance',
        priority: 'high',
        executionMode: 'manual',
        reason: '合同尚有 700 未收款',
      },
    ],
  });

  assert.equal(pendingActions.length, 1);
  assert.equal(collectedIds.length, 1);
  assert.equal(pendingActions[0].actionType, 'CreateTaxRefundDraft');
  assert.match(pendingActions[0].description, /补建退税草稿/);
  assert.deepEqual(pendingActions[0].params, {
    salesContractId: 'sc-2',
    customsDeclarationId: 'cd-2',
    forexVerificationId: 'fx-2',
    refundNo: 'TR-TEST-001',
  });
});

test('summarizeToolTrace: 汇总读写工具调用次数、失败数与耗时', () => {
  const summary = openAgentService.summarizeToolTrace([
    { name: 'SearchEntities', domain: 'search', access: 'read', status: 'success', durationMs: 12 },
    { name: 'GetInventoryOverview', domain: 'inventory', access: 'read', status: 'success', durationMs: 18 },
    { name: 'UpdateSystemConfig', domain: 'system', access: 'write', status: 'failed', durationMs: 7, error: 'boom' },
  ]);

  assert.equal(summary.totalCalls, 3);
  assert.equal(summary.readCalls, 2);
  assert.equal(summary.writeCalls, 1);
  assert.equal(summary.successCount, 2);
  assert.equal(summary.failureCount, 1);
  assert.equal(summary.totalDurationMs, 37);
  assert.equal(summary.items[2].error, 'boom');
});

test('inferRoutePlan: 通用主 Agent 会按消息内容选择 focused/cross-domain 路由', () => {
  const financePlan = openAgentService.inferRoutePlan({
    agentType: 'unified',
    message: '帮我看下客户欠款和最近收款情况',
  });
  assert.equal(financePlan.mode, 'focused');
  assert.ok(financePlan.preferredDomains.includes('finance'));
  assert.ok(financePlan.selectedDomains.includes('search'));

  const crossDomainPlan = openAgentService.inferRoutePlan({
    agentType: 'unified',
    message: '结合采购、库存和退税链路，帮我判断这批货现在的整体状态',
  });
  assert.equal(crossDomainPlan.mode, 'cross-domain');
  assert.ok(crossDomainPlan.preferredDomains.includes('procurement'));
  assert.ok(crossDomainPlan.preferredDomains.includes('inventory'));
  assert.ok(crossDomainPlan.preferredDomains.includes('trade-compliance'));
});

test('inferRoutePlan: legacy agentType 仍可映射到内部兼容路由', () => {
  const legacyPlan = openAgentService.inferRoutePlan({
    agentType: 'export',
    message: '查一下最近出运情况',
  });

  assert.equal(legacyPlan.mode, 'legacy-explicit');
  assert.deepEqual(legacyPlan.preferredDomains, ['sales-export']);
  assert.ok(legacyPlan.selectedDomains.includes('system'));
});

test('buildSpecialistFrame: 会为跨域或聚焦场景生成内部 specialist 提示片段', () => {
  const frame = openAgentService.buildSpecialistFrame({
    mode: 'cross-domain',
    preferredDomains: ['procurement', 'inventory', 'trade-compliance'],
    selectedDomains: ['search', 'procurement', 'inventory', 'trade-compliance', 'system'],
  });

  assert.match(frame, /内部路由/);
  assert.match(frame, /procurement/);
  assert.match(frame, /inventory/);
  assert.match(frame, /trade-compliance/);
});

test('getAgentPreset: 非法 agent 类型抛出错误', () => {
  assert.throws(
    () => openAgentService.getAgentPreset('unknown'),
    /不支持的 Agent 类型/,
  );
});

test('runAgentPrompt: 未配置当前系统 KIMI_API_KEY 时返回 503', async () => {
  const originalKimiApiKey = config.kimi.apiKey;
  config.kimi.apiKey = '';

  try {
    await assert.rejects(
      () => openAgentService.runAgentPrompt({
        userId: 'user-1',
        agentType: 'finance',
        message: '当前客户还欠多少钱？',
      }),
      (error) => error.statusCode === 503 && /KIMI_API_KEY/.test(error.message),
    );
  } finally {
    config.kimi.apiKey = originalKimiApiKey;
  }
});

test('resolveSdkSessionConfig: 新会话持久化，旧会话走 resume', () => {
  const fresh = openAgentService.resolveSdkSessionConfig(null);
  assert.equal(fresh.persistSession, true);
  assert.equal(typeof fresh.sessionId, 'string');
  assert.equal(fresh.resume, undefined);

  const resumed = openAgentService.resolveSdkSessionConfig('agent_finance_demo');
  assert.equal(resumed.persistSession, true);
  assert.equal(resumed.sessionId, 'agent_finance_demo');
  assert.equal(resumed.resume, 'agent_finance_demo');
});

test('buildAgentRunMetadata: 会持久化基础 governanceReplayProfile 快照', () => {
  const metadata = openAgentService.buildAgentRunMetadata({
    agentType: 'unified',
    model: 'kimi-k2',
    routePlan: { mode: 'cross-domain', selectedDomains: ['finance', 'trade-compliance'] },
    selectedToolNames: ['SearchEntities'],
    toolTraceSummary: { totalCalls: 1, failureCount: 0, totalDurationMs: 12 },
    actionRecommendations: [
      {
        code: 'trade-compliance.prepare-tax-refund',
        title: '补建退税草稿',
        domain: 'trade-compliance',
        priority: 'high',
        executionMode: 'manual',
        reason: '退税前置条件已满足',
      },
    ],
    pendingActionSummary: [
      {
        actionId: 'pa-1',
        actionType: 'CreateTaxRefundDraft',
        description: '补建退税草稿',
        status: 'pending',
      },
    ],
  });

  assert.deepEqual(metadata.governanceReplayProfile, {
    available: true,
    source: 'session-metadata',
    level: 'tools',
    evidence: {
      operationLogEvents: 0,
      actionLifecycleCount: 0,
    },
    summary: {
      tools: true,
      recommendations: true,
      actions: true,
    },
    counts: {
      tools: 1,
      recommendations: 1,
      actions: 1,
    },
  });
});

test('buildReplaySnapshotLogValue: 会生成专用 replay snapshot 日志载荷', () => {
  const payload = openAgentService.buildReplaySnapshotLogValue({
    governanceReplayProfile: {
      available: true,
      source: 'replay-snapshot-log',
      level: 'tools',
      evidence: {
        operationLogEvents: 0,
        actionLifecycleCount: 0,
      },
      summary: {
        tools: true,
        recommendations: true,
        actions: true,
      },
      counts: {
        tools: 1,
        recommendations: 1,
        actions: 1,
      },
    },
    routePlan: { mode: 'cross-domain', selectedDomains: ['finance', 'inventory'] },
    selectedToolNames: ['SearchEntities'],
  });

  assert.deepEqual(payload, {
    source: 'open-agent-sdk',
    replaySource: 'dedicated-replay-snapshot',
    governanceReplayProfile: {
      available: true,
      source: 'replay-snapshot-log',
      level: 'tools',
      evidence: {
        operationLogEvents: 0,
        actionLifecycleCount: 0,
      },
      summary: {
        tools: true,
        recommendations: true,
        actions: true,
      },
      counts: {
        tools: 1,
        recommendations: 1,
        actions: 1,
      },
    },
    routePlan: { mode: 'cross-domain', selectedDomains: ['finance', 'inventory'] },
    selectedToolNames: ['SearchEntities'],
  });
});
