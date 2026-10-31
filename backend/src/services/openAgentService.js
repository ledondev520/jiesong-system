/**
 * Input: 已发布的 open-agent-sdk, Anthropic 兼容 API, 业务服务层
 * Output: AI 只读查询（含真实拼柜来源）、内部草稿直接执行、业务事实一次确认与可回放执行记录，上游失败不记成功
 * Pos: 后端 Agent Runtime 核心，衔接 LLM 与业务数据
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const config = require('../config');
const { createError } = require('../middleware/errorHandler');
const financeService = require('./financeService');
const salesService = require('./salesService');
const aiService = require('./aiService');
const customsDeclarationService = require('./customsDeclarationService');
const taxRefundService = require('./taxRefundService');
const forexVerificationService = require('./forexVerificationService');
const { buildGovernanceReplayProfile } = require('./governanceReplayService');
const { buildReplaySummaryRecord, upsertReplaySummary } = require('./agentReplaySummaryService');
const { getOpenAgentRuntimeToken } = require('../utils/openAgentRuntimeAuth');
const { ROLES } = require('../config/constants');
const { outstandingOf } = require('./payablesService');
const { createPurchaseWithItems, updatePurchase } = require('../agent/commands/purchase');
const { createSupplier, updateSupplier } = require('../agent/commands/supplier');
const { validateInventoryTransition } = require('../utils/inventoryStateMachine');
const pendingStore = require('./agentPendingActionService');

const SUPPORTED_AGENT_TYPES = ['finance', 'export', 'executive', 'unified'];
const PRIMARY_AGENT_TYPE = 'unified';
const LEGACY_AGENT_TYPES = ['finance', 'export', 'executive'];
const TOOL_TRACE_ITEMS_LIMIT = 40;
const ACTION_RECOMMENDATIONS_LIMIT = 20;

// ── Pending Action Store：SQLite（agentPendingActionService），多进程共享 ──

const WRITE_CONFIRMATION_INSTRUCTION = [
  '',
  '【写操作规则】',
  '你拥有写工具（如 AllocatePayment、UpdateSystemConfig 等）。',
  '用户明确要求建内部草稿时，CreatePurchaseContract、CreateCustomsDeclarationDraft、CreateForexVerificationDraft、CreateTaxRefundDraft 会直接执行；成功后说明已生成草稿，不再要求重复确认。',
  '数量、单价和关联对象必须来自用户提供或系统事实，缺项不能猜；草稿不代表签约、付款、实物出入库或税局受理。',
  '其他写工具返回待确认操作时，说明操作内容并提示一次确认后执行；收到成功结果前不要宣称已完成。',
  '只读诊断中的建议不构成执行请求；不要自行创建草稿或重复调用写工具。',
].join('\n');

const UNIFIED_SYSTEM_PROMPT = [
  '你是捷淞物流系统的通用主 Agent，也是这套系统的统一业务大脑。',
  '你必须把系统工具当作自己的主要感知器官，通过它们读取真实数据、建立全局认知，再回答问题或规划动作。',
  '你能覆盖以下真实业务域：',
  '',
  '1. **财务**：应收/应付、客户欠款、收款池、趋势分析、收款分配',
  '2. **销售/出口**：合同状态、装箱明细、门店、第三方拼柜来源',
  '3. **采购/供应商**：采购合同、供应商、统一搜索',
  '4. **库存与履约**：库存快照、出入库、履约相关线索',
  '5. **税退链路**：报关、收汇核销、退税',
  '6. **经营与系统**：导入记录、事件台账、系统配置',
  '',
  '回答原则：',
  '- 优先使用工具获取数据，**不要猜测或编造**',
  '- 如果问题跨域，不要让用户重新分科，直接自己组织多工具查询',
  '- 如果问题不够具体，优先先检索、再追问，而不是先假设',
  '- 金额、日期、合同号、状态等关键字段要明确',
  '- 涉及经营判断时，输出现状、异常点、建议动作',
  '- 只有在工具无法覆盖时，才允许用常识做低风险补充，并明确说明这是推断',
].join('\n') + WRITE_CONFIRMATION_INSTRUCTION;

const AGENT_PRESETS = {
  unified: {
    id: 'unified',
    label: 'JIESONG 助手',
    isPublic: true,
    isLegacy: false,
    prompt: UNIFIED_SYSTEM_PROMPT,
  },
  finance: {
    id: 'finance',
    label: '财务Agent',
    isPublic: false,
    isLegacy: true,
    prompt: [
      '你是捷淞物流系统中的财务内部模式。',
      '你的职责是基于系统内真实财务数据回答问题，优先使用工具，不要猜测。',
      '重点关注客户欠款、应收结构、待分配收款、趋势和风险。',
      '回答尽量直接，金额和日期要明确。',
    ].join('\n') + WRITE_CONFIRMATION_INSTRUCTION,
  },
  export: {
    id: 'export',
    label: '出口单证Agent',
    isPublic: false,
    isLegacy: true,
    prompt: [
      '你是捷淞物流系统中的出口单证内部模式。',
      '你的职责是基于出口合同、装箱、导入记录和近期业务状态，回答出运、单证、货柜相关问题。',
      '优先使用工具获取合同与导入信息，不要编造单证状态。',
      '回答时优先突出合同号、门店、状态、第三方拼柜来源和下一步动作。',
    ].join('\n') + WRITE_CONFIRMATION_INSTRUCTION,
  },
  executive: {
    id: 'executive',
    label: '老板驾驶舱Agent',
    isPublic: false,
    isLegacy: true,
    prompt: [
      '你是捷淞物流系统中的老板驾驶舱内部模式。',
      '你的职责是把财务、出口、导入、系统操作汇总成经营视角结论。',
      '优先用工具拿到真实数据，再给老板视角的总结、风险、优先级。',
      '不要输出冗长过程，重点是现状、问题、建议。',
    ].join('\n') + WRITE_CONFIRMATION_INSTRUCTION,
  },
};

const normalizeAgentType = (value) => String(value || '').trim().toLowerCase();

const getAgentPreset = (agentType) => {
  const normalized = normalizeAgentType(agentType);
  const preset = AGENT_PRESETS[normalized];
  if (!preset) {
    throw createError(`不支持的 Agent 类型: ${agentType}`, 400);
  }
  return preset;
};

const buildSpecialistFrame = (routePlan) => {
  if (!routePlan) return '';
  const domains = Array.isArray(routePlan.selectedDomains) ? routePlan.selectedDomains.join(', ') : 'all';
  const preferred = Array.isArray(routePlan.preferredDomains) && routePlan.preferredDomains.length
    ? routePlan.preferredDomains.join(', ')
    : 'none';

  return [
    '',
    '【内部路由】',
    `当前路由模式: ${routePlan.mode}`,
    `优先分析域: ${preferred}`,
    `本轮启用工具域: ${domains}`,
    '你可以把这些域当作内部 specialist 视角，但对用户仍然保持单一统一 Agent 口径。',
    '如果工具结果不足，再扩大搜索；不要因为有内部路由就把答案写成分科拼接稿。',
  ].join('\n');
};

const DOMAIN_ROUTING_RULES = {
  finance: ['财务', '应收', '应付', '回款', '收款', '付款', '欠款', '利润', '汇率', '账款'],
  'sales-export': ['销售', '出口', '合同', '出运', '发货', '装箱', '拼柜', '门店', 'exp'],
  procurement: ['采购', '供应商', '工厂', '下单', 'cg', '采购单'],
  inventory: ['库存', '入库', '出库', '现货', '缺货', '仓库'],
  'trade-compliance': ['报关', '退税', '核销', '外汇', '收汇', '报关单', '退税单'],
  ops: ['导入', '异常', '告警', '巡检', '通知', '任务'],
  system: ['系统', '配置', '参数', '日志', '事件', '权限', '设置'],
};

const DOMAIN_METADATA = {
  search: {
    label: '统一检索',
    description: '用来建立问题上下文，先定位合同、供应商、商品与相关主数据',
  },
  finance: {
    label: '财务',
    description: '围绕应收、应付、回款、收款池与财务风险做事实查询和判断',
  },
  'sales-export': {
    label: '销售/出口',
    description: '围绕出口合同、出运状态、门店与履约链路做查询和诊断',
  },
  procurement: {
    label: '采购',
    description: '围绕采购合同、供应商、付款与到货执行做查询和诊断',
  },
  inventory: {
    label: '库存',
    description: '围绕库存状态、入出库和缺货风险建立履约视角',
  },
  'trade-compliance': {
    label: '税退链路',
    description: '围绕报关、收汇核销、退税三条链路判断就绪度和缺口',
  },
  events: {
    label: '事件台账',
    description: '追踪系统事件、AI/Agent 运行和近期异常',
  },
  ops: {
    label: '运营巡检',
    description: '观察导入、异常和系统运行状态',
  },
  executive: {
    label: '经营视图',
    description: '压缩经营摘要，适合管理视角快速理解全局',
  },
  system: {
    label: '系统配置',
    description: '围绕配置、日志与系统参数进行读取或变更',
  },
};

const normalizeMessageForRouting = (message) => String(message || '').trim().toLowerCase();

const inferRoutePlan = ({ agentType, message } = {}) => {
  const normalizedAgentType = normalizeAgentType(agentType || PRIMARY_AGENT_TYPE);
  const text = normalizeMessageForRouting(message);

  if (LEGACY_AGENT_TYPES.includes(normalizedAgentType)) {
    const mappedDomain = normalizedAgentType === 'export' ? 'sales-export' : normalizedAgentType;
    return {
      mode: 'legacy-explicit',
      requestedAgentType: normalizedAgentType,
      preferredDomains: [mappedDomain],
      selectedDomains: ['search', mappedDomain, 'system'],
    };
  }

  const scoredDomains = Object.entries(DOMAIN_ROUTING_RULES)
    .map(([domain, keywords]) => ({
      domain,
      score: keywords.reduce((sum, keyword) => sum + (text.includes(keyword.toLowerCase()) ? 1 : 0), 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const preferredDomains = scoredDomains.map((item) => item.domain);
  if (!preferredDomains.length) {
    return {
      mode: 'broad',
      requestedAgentType: PRIMARY_AGENT_TYPE,
      preferredDomains: [],
      selectedDomains: ['all'],
    };
  }

  const selectedDomains = Array.from(new Set([
    'search',
    ...preferredDomains.slice(0, 3),
    'system',
  ]));

  const topScore = scoredDomains[0]?.score || 0;
  const secondScore = scoredDomains[1]?.score || 0;
  const isFocused = preferredDomains.length === 1 || topScore >= secondScore + 2;

  return {
    mode: isFocused ? 'focused' : 'cross-domain',
    requestedAgentType: PRIMARY_AGENT_TYPE,
    preferredDomains: isFocused ? [preferredDomains[0]] : preferredDomains,
    selectedDomains,
  };
};

const loadSdk = async () => {
  // 使用锁定的已发布构建，干净 checkout 不依赖开发机 .tmp 目录。
  const sdk = await import('@codeany/open-agent-sdk');
  // 不让 Agent 外层重试与 Anthropic transport 重试叠加上游请求。
  sdk.DEFAULT_RETRY_CONFIG.maxRetries = 0;
  return sdk;
};

const ensureRuntimeConfig = async () => {
  if (!await aiService.getOpenAIClient()) {
    throw createError('请先配置当前系统的 AI API Key 后再启用 Agent Runtime', 503);
  }
  const { defaultModel } = await aiService.getConfiguredModels();
  return {
    apiKey: getOpenAgentRuntimeToken(),
    baseURL: `http://127.0.0.1:${config.port}/api/v1/ai/anthropic`,
    model: defaultModel,
  };
};

const toJson = (value) => JSON.stringify(value, null, 2);

const safeParseJson = (value) => {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalizeActionRecommendation = (item, fallback = {}) => {
  if (!item || typeof item !== 'object') return null;
  const priority = ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium';
  const executionMode = item.executionMode === 'confirmable_write' ? 'confirmable_write' : 'manual';
  const normalized = {
    code: String(item.code || fallback.code || '').trim(),
    title: String(item.title || fallback.title || '').trim(),
    domain: String(item.domain || fallback.domain || 'ops').trim(),
    priority,
    executionMode,
    reason: String(item.reason || fallback.reason || '').trim(),
    actionType: item.actionType ? String(item.actionType).trim() : null,
    params: item.params && typeof item.params === 'object' && !Array.isArray(item.params) ? item.params : null,
    sourceTool: String(item.sourceTool || fallback.sourceTool || '').trim() || null,
  };
  if (!normalized.code || !normalized.title) return null;
  return normalized;
};

const summarizeActionRecommendations = (items = []) => {
  const deduped = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const normalized = normalizeActionRecommendation(item);
    if (!normalized) return;
    const key = [normalized.code, normalized.actionType || '', normalized.reason || ''].join('::');
    if (!deduped.has(key)) {
      deduped.set(key, normalized);
    }
  });
  return Array.from(deduped.values()).slice(0, ACTION_RECOMMENDATIONS_LIMIT);
};

const buildActionRecommendation = (item) => normalizeActionRecommendation(item);

const buildDraftDocumentNo = (prefix, contractNo) => {
  const normalizedContractNo = String(contractNo || 'AGENT')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(-16) || 'AGENT';
  const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  return `${prefix}-${normalizedContractNo}-${timestamp}`;
};

const buildRecommendationPendingDescription = (recommendation) => {
  const title = String(recommendation?.title || '').trim();
  const reason = String(recommendation?.reason || '').trim();
  if (!title) return reason || '执行诊断建议';
  if (!reason) return title;
  return `${title}：${reason}`;
};

const isSamePendingAction = (action, recommendation) => action
  && action.actionType === recommendation.actionType
  && JSON.stringify(action.params || {}) === JSON.stringify(recommendation.params || {});

const materializeRecommendationPendingActions = async ({ userId, recommendations, collectedIds = [] }) => {
  if (!userId || !Array.isArray(recommendations) || !Array.isArray(collectedIds)) return [];

  const created = [];
  for (const recommendation of summarizeActionRecommendations(recommendations)) {
    if (recommendation.executionMode !== 'confirmable_write' || !recommendation.actionType || !recommendation.params) {
      continue;
    }

    let exists = false;
    for (const id of collectedIds) {
      if (isSamePendingAction(await pendingStore.getPendingRecord(id), recommendation)) { exists = true; break; }
    }
    if (exists) continue;

    await createPendingAction(
      userId,
      recommendation.actionType,
      recommendation.params,
      buildRecommendationPendingDescription(recommendation),
      collectedIds,
    );

    const actionId = collectedIds[collectedIds.length - 1];
    const action = await pendingStore.getPendingRecord(actionId);
    if (!action) continue;
    created.push({
      actionId,
      actionType: action.actionType,
      description: action.description,
      params: action.params,
    });
  }

  return created;
};

const summarizeToolTrace = (traces = []) => {
  const normalized = Array.isArray(traces) ? traces : [];
  return {
    totalCalls: normalized.length,
    readCalls: normalized.filter((item) => item.access === 'read').length,
    writeCalls: normalized.filter((item) => item.access === 'write').length,
    successCount: normalized.filter((item) => item.status === 'success').length,
    failureCount: normalized.filter((item) => item.status === 'failed').length,
    totalDurationMs: normalized.reduce((sum, item) => sum + Number(item.durationMs || 0), 0),
    items: normalized.slice(0, TOOL_TRACE_ITEMS_LIMIT).map((item) => ({
      name: item.name,
      domain: item.domain,
      access: item.access,
      status: item.status,
      durationMs: item.durationMs,
      error: item.error || null,
    })),
  };
};

const buildStatusBreakdown = (items = []) => items.reduce((acc, item) => {
  const key = String(item?.status || 'UNKNOWN');
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

const buildQuantityBreakdown = (items = []) => items.reduce((acc, item) => {
  const key = String(item?.status || 'UNKNOWN');
  acc[key] = (acc[key] || 0) + Number(item?.quantity || 0);
  return acc;
}, {});

const uniqueMessages = (items = []) => Array.from(new Set((Array.isArray(items) ? items : []).filter(Boolean)));

const uniqueActionRecommendations = (items = []) => summarizeActionRecommendations(items.filter(Boolean));

const RECEIVABLE_CONTRACT_REF_REGEX = /EXP\d{5,}/g;
const ALLOCATION_AMOUNT_TOLERANCE = 0.01;

const extractContractRefsFromNote = (note) => {
  if (typeof note !== 'string') return [];
  return Array.from(new Set(note.toUpperCase().match(RECEIVABLE_CONTRACT_REF_REGEX) || []));
};

const findHighConfidenceAllocationCandidate = async ({ contractNo, outstandingAmount }) => {
  const normalizedContractNo = String(contractNo || '').trim().toUpperCase();
  const targetAmount = Number(outstandingAmount || 0);
  if (!normalizedContractNo || !(targetAmount > 0)) return null;

  const pool = await financeService.listUnallocatedPayments();
  const candidates = (Array.isArray(pool) ? pool : []).filter((payment) => {
    const refs = extractContractRefsFromNote(payment?.note);
    if (refs.length !== 1 || refs[0] !== normalizedContractNo) return false;
    const remainingAmount = Number(payment?.remainingAmount ?? payment?.amount ?? 0);
    return Math.abs(remainingAmount - targetAmount) <= ALLOCATION_AMOUNT_TOLERANCE;
  });

  return candidates.length === 1 ? candidates[0] : null;
};

const buildSalesContractFlowDiagnostic = async ({ contractNo }) => {
  const keyword = String(contractNo || '').trim();
  const contract = await prisma.salesContract.findFirst({
    where: { contractNo: keyword },
    include: {
      items: {
        select: { id: true, quantity: true, sellingPrice: true },
      },
      packingItems: {
        select: { id: true, boxes: true, volume: true },
      },
    },
  });
  if (!contract) return { error: `出口合同 ${keyword} 不存在` };

  const [inventories, customs, forex, taxRefunds] = await Promise.all([
    prisma.inventory.findMany({
      where: { salesContractId: contract.id },
      select: { id: true, status: true, quantity: true, inboundAt: true, outboundAt: true },
    }),
    customsDeclarationService.listCustomsDeclarations({ page: 1, pageSize: 10, salesContractId: contract.id }),
    forexVerificationService.listForexVerifications({ page: 1, pageSize: 10, salesContractId: contract.id }),
    taxRefundService.listTaxRefunds({ page: 1, pageSize: 10, salesContractId: contract.id }),
  ]);

  const outstandingAmount = Math.max(Number(contract.totalAmount || 0) - Number(contract.receivedAmount || 0), 0);
  const allocationCandidate = outstandingAmount > 0
    ? await findHighConfidenceAllocationCandidate({ contractNo: contract.contractNo, outstandingAmount })
    : null;
  const inventoryStatusBreakdown = buildStatusBreakdown(inventories);
  const inventoryQuantityBreakdown = buildQuantityBreakdown(inventories);
  const blockers = uniqueMessages([
    outstandingAmount > 0 ? `合同尚有 ${outstandingAmount} 未收款` : null,
    !customs.total && ['SHIPPED', 'ARRIVED', 'COMPLETED'].includes(contract.status) ? '合同已进入出运阶段但尚无报关单' : null,
    customs.total > 0 && !forex.total ? '已有报关记录但尚未形成收汇核销记录' : null,
    Boolean(contract.hasTaxRefund) && customs.total > 0 && !taxRefunds.total ? '退税链路尚未落单，需补退税记录' : null,
    Object.keys(inventoryStatusBreakdown).some((status) => status !== 'OUTBOUND')
      ? '仍有库存未完全出库，需核对履约与出运节奏'
      : null,
  ]);
  const nextActions = uniqueMessages([
    outstandingAmount > 0 ? '继续核对回款与应收差额，确认收款节奏' : null,
    !customs.total ? '先补报关单或确认报关草稿生成情况' : null,
    customs.total > 0 && !forex.total ? '补齐收汇核销资料，推进核销登记' : null,
    Boolean(contract.hasTaxRefund) && customs.total > 0 && !taxRefunds.total ? '整理退税资料并发起退税单' : null,
    Object.keys(inventoryStatusBreakdown).some((status) => status !== 'OUTBOUND')
      ? '核对未出库库存与装箱/发货状态，确认是否存在履约卡点'
      : null,
  ]);
  const latestCustoms = (customs.items || [])[0] || null;
  const latestForex = (forex.items || [])[0] || null;
  const totalQuantity = Number((contract.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0));
  const canCreateForexDraft = Number(contract.receivedAmount || 0) > 0 && Boolean(latestCustoms?.id);
  const canCreateTaxRefundDraft = Boolean(contract.hasTaxRefund) && Boolean(latestCustoms?.id) && Boolean(latestForex?.id);
  const recommendedActions = uniqueActionRecommendations([
    outstandingAmount > 0 ? buildActionRecommendation({
      code: 'finance.follow-up-receivable',
      title: allocationCandidate ? '确认收款挂账' : '跟进合同回款',
      domain: 'finance',
      priority: 'high',
      executionMode: allocationCandidate ? 'confirmable_write' : 'manual',
      reason: `合同尚有 ${outstandingAmount} 未收款`,
      actionType: allocationCandidate ? 'AllocatePayment' : null,
      params: allocationCandidate ? {
        paymentId: allocationCandidate.id,
        contractNo: contract.contractNo,
        amount: Number(allocationCandidate.remainingAmount ?? allocationCandidate.amount ?? outstandingAmount),
      } : null,
      sourceTool: 'DiagnoseSalesContractFlow',
    }) : null,
    !customs.total ? buildActionRecommendation({
      code: 'trade-compliance.prepare-customs-declaration',
      title: '生成报关草稿',
      domain: 'trade-compliance',
      priority: ['SHIPPED', 'ARRIVED', 'COMPLETED'].includes(contract.status) ? 'high' : 'medium',
      executionMode: 'confirmable_write',
      reason: '合同已进入出运阶段但尚无报关单',
      actionType: 'CreateCustomsDeclarationDraft',
      params: {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        totalAmount: Number(contract.totalAmount || 0),
        totalQuantity,
        currency: 'USD',
        note: 'Agent 根据销售合同流程诊断生成报关草稿',
      },
      sourceTool: 'DiagnoseSalesContractFlow',
    }) : null,
    customs.total > 0 && !forex.total ? buildActionRecommendation({
      code: 'trade-compliance.prepare-forex-verification',
      title: '推进收汇核销登记',
      domain: 'trade-compliance',
      priority: 'high',
      executionMode: canCreateForexDraft ? 'confirmable_write' : 'manual',
      reason: '已有报关记录但尚未形成收汇核销记录',
      actionType: canCreateForexDraft ? 'CreateForexVerificationDraft' : null,
      params: canCreateForexDraft ? {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        customsDeclarationId: latestCustoms.id,
        receivedAmount: Number(contract.receivedAmount || 0),
        currency: 'USD',
        note: 'Agent 根据销售合同流程诊断生成收汇核销草稿',
      } : null,
      sourceTool: 'DiagnoseSalesContractFlow',
    }) : null,
    Boolean(contract.hasTaxRefund) && customs.total > 0 && !taxRefunds.total ? buildActionRecommendation({
      code: 'trade-compliance.create-tax-refund-record',
      title: canCreateTaxRefundDraft ? '补建退税草稿' : '补建退税记录',
      domain: 'trade-compliance',
      priority: 'medium',
      executionMode: canCreateTaxRefundDraft ? 'confirmable_write' : 'manual',
      reason: '退税链路尚未落单，需补退税记录',
      actionType: canCreateTaxRefundDraft ? 'CreateTaxRefundDraft' : null,
      params: canCreateTaxRefundDraft ? {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        customsDeclarationId: latestCustoms.id,
        forexVerificationId: latestForex.id,
        note: 'Agent 根据销售合同流程诊断生成退税草稿',
      } : null,
      sourceTool: 'DiagnoseSalesContractFlow',
    }) : null,
    Object.keys(inventoryStatusBreakdown).some((status) => status !== 'OUTBOUND') ? buildActionRecommendation({
      code: 'inventory.verify-fulfillment-stock',
      title: '核对未出库库存',
      domain: 'inventory',
      priority: 'medium',
      executionMode: 'manual',
      reason: '仍有库存未完全出库，需核对履约与出运节奏',
      sourceTool: 'DiagnoseSalesContractFlow',
    }) : null,
  ]);

  return {
    contractId: contract.id,
    contractNo: contract.contractNo,
    sales: {
      status: contract.status,
      totalAmount: Number(contract.totalAmount || 0),
      receivedAmount: Number(contract.receivedAmount || 0),
      itemCount: contract.items?.length || 0,
      packingItemCount: contract.packingItems?.length || 0,
    },
    finance: {
      outstandingAmount,
      collectionProgress: contract.totalAmount ? Number((Number(contract.receivedAmount || 0) / Number(contract.totalAmount || 1)).toFixed(4)) : 0,
    },
    inventory: {
      recordCount: inventories.length,
      statusBreakdown: inventoryStatusBreakdown,
      quantityBreakdown: inventoryQuantityBreakdown,
    },
    tradeCompliance: {
      customs: {
        total: customs.total || 0,
        latestStatuses: (customs.items || []).slice(0, 3).map((item) => item.status),
      },
      forex: {
        total: forex.total || 0,
        latestStatuses: (forex.items || []).slice(0, 3).map((item) => item.status),
      },
      taxRefund: {
        total: taxRefunds.total || 0,
        latestStatuses: (taxRefunds.items || []).slice(0, 3).map((item) => item.status),
      },
    },
    blockers,
    nextActions,
    recommendedActions,
  };
};

const buildPurchaseExecutionDiagnostic = async ({ contractNo }) => {
  const keyword = String(contractNo || '').trim();
  const contract = await prisma.purchaseContract.findFirst({
    where: { contractNo: keyword },
    include: {
      supplier: {
        select: { id: true, name: true, shortName: true, hasQualityIssue: true, qualityNote: true },
      },
      items: {
        select: { id: true, quantity: true, totalPrice: true },
      },
    },
  });
  if (!contract) return { error: `采购合同 ${keyword} 不存在` };

  const inventories = await prisma.inventory.findMany({
    where: {
      purchaseItem: {
        purchaseContractId: contract.id,
      },
    },
    select: { id: true, status: true, quantity: true, inboundAt: true },
  });

  // 与应付列表同口径：草稿/已取消合同没有应付余额
  const unpaidAmount = outstandingOf(contract);
  const inventoryStatusBreakdown = buildStatusBreakdown(inventories);
  const blockers = uniqueMessages([
    unpaidAmount > 0 ? `采购合同尚有 ${unpaidAmount} 未付款` : null,
    contract.supplier?.hasQualityIssue ? `供应商存在质量风险: ${contract.supplier.qualityNote || contract.supplier.name}` : null,
    Object.keys(inventoryStatusBreakdown).some((status) => !['INBOUND', 'AVAILABLE'].includes(status))
      ? '仍有采购对应库存未完成入库'
      : null,
  ]);
  const nextActions = uniqueMessages([
    unpaidAmount > 0 ? '核对付款计划与账期，确认是否需要催款或补付款' : null,
    contract.supplier?.hasQualityIssue ? '复核供应商质量问题并确认本批次验收策略' : null,
    Object.keys(inventoryStatusBreakdown).some((status) => !['INBOUND', 'AVAILABLE'].includes(status))
      ? '跟进入库和生产状态，避免采购到货脱节'
      : null,
  ]);
  const recommendedActions = uniqueActionRecommendations([
    unpaidAmount > 0 ? buildActionRecommendation({
      code: 'finance.align-purchase-payment-plan',
      title: '核对采购付款计划',
      domain: 'finance',
      priority: 'high',
      executionMode: 'manual',
      reason: `采购合同尚有 ${unpaidAmount} 未付款`,
      sourceTool: 'DiagnosePurchaseExecution',
    }) : null,
    contract.supplier?.hasQualityIssue ? buildActionRecommendation({
      code: 'procurement.review-supplier-quality-risk',
      title: '复核供应商质量风险',
      domain: 'procurement',
      priority: 'high',
      executionMode: 'manual',
      reason: `供应商存在质量风险: ${contract.supplier.qualityNote || contract.supplier.name}`,
      sourceTool: 'DiagnosePurchaseExecution',
    }) : null,
    Object.keys(inventoryStatusBreakdown).some((status) => !['INBOUND', 'AVAILABLE'].includes(status)) ? buildActionRecommendation({
      code: 'inventory.follow-up-inbound-progress',
      title: '跟进入库与生产进度',
      domain: 'inventory',
      priority: 'medium',
      executionMode: 'manual',
      reason: '仍有采购对应库存未完成入库',
      sourceTool: 'DiagnosePurchaseExecution',
    }) : null,
  ]);

  return {
    contractId: contract.id,
    contractNo: contract.contractNo,
    procurement: {
      status: contract.status,
      totalAmount: Number(contract.totalAmount || 0),
      paidAmount: Number(contract.paidAmount || 0),
      itemCount: contract.items?.length || 0,
    },
    finance: {
      unpaidAmount,
      paymentProgress: contract.totalAmount ? Number((Number(contract.paidAmount || 0) / Number(contract.totalAmount || 1)).toFixed(4)) : 0,
    },
    supplier: contract.supplier || null,
    inventory: {
      recordCount: inventories.length,
      statusBreakdown: inventoryStatusBreakdown,
      quantityBreakdown: buildQuantityBreakdown(inventories),
    },
    blockers,
    nextActions,
    recommendedActions,
  };
};

const buildTradeComplianceReadinessDiagnostic = async ({ contractNo }) => {
  const keyword = String(contractNo || '').trim();
  const contract = await prisma.salesContract.findFirst({
    where: { contractNo: keyword },
    select: {
      id: true,
      contractNo: true,
      status: true,
      totalAmount: true,
      receivedAmount: true,
      hasTaxRefund: true,
    },
  });
  if (!contract) return { error: `出口合同 ${keyword} 不存在` };

  const [customs, forex, taxRefunds] = await Promise.all([
    customsDeclarationService.listCustomsDeclarations({ page: 1, pageSize: 10, salesContractId: contract.id }),
    forexVerificationService.listForexVerifications({ page: 1, pageSize: 10, salesContractId: contract.id }),
    taxRefundService.listTaxRefunds({ page: 1, pageSize: 10, salesContractId: contract.id }),
  ]);

  const customsReady = Number(customs.total || 0) > 0;
  const forexReady = customsReady && Number(forex.total || 0) > 0;
  const taxRefundReady = Boolean(contract.hasTaxRefund) && customsReady && forexReady;
  const blockers = uniqueMessages([
    !customsReady ? '缺少报关单，税退链路尚未起步' : null,
    customsReady && !forexReady ? '已有报关记录，但尚未完成收汇核销' : null,
    taxRefundReady && !taxRefunds.total ? '已具备退税前置条件，但尚未创建退税记录' : null,
  ]);
  const nextActions = uniqueMessages([
    !customsReady ? '先补报关单或生成报关草稿' : null,
    customsReady && !forexReady ? '推进收汇核销资料准备与录入' : null,
    taxRefundReady && !taxRefunds.total ? '补建退税单并核对关联号、发票号与税率' : null,
  ]);
  const latestCustoms = (customs.items || [])[0] || null;
  const latestForex = (forex.items || [])[0] || null;
  const canCreateForexDraft = Number(contract.receivedAmount || 0) > 0 && Boolean(latestCustoms?.id);
  const recommendedActions = uniqueActionRecommendations([
    !customsReady ? buildActionRecommendation({
      code: 'trade-compliance.prepare-customs-declaration',
      title: '生成报关草稿',
      domain: 'trade-compliance',
      priority: 'high',
      executionMode: 'confirmable_write',
      reason: '缺少报关单，税退链路尚未起步',
      actionType: 'CreateCustomsDeclarationDraft',
      params: {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        totalAmount: Number(contract.totalAmount || 0),
        currency: 'USD',
        note: 'Agent 根据税退链路诊断生成报关草稿',
      },
      sourceTool: 'DiagnoseTradeComplianceReadiness',
    }) : null,
    customsReady && !forexReady ? buildActionRecommendation({
      code: 'trade-compliance.prepare-forex-verification',
      title: '推进收汇核销登记',
      domain: 'trade-compliance',
      priority: 'high',
      executionMode: canCreateForexDraft ? 'confirmable_write' : 'manual',
      reason: '已有报关记录，但尚未完成收汇核销',
      actionType: canCreateForexDraft ? 'CreateForexVerificationDraft' : null,
      params: canCreateForexDraft ? {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        customsDeclarationId: latestCustoms.id,
        receivedAmount: Number(contract.receivedAmount || 0),
        currency: 'USD',
        note: 'Agent 根据税退链路诊断生成收汇核销草稿',
      } : null,
      sourceTool: 'DiagnoseTradeComplianceReadiness',
    }) : null,
    taxRefundReady && !taxRefunds.total ? buildActionRecommendation({
      code: 'trade-compliance.create-tax-refund-record',
      title: '补建退税草稿',
      domain: 'trade-compliance',
      priority: 'medium',
      executionMode: 'confirmable_write',
      reason: '已具备退税前置条件，但尚未创建退税记录',
      actionType: 'CreateTaxRefundDraft',
      params: {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        customsDeclarationId: latestCustoms.id,
        forexVerificationId: latestForex?.id || null,
        note: 'Agent 根据税退链路诊断生成退税草稿',
      },
      sourceTool: 'DiagnoseTradeComplianceReadiness',
    }) : null,
  ]);

  return {
    contractId: contract.id,
    contractNo: contract.contractNo,
    salesStatus: contract.status,
    readiness: {
      customsReady,
      forexReady,
      taxRefundReady,
    },
    coverage: {
      customsCount: Number(customs.total || 0),
      forexCount: Number(forex.total || 0),
      taxRefundCount: Number(taxRefunds.total || 0),
    },
    blockers,
    nextActions,
    recommendedActions,
  };
};

const pushToolTrace = (traceStore, item) => {
  if (!Array.isArray(traceStore)) return;
  traceStore.push(item);
};

const collectCompositeRecommendations = (tool, rawResult, recommendationStore) => {
  if (!tool?.isComposite || !Array.isArray(recommendationStore)) return;
  const parsed = safeParseJson(rawResult);
  if (!parsed || !Array.isArray(parsed.recommendedActions)) return;
  parsed.recommendedActions.forEach((item) => {
    const normalized = normalizeActionRecommendation(item, {
      domain: tool.domain,
      sourceTool: tool.name,
    });
    if (normalized) recommendationStore.push(normalized);
  });
};

// 汇率/加价只由报价配置（config/pricing.json，ADMIN 在「系统配置 > 报价配置」修改）维护；助手不能读写这两个遗留 SystemConfig 键。
const PRICING_CONFIG_KEYS = ['exchangeRate', 'profitRate'];
const PRICING_CONFIG_REFUSAL = '汇率和加价由报价配置统一维护，助手不能修改，请在「系统配置 > 报价配置」中调整';
// 卖方信息（公司名称/地址/电话/税号/银行 + 旧开票抬头别名）只经「设置 > 公司信息」维护；助手不能写，银行资料与旧抬头文本不能读。
const SELLER_CONFIG_KEYS = ['companyName', 'companyAddress', 'companyPhone', 'companyTaxId', 'companyBankInfo', 'invoiceTitleInfo'];
const AGENT_HIDDEN_CONFIG_KEYS = ['companyBankInfo', 'invoiceTitleInfo'];
const SELLER_CONFIG_REFUSAL = '卖方公司信息只能由管理员在「设置 > 公司信息」中维护，助手不能修改';

const READ_TOOL_SPECS = require('./agent/tools/readTools')({
  toJson,
  buildSalesContractFlowDiagnostic,
  buildPurchaseExecutionDiagnostic,
  buildTradeComplianceReadinessDiagnostic,
  PRICING_CONFIG_KEYS,
  AGENT_HIDDEN_CONFIG_KEYS,
});

const WRITE_TOOL_SPECS = require('./agent/tools/writeTools')({
  toJson,
  // 定义在后面，写工具只在调用时使用，故延迟取值
  createPendingAction: (...args) => createPendingAction(...args),
  PRICING_CONFIG_KEYS,
  PRICING_CONFIG_REFUSAL,
  SELLER_CONFIG_KEYS,
  SELLER_CONFIG_REFUSAL,
});

const listToolRegistry = () => [...READ_TOOL_SPECS, ...WRITE_TOOL_SPECS].map((tool) => ({
  name: tool.name,
  domain: tool.domain,
  access: tool.access,
  confirmationRequired: Boolean(tool.confirmationRequired),
  isComposite: Boolean(tool.isComposite),
  allowedRoles: tool.allowedRoles || Object.values(ROLES),
  description: tool.description,
}));

const buildToolRegistryPayload = (viewerRole = null) => {
  const tools = listToolRegistry().map((tool) => ({
    ...tool,
    availableForViewer: viewerRole ? isToolAllowedForRole(tool.name, viewerRole) : true,
  }));

  const domainMap = new Map();
  tools.forEach((tool) => {
    const current = domainMap.get(tool.domain) || {
      domain: tool.domain,
      label: DOMAIN_METADATA[tool.domain]?.label || tool.domain,
      description: DOMAIN_METADATA[tool.domain]?.description || '',
      toolCount: 0,
      readCount: 0,
      writeCount: 0,
      availableCount: 0,
      availableWriteCount: 0,
      compositeToolCount: 0,
    };
    current.toolCount += 1;
    if (tool.access === 'read') current.readCount += 1;
    if (tool.access === 'write') current.writeCount += 1;
    if (tool.availableForViewer) current.availableCount += 1;
    if (tool.availableForViewer && tool.access === 'write') current.availableWriteCount += 1;
    if (tool.isComposite) current.compositeToolCount += 1;
    domainMap.set(tool.domain, current);
  });

  return {
    primaryAgentType: PRIMARY_AGENT_TYPE,
    legacyAgentTypes: LEGACY_AGENT_TYPES,
    viewerRole,
    domains: Array.from(domainMap.values()).sort((a, b) => a.domain.localeCompare(b.domain)),
    tools,
  };
};

const findToolSpec = (toolName) => [...READ_TOOL_SPECS, ...WRITE_TOOL_SPECS].find((tool) => tool.name === toolName) || null;

const isToolAllowedForRole = (toolName, role) => {
  const tool = findToolSpec(toolName);
  if (!tool) return false;
  const allowedRoles = Array.isArray(tool.allowedRoles) && tool.allowedRoles.length
    ? tool.allowedRoles
    : Object.values(ROLES);
  return allowedRoles.includes(role);
};

const assertToolAllowedForRole = (toolName, role) => {
  if (!isToolAllowedForRole(toolName, role)) {
    throw createError(`当前角色无权调用工具 ${toolName}`, 403);
  }
};

const resolveSystemPrompt = (preset, routePlan) => `${preset.prompt}${buildSpecialistFrame(routePlan)}`;

const selectToolSpecsForRoute = (routePlan) => {
  if (!routePlan || routePlan.selectedDomains.includes('all')) {
    return {
      readTools: READ_TOOL_SPECS,
      writeTools: WRITE_TOOL_SPECS,
    };
  }

  const selectedSet = new Set(routePlan.selectedDomains);
  const readTools = READ_TOOL_SPECS.filter((tool) => selectedSet.has(tool.domain));
  const allowedWriteDomains = new Set([...routePlan.selectedDomains, 'system']);
  const writeTools = WRITE_TOOL_SPECS.filter((tool) => allowedWriteDomains.has(tool.domain));

  return {
    readTools,
    writeTools,
  };
};

const buildToolPool = (defineTool, traceStore, recommendationStore, toolSpecs = READ_TOOL_SPECS) => toolSpecs.map((tool) => defineTool({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  isReadOnly: tool.isReadOnly,
  isConcurrencySafe: tool.isConcurrencySafe,
  async call(input) {
    const startedAt = Date.now();
    try {
      const result = await tool.call(input || {});
      collectCompositeRecommendations(tool, result, recommendationStore);
      pushToolTrace(traceStore, {
        name: tool.name,
        domain: tool.domain,
        access: tool.access,
        status: 'success',
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      pushToolTrace(traceStore, {
        name: tool.name,
        domain: tool.domain,
        access: tool.access,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      });
      throw error;
    }
  },
}));

// ── 写工具（两阶段确认）──────────────────────────────

/**
 * 职责：创建一个 pendingAction 并存入内存，返回 agent 可读的描述
 * @param {string} userId - 当前用户 ID
 * @param {string} actionType - 操作类型
 * @param {object} params - 操作参数
 * @param {string} description - 面向用户的操作说明
 * @param {string[]} collectedIds - 收集本次 run 产生的 actionId
 * @returns {Promise<string>} JSON 字符串，agent 会拿到此结果
 */
const createPendingAction = async (userId, actionType, params, description, collectedIds) => {
  const actionId = await pendingStore.createPendingRecord({ userId, actionType, params, description });
  collectedIds.push(actionId);
  return toJson({
    __pendingAction: true,
    actionId,
    description: `${description}。等待用户确认后执行。`,
  });
};

/**
 * 职责：构建写工具池（与 userId / collectedIds 绑定）
 * @param {Function} defineTool
 * @param {string} userId
 * @param {string[]} collectedIds - 本次 run 收集到的 pendingAction IDs
 * @param {Array<object>} toolSpecs - 写工具定义
 */
const buildWriteToolPool = (defineTool, userId, userRole, collectedIds, traceStore, toolSpecs = WRITE_TOOL_SPECS) => toolSpecs.map((tool) => {
  // ponytail: 单轮调用去重；跨轮采购草稿重试需先查询现有草稿，规模扩大时再增加业务幂等键。
  const automaticResults = new Map();
  return defineTool({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  isReadOnly: tool.isReadOnly,
  async call(input) {
    const startedAt = Date.now();
    try {
      assertToolAllowedForRole(tool.name, userRole);
      const key = JSON.stringify(input || {});
      if (!tool.confirmationRequired && automaticResults.has(key)) return automaticResults.get(key);
      let result = await tool.call(input || {}, { userId, collectedIds });
      if (!tool.confirmationRequired) {
        const pending = JSON.parse(result);
        if (pending.__pendingAction) {
          result = toJson({ ...await executeAction(pending.actionId, userId, { automatic: true }), automatic: true });
          automaticResults.set(key, result);
        }
      }
      pushToolTrace(traceStore, {
        name: tool.name,
        domain: tool.domain,
        access: tool.access,
        status: 'success',
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      pushToolTrace(traceStore, {
        name: tool.name,
        domain: tool.domain,
        access: tool.access,
        status: 'failed',
        durationMs: Date.now() - startedAt,
        error: error?.message || String(error),
      });
      throw error;
    }
  },
  });
});

// ── 执行已确认的 pendingAction ──────────────────────────

const ACTION_EXECUTORS = {
  /**
   * 职责：执行收款分配
   */
  async AllocatePayment(params, userId) {
    const result = await financeService.allocatePaymentToContracts(params.paymentId, [{
      salesContractId: params.salesContractId,
      amount: params.amount,
    }]);
    return { success: true, detail: `已将 ¥${params.amount} 分配到合同 ${params.contractNo}`, result };
  },

  /**
   * 职责：更新出口合同状态
   */
  async UpdateExportContractStatus(params, userId) {
    const record = await salesService.updateSalesStatus(params.salesContractId, params.newStatus, { userId });
    return { success: true, detail: `合同 ${params.contractNo} 状态已更新为 ${record.status}` };
  },

  /**
   * 职责：创建收/付款记录
   */
  async CreatePaymentRecord(params, userId) {
    const record = await financeService.createPayment({
      type: params.type,
      amount: params.amount,
      customerName: params.customerName,
      note: params.note,
      paidAt: new Date().toISOString(),
    });
    return { success: true, detail: `已创建收/付款记录`, record };
  },

  /**
   * 职责：更新系统配置
   */
  async UpdateSystemConfig(params, userId) {
    // 即使存在旧的待确认动作，也不得在执行时写入报价参数
    if (PRICING_CONFIG_KEYS.includes(params.key)) throw new Error(PRICING_CONFIG_REFUSAL);
    // 即使存在旧的待确认动作，也不得绕过「公司信息」的校验直接写卖方信息
    if (SELLER_CONFIG_KEYS.includes(params.key)) throw new Error(SELLER_CONFIG_REFUSAL);
    await prisma.systemConfig.upsert({
      where: { key: params.key },
      update: { value: params.value, note: params.note },
      create: { key: params.key, value: params.value, note: params.note },
    });
    return { success: true, detail: `系统配置「${params.key}」已更新为 ${params.value}` };
  },
  async CreateSupplierRecord(params) {
    const record = await createSupplier({
      input: params,
      prismaClient: prisma,
    });
    return { success: true, detail: `已创建供应商 ${record.name}`, record };
  },
  async UpdateSupplierRecord(params) {
    const record = await updateSupplier({
      id: params.id,
      input: params.input,
      prismaClient: prisma,
    });
    return { success: true, detail: `已更新供应商 ${record.name || params.id}`, record };
  },
  async CreatePurchaseContract(params) {
    const record = await createPurchaseWithItems({
      input: params.input,
      prismaClient: prisma,
    });
    return { success: true, detail: `已创建采购合同 ${record.contractNo}`, record };
  },
  async UpdatePurchaseContract(params) {
    const record = await updatePurchase({
      id: params.id,
      input: params.input,
      prismaClient: prisma,
    });
    return { success: true, detail: `已更新采购合同 ${record.contractNo || params.id}`, record };
  },
  async UpdateInventoryStatus(params) {
    const inventory = await prisma.inventory.findUnique({ where: { id: params.id } });
    if (!inventory) throw createError('库存记录不存在', 404);
    const validation = validateInventoryTransition(inventory.status, params.status, inventory);
    if (!validation.valid) throw createError(validation.message, 400);
    if (inventory.status === params.status) return { success: true, detail: '库存状态未变化', record: inventory };
    const updateData = { status: params.status };
    if (params.status === 'INBOUND') {
      updateData.inboundAt = new Date();
    } else if (params.status === 'OUTBOUND') {
      updateData.outboundAt = new Date();
    }
    const record = await prisma.inventory.update({
      where: { id: params.id, status: inventory.status },
      data: updateData,
    });
    return { success: true, detail: `库存 ${params.id} 状态已更新为 ${params.status}`, record };
  },
  async CreateCustomsDeclarationDraft(params) {
    const contract = await prisma.salesContract.findUnique({
      where: { id: params.salesContractId },
      select: { id: true, contractNo: true, totalAmount: true },
    });
    if (!contract) {
      throw createError('出口合同不存在', 404);
    }
    const existing = await prisma.customsDeclaration.findFirst({
      where: { salesContractId: contract.id, status: { not: 'VOID' } },
      select: { declarationNo: true },
    });
    if (existing) {
      throw createError(`合同 ${contract.contractNo} 已存在报关单 ${existing.declarationNo}`, 409);
    }
    const record = await customsDeclarationService.createCustomsDeclaration({
      declarationNo: buildDraftDocumentNo('BG', params.contractNo || contract.contractNo),
      salesContractId: contract.id,
      status: 'DRAFT',
      currency: params.currency || 'USD',
      totalAmount: Number(params.totalAmount ?? contract.totalAmount ?? 0),
      totalQuantity: Number(params.totalQuantity || 0),
      note: params.note || 'Agent 根据诊断建议创建报关草稿',
    });
    return { success: true, detail: `已为合同 ${contract.contractNo} 创建报关草稿`, record };
  },
  async CreateForexVerificationDraft(params) {
    const contract = await prisma.salesContract.findUnique({
      where: { id: params.salesContractId },
      select: { id: true, contractNo: true, receivedAmount: true },
    });
    if (!contract) {
      throw createError('出口合同不存在', 404);
    }
    const existing = await prisma.forexVerification.findFirst({
      where: { salesContractId: contract.id },
      select: { verificationNo: true },
    });
    if (existing) {
      throw createError(`合同 ${contract.contractNo} 已存在核销记录 ${existing.verificationNo}`, 409);
    }
    const record = await forexVerificationService.createForexVerification({
      verificationNo: buildDraftDocumentNo('HX', params.contractNo || contract.contractNo),
      salesContractId: contract.id,
      customsDeclarationId: params.customsDeclarationId || null,
      currency: params.currency || 'USD',
      receivedAmount: Number(params.receivedAmount ?? contract.receivedAmount ?? 0),
      status: 'PENDING',
      note: params.note || 'Agent 根据诊断建议创建收汇核销草稿',
    });
    return { success: true, detail: `已为合同 ${contract.contractNo} 创建收汇核销草稿`, record };
  },
  async CreateTaxRefundDraft(params) {
    const contract = await prisma.salesContract.findUnique({
      where: { id: params.salesContractId },
      select: { id: true, contractNo: true },
    });
    if (!contract) {
      throw createError('出口合同不存在', 404);
    }
    const existing = await prisma.taxRefund.findFirst({
      where: {
        salesContractId: contract.id,
        customsDeclarationId: params.customsDeclarationId,
      },
      select: { refundNo: true },
    });
    if (existing) {
      throw createError(`合同 ${contract.contractNo} 已存在退税记录 ${existing.refundNo}`, 409);
    }
    const record = await taxRefundService.createTaxRefund({
      refundNo: buildDraftDocumentNo('TR', params.contractNo || contract.contractNo),
      salesContractId: contract.id,
      customsDeclarationId: params.customsDeclarationId,
      forexVerificationId: params.forexVerificationId || null,
      status: 'DRAFT',
      note: params.note || 'Agent 根据诊断建议创建退税草稿',
    });
    return { success: true, detail: `已为合同 ${contract.contractNo} 创建退税草稿`, record };
  },
};

/**
 * 职责：执行一个已确认的 pendingAction
 * @param {string} actionId
 * @param {string} userId - 当前用户（必须与创建者一致）
 * @returns {object} 执行结果
 */
const PENDING_STATUS_MESSAGES = {
  executed: '该操作已执行',
  executing: '该操作正在执行中',
  cancelled: '该操作已取消',
  failed: '该操作已失败，请重新向 Agent 提问',
};

const executeAction = async (actionId, userId, { automatic = false } = {}) => {
  const action = await pendingStore.getPendingRecord(actionId);
  if (!action) throw createError('该操作已过期或不存在，请重新向 Agent 提问', 404);
  if (action.userId !== userId) throw createError('无权执行此操作', 403);
  if (action.status !== 'pending') throw createError(PENDING_STATUS_MESSAGES[action.status] || '该操作已不可执行', 409);

  const executor = ACTION_EXECUTORS[action.actionType];
  if (!executor) throw createError(`不支持的操作类型: ${action.actionType}`, 400);

  // 原子抢占：并发/跨进程的重复确认只有一方能把 pending 改成 executing
  if (!(await pendingStore.claimPending(actionId, userId))) {
    const latest = await pendingStore.getPendingRecord(actionId);
    if (!latest) throw createError('该操作已过期或不存在，请重新向 Agent 提问', 404);
    throw createError(PENDING_STATUS_MESSAGES[latest.status] || '该操作已不可执行', 409);
  }

  try {
    const result = await executor(action.params, userId);
    await pendingStore.finishClaimed(actionId, 'executed');

    // 写入审计日志
    await prisma.operationLog.create({
      data: {
        actorType: 'USER',
        userId,
        action: 'AGENT_WRITE_EXECUTE',
        entity: action.actionType,
        entityId: actionId,
        newValue: JSON.stringify({
          sessionId: action.sessionId || null,
          actionType: action.actionType,
          status: 'executed',
          automatic,
          params: action.params,
          result: { success: result.success, detail: result.detail },
        }),
      },
    });

    return { actionId, actionType: action.actionType, description: action.description, ...result };
  } catch (error) {
    // 失败不回到 pending：写操作可能已部分生效，需用户重新发起
    await pendingStore.finishClaimed(actionId, 'failed', error?.message || String(error)).catch(() => {});
    await prisma.operationLog.create({
      data: {
        actorType: 'USER',
        userId,
        action: 'AGENT_WRITE_FAILED',
        entity: action.actionType,
        entityId: actionId,
        newValue: JSON.stringify({
          sessionId: action.sessionId || null,
          actionType: action.actionType,
          status: 'failed',
          params: action.params,
          detail: error?.message || String(error),
        }),
      },
    });
    throw error;
  }
};

/**
 * 职责：取消一个 pendingAction
 */
const cancelAction = async (actionId, userId) => {
  const action = await pendingStore.getPendingRecord(actionId);
  if (!action || action.userId !== userId) return;
  if (!(await pendingStore.cancelPending(actionId, userId))) return;
  await prisma.operationLog.create({
    data: {
      actorType: 'USER',
      userId,
      action: 'AGENT_WRITE_CANCEL',
      entity: action.actionType,
      entityId: actionId,
      newValue: JSON.stringify({
        sessionId: action.sessionId || null,
        actionType: action.actionType,
        status: 'cancelled',
        params: action.params,
        detail: '用户取消操作',
      }),
    },
  });
};

/** 把本次 run 收集到的待确认操作绑定到会话并返回摘要（已过期的略过） */
const collectRunActions = async (ids, sessionId) => {
  await pendingStore.attachSession(ids, sessionId);
  const records = await Promise.all(ids.map((id) => pendingStore.getPendingRecord(id)));
  return records.map((action, index) => (action ? {
    actionId: ids[index],
    actionType: action.actionType,
    description: action.description,
    params: action.params,
    status: action.status,
  } : null)).filter(Boolean);
};

const resolveSdkSessionConfig = (sessionId) => {
  const normalized = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (normalized) {
    return {
      sessionId: normalized,
      resume: normalized,
      persistSession: true,
    };
  }

  return {
    sessionId: `agent_runtime_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    persistSession: true,
  };
};

const persistAgentRun = async ({
  userId,
  sessionId,
  agentType,
  message,
  responseText,
  usage,
  model,
  routePlan,
  selectedToolNames,
  toolTraceSummary,
  actionRecommendations,
  pendingActionSummary,
}) => {
  const metadataPayload = buildAgentRunMetadata({
    source: 'open-agent-sdk',
    agentType,
    model,
    routePlan,
    selectedToolNames,
    toolTraceSummary,
    actionRecommendations,
    pendingActionSummary,
  });
  const metadata = JSON.stringify(metadataPayload);
  const replaySnapshotValue = buildReplaySnapshotLogValue({
    governanceReplayProfile: metadataPayload.governanceReplayProfile,
    routePlan: routePlan || null,
    selectedToolNames: selectedToolNames || [],
  });
  await prisma.$transaction(async (tx) => {
    await tx.chatHistory.create({
      data: {
        userId,
        sessionId,
        role: 'user',
        content: message,
        metadata,
      },
    });
    await tx.chatHistory.create({
      data: {
        userId,
        sessionId,
        role: 'assistant',
        content: responseText,
        metadata,
        promptTokens: Number(usage?.input_tokens || 0),
        outputTokens: Number(usage?.output_tokens || 0),
        modelUsed: model,
      },
    });
    await tx.tokenUsage.create({
      data: {
        userId,
        sessionId,
        model,
        promptTokens: Number(usage?.input_tokens || 0),
        outputTokens: Number(usage?.output_tokens || 0),
        totalTokens: Number(usage?.input_tokens || 0) + Number(usage?.output_tokens || 0),
        requestType: `agent_prompt_${agentType}`,
        promptBrief: message.slice(0, 200),
        detailSnapshot: responseText.slice(0, 2000),
      },
    });
    await tx.operationLog.create({
      data: {
        actorType: 'USER',
        userId,
        action: 'AGENT_RUN',
        entity: 'AgentRuntime',
        entityId: sessionId,
        newValue: JSON.stringify({
          agentType,
          model,
          prompt: message.slice(0, 200),
          responsePreview: responseText.slice(0, 500),
          routePlan: routePlan || null,
          selectedToolNames: selectedToolNames || [],
          toolTraceSummary: toolTraceSummary || null,
          actionRecommendations: actionRecommendations || [],
          pendingActionSummary: pendingActionSummary || [],
          governanceReplayProfile: metadataPayload.governanceReplayProfile,
        }),
      },
    });
    await tx.operationLog.create({
      data: {
        actorType: 'USER',
        userId,
        action: 'AGENT_REPLAY_SNAPSHOT',
        entity: 'AgentRuntimeReplay',
        entityId: sessionId,
        newValue: JSON.stringify(replaySnapshotValue),
      },
    });
    await upsertReplaySummary({
      userId,
      sessionId,
      governanceReplayProfile: metadataPayload.governanceReplayProfile,
    }, tx);
  });
};

const buildAgentRunMetadata = ({
  source = 'open-agent-sdk',
  agentType,
  model,
  routePlan,
  selectedToolNames,
  toolTraceSummary,
  actionRecommendations,
  pendingActionSummary,
}) => ({
  source,
  agentType,
  model,
  routePlan: routePlan || null,
  selectedToolNames: selectedToolNames || [],
  toolTraceSummary: toolTraceSummary || null,
  actionRecommendations: actionRecommendations || [],
  pendingActionSummary: pendingActionSummary || [],
  governanceReplayProfile: buildGovernanceReplayProfile({
    toolTraceSummary: toolTraceSummary || null,
    actionRecommendations: actionRecommendations || [],
    pendingActionSummary: pendingActionSummary || [],
  }),
});

const buildAgentDoneEvent = ({
  responseText,
  sessionId,
  model,
  pendingActions,
  usage,
  routePlan,
  toolTraceSummary,
  actionRecommendations,
}) => ({
  type: 'done',
  content: responseText,
  sessionId,
  model,
  pendingActions,
  usage,
  routePlan,
  toolTraceSummary,
  actionRecommendations,
});

const buildReplaySnapshotLogValue = ({
  governanceReplayProfile,
  routePlan,
  selectedToolNames,
}) => ({
  source: 'open-agent-sdk',
  replaySource: 'dedicated-replay-snapshot',
  governanceReplayProfile: {
    ...governanceReplayProfile,
    source: governanceReplayProfile?.source === 'session-metadata'
      ? 'replay-snapshot-log'
      : governanceReplayProfile?.source,
  },
  routePlan: routePlan || null,
  selectedToolNames: selectedToolNames || [],
});

// SDK prompt() 会丢弃 result.subtype；两种入口都直接校验 query 的终止事件。
const assertAgentResult = (result) => {
  if (result.is_error || (result.subtype && result.subtype !== 'success')) {
    throw createError('AI 服务本次执行失败，请稍后重新发起请求', 503);
  }
};

/**
 * 职责：运行一次 Agent prompt（含只读 + 写工具）
 * 思路：
 *   0. 准备运行时配置、SDK、工具池
 *   1. 创建 agent 并 prompt
 *   2. 收集本次 run 中产生的 pendingActions
 *   3. 持久化聊天/token/操作日志
 *   4. 返回文本 + pendingActions 列表
 */
const runAgentPrompt = async ({ userId, userRole, agentType, message, sessionId }) => {
  const preset = getAgentPreset(agentType);
  const runtimeConfig = await ensureRuntimeConfig();
  const sdk = await loadSdk();
  const routePlan = inferRoutePlan({ agentType: preset.id, message });
  const toolTrace = [];
  const actionRecommendationTrace = [];

  // 0. 收集本次 run 产生的 pendingAction IDs
  const collectedActionIds = [];
  const { readTools: readToolSpecs, writeTools: writeToolSpecs } = selectToolSpecsForRoute(routePlan);
  const readTools = buildToolPool(sdk.defineTool, toolTrace, actionRecommendationTrace, readToolSpecs);
  const writeTools = buildWriteToolPool(sdk.defineTool, userId, userRole, collectedActionIds, toolTrace, writeToolSpecs);
  const tools = [...readTools, ...writeTools];
  const selectedToolNames = [...readToolSpecs, ...writeToolSpecs].map((tool) => tool.name);

  const sessionConfig = resolveSdkSessionConfig(sessionId);
  const resolvedSessionId = sessionConfig.sessionId;

  const agent = sdk.createAgent({
    // 此本地代理固定使用 Anthropic 协议，不能按 DeepSeek/GPT 模型名自动切换。
    apiType: 'anthropic-messages',
    model: runtimeConfig.model,
    apiKey: runtimeConfig.apiKey,
    baseURL: runtimeConfig.baseURL,
    systemPrompt: resolveSystemPrompt(preset, routePlan),
    tools,
    maxTurns: 8,
    permissionMode: 'dontAsk',
    ...sessionConfig,
  });

  try {
    const startedAt = Date.now();
    const result = { text: '', usage: {}, num_turns: 0, duration_ms: 0 };
    for await (const event of agent.query(message)) {
      if (event.type === 'assistant') {
        const text = event.message.content.filter(item => item.type === 'text').map(item => item.text).join('');
        if (text) result.text = text;
      } else if (event.type === 'result') {
        assertAgentResult(event);
        result.usage = event.usage || {};
        result.num_turns = event.num_turns || 0;
      }
    }
    result.duration_ms = Date.now() - startedAt;

    const actionRecommendations = summarizeActionRecommendations(actionRecommendationTrace);
    await materializeRecommendationPendingActions({
      userId,
      collectedIds: collectedActionIds,
      recommendations: actionRecommendations,
    });
    const actions = await collectRunActions(collectedActionIds, resolvedSessionId);
    const pendingActions = actions.filter(action => action.status === 'pending');

    // 3. 持久化
    await persistAgentRun({
      userId,
      sessionId: resolvedSessionId,
      agentType: preset.id,
      message,
      responseText: result.text,
      usage: result.usage,
      model: runtimeConfig.model,
      routePlan,
      selectedToolNames,
      toolTraceSummary: summarizeToolTrace(toolTrace),
      actionRecommendations,
      pendingActionSummary: actions.map((item) => ({
        actionId: item.actionId,
        actionType: item.actionType,
        description: item.description,
        status: item.status,
      })),
    });

    return {
      sessionId: resolvedSessionId,
      agent: {
        id: preset.id,
        label: preset.label,
      },
      text: result.text,
      pendingActions,
      usage: result.usage,
      numTurns: result.num_turns,
      durationMs: result.duration_ms,
      model: runtimeConfig.model,
      routePlan,
      toolTraceSummary: summarizeToolTrace(toolTrace),
      actionRecommendations,
    };
  } finally {
    await agent.close();
  }
};

/**
 * 职责：流式运行一次 Agent prompt，逐步 yield SSE 事件
 * 思路：
 *   1. 用 agent.query() AsyncGenerator 迭代 SDK 事件
 *   2. 将 partial_message (text) 转为 chunk 事件 yield 给调用方
 *   3. 将 assistant 事件中的完整文本作为最终 done 事件
 *   4. 收集 pendingActions，持久化，yield done 事件
 * @param {Object} params - { userId, agentType, message, sessionId, imageUrl }
 * @yields {{ type: string, [key: string]: unknown }} SSE 事件
 */
async function* runAgentPromptStream({ userId, userRole, agentType, message, sessionId, imageUrl }) {
  const preset = getAgentPreset(agentType);
  const runtimeConfig = await ensureRuntimeConfig();
  const sdk = await loadSdk();
  const routePlan = inferRoutePlan({ agentType: preset.id, message });
  const toolTrace = [];
  const actionRecommendationTrace = [];

  const collectedActionIds = [];
  const { readTools: readToolSpecs, writeTools: writeToolSpecs } = selectToolSpecsForRoute(routePlan);
  const readTools = buildToolPool(sdk.defineTool, toolTrace, actionRecommendationTrace, readToolSpecs);
  const writeTools = buildWriteToolPool(sdk.defineTool, userId, userRole, collectedActionIds, toolTrace, writeToolSpecs);
  const tools = [...readTools, ...writeTools];
  const selectedToolNames = [...readToolSpecs, ...writeToolSpecs].map((tool) => tool.name);

  const sessionConfig = resolveSdkSessionConfig(sessionId);
  const resolvedSessionId = sessionConfig.sessionId;

  yield { type: 'session', sessionId: resolvedSessionId, routePlan };

  const agent = sdk.createAgent({
    apiType: 'anthropic-messages',
    model: runtimeConfig.model,
    apiKey: runtimeConfig.apiKey,
    baseURL: runtimeConfig.baseURL,
    systemPrompt: resolveSystemPrompt(preset, routePlan),
    tools,
    maxTurns: 8,
    permissionMode: 'dontAsk',
    includePartialMessages: true,
    ...sessionConfig,
  });

  let finalText = '';
  let usage = {};

  try {
    // 1. 如果有图片附件，在消息前附加说明
    let promptText = message;
    if (imageUrl) {
      promptText = `[用户附带了一张图片：${imageUrl}]\n\n${message}`;
    }

    for await (const ev of agent.query(promptText)) {
      switch (ev.type) {
        case 'partial_message':
          if (ev.partial?.type === 'text' && ev.partial.text) {
            yield { type: 'chunk', content: ev.partial.text };
          }
          break;
        case 'assistant': {
          const fragments = ev.message.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text);
          if (fragments.length) finalText = fragments.join('');
          break;
        }
        case 'result':
          assertAgentResult(ev);
          usage = {
            input_tokens: ev.usage?.input_tokens ?? 0,
            output_tokens: ev.usage?.output_tokens ?? 0,
          };
          break;
      }
    }

    const actionRecommendations = summarizeActionRecommendations(actionRecommendationTrace);
    await materializeRecommendationPendingActions({
      userId,
      collectedIds: collectedActionIds,
      recommendations: actionRecommendations,
    });
    const actions = await collectRunActions(collectedActionIds, resolvedSessionId);
    const pendingActions = actions.filter(action => action.status === 'pending');

    // 3. 持久化
    await persistAgentRun({
      userId,
      sessionId: resolvedSessionId,
      agentType: preset.id,
      message,
      responseText: finalText,
      usage,
      model: runtimeConfig.model,
      routePlan,
      selectedToolNames,
      toolTraceSummary: summarizeToolTrace(toolTrace),
      actionRecommendations,
      pendingActionSummary: actions.map((item) => ({
        actionId: item.actionId,
        actionType: item.actionType,
        description: item.description,
        status: item.status,
      })),
    });

    // 4. 发送完成事件
    yield buildAgentDoneEvent({
      responseText: finalText,
      sessionId: resolvedSessionId,
      model: runtimeConfig.model,
      pendingActions,
      usage,
      routePlan,
      toolTraceSummary: summarizeToolTrace(toolTrace),
      actionRecommendations,
    });
  } finally {
    await agent.close();
  }
}

module.exports = {
  loadSdk,
  SUPPORTED_AGENT_TYPES,
  PRIMARY_AGENT_TYPE,
  LEGACY_AGENT_TYPES,
  getAgentPreset,
  buildSpecialistFrame,
  resolveSystemPrompt,
  inferRoutePlan,
  listToolRegistry,
  buildToolPool,
  buildWriteToolPool,
  buildToolRegistryPayload,
  buildSalesContractFlowDiagnostic,
  buildPurchaseExecutionDiagnostic,
  buildTradeComplianceReadinessDiagnostic,
  isToolAllowedForRole,
  materializeRecommendationPendingActions,
  summarizeToolTrace,
  buildAgentRunMetadata,
  buildAgentDoneEvent,
  buildReplaySnapshotLogValue,
  buildReplaySummaryRecord,
  resolveSdkSessionConfig,
  persistAgentRun,
  runAgentPrompt,
  runAgentPromptStream,
  executeAction,
  cancelAction,
};
