/**
 * Input: open-agent-sdk, Kimi API (via anthropicCompatService), 业务服务层
 * Output: 预置业务 Agent 运行时：只读查询 + 两阶段确认写工具 + SSE 流式输出 + 原子运行记录
 * Pos: 后端 Agent Runtime 核心，衔接 LLM 与业务数据
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const prisma = require('../utils/prisma');
const config = require('../config');
const { createError } = require('../middleware/errorHandler');
const financeService = require('./financeService');
const salesService = require('./salesService');
const importService = require('./importService');
const aiService = require('./aiService');
const { searchEntities } = require('../agent/commands/query');
const { getInventorySnapshot } = require('./inventorySnapshot');
const { listLowStockAlerts } = require('./inventoryAlertService');
const customsDeclarationService = require('./customsDeclarationService');
const taxRefundService = require('./taxRefundService');
const forexVerificationService = require('./forexVerificationService');
const eventLedgerService = require('./eventLedgerService');
const { buildGovernanceReplayProfile } = require('./governanceReplayService');
const { buildReplaySummaryRecord, upsertReplaySummary } = require('./agentReplaySummaryService');
const { getOpenAgentRuntimeToken } = require('../utils/openAgentRuntimeAuth');
const { ROLES } = require('../config/constants');
const { createPurchaseWithItems, updatePurchase } = require('../agent/commands/purchase');
const { createSupplier, updateSupplier } = require('../agent/commands/supplier');
const { validateInventoryTransition } = require('../utils/inventoryStateMachine');

const SUPPORTED_AGENT_TYPES = ['finance', 'export', 'executive', 'unified'];
const PRIMARY_AGENT_TYPE = 'unified';
const LEGACY_AGENT_TYPES = ['finance', 'export', 'executive'];
const TOOL_TRACE_ITEMS_LIMIT = 40;
const ACTION_RECOMMENDATIONS_LIMIT = 20;

// ── Pending Action Store（内存，30 分钟 TTL）────────────────
const PENDING_ACTION_TTL_MS = 30 * 60 * 1000;
const pendingActionStore = new Map();

/**
 * 职责：定时清理过期 pendingAction，防止内存泄漏
 */
const cleanExpiredPendingActions = () => {
  const now = Date.now();
  for (const [key, action] of pendingActionStore) {
    if (now - action.createdAt > PENDING_ACTION_TTL_MS) {
      pendingActionStore.delete(key);
    }
  }
};
const _cleanupTimer = setInterval(cleanExpiredPendingActions, 5 * 60 * 1000);
_cleanupTimer.unref();

const WRITE_CONFIRMATION_INSTRUCTION = [
  '',
  '【写操作规则】',
  '你拥有写工具（如 AllocatePayment、UpdateSystemConfig 等）。',
  '调用写工具后，系统会生成一个"待确认操作"，你需要在回复中清晰告知用户该操作的内容，',
  '并提示"请在下方确认后执行"。你**不要**自行重复调用写工具，也不要说操作已完成。',
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
  try {
    return await import('@codeany/open-agent-sdk');
  } catch (error) {
    const localBuildPath = path.resolve(__dirname, '../../../.tmp/open-agent-sdk-typescript/dist/index.js');
    return import(pathToFileURL(localBuildPath).href);
  }
};

const ensureRuntimeConfig = async () => {
  if (!config.kimi.apiKey) {
    throw createError('请先配置当前系统的 KIMI_API_KEY 后再启用 Agent Runtime', 503);
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

const materializeRecommendationPendingActions = ({ userId, recommendations, collectedIds = [] }) => {
  if (!userId || !Array.isArray(recommendations) || !Array.isArray(collectedIds)) return [];

  const created = [];
  summarizeActionRecommendations(recommendations).forEach((recommendation) => {
    if (recommendation.executionMode !== 'confirmable_write' || !recommendation.actionType || !recommendation.params) {
      return;
    }

    const exists = collectedIds.some((id) => isSamePendingAction(pendingActionStore.get(id), recommendation));
    if (exists) return;

    createPendingAction(
      userId,
      recommendation.actionType,
      recommendation.params,
      buildRecommendationPendingDescription(recommendation),
      collectedIds,
    );

    const actionId = collectedIds[collectedIds.length - 1];
    const action = pendingActionStore.get(actionId);
    if (!action) return;
    created.push({
      actionId,
      actionType: action.actionType,
      description: action.description,
      params: action.params,
    });
  });

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

  const unpaidAmount = Math.max(Number(contract.totalAmount || 0) - Number(contract.paidAmount || 0), 0);
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

const READ_TOOL_SPECS = [
  {
    name: 'SearchEntities',
    domain: 'search',
    access: 'read',
    confirmationRequired: false,
    description: '统一搜索商品、供应商、采购合同、出口合同，适合用户问题还不够具体时先建立上下文',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键字，至少 2 个字符' },
        types: {
          type: 'array',
          description: '限定搜索范围，可选 product/supplier/purchase/sales',
          items: { type: 'string' },
        },
        limit: { type: 'number', description: '结果上限，最大 20' },
      },
      required: ['query'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const result = await searchEntities({
        query: input?.query,
        types: input?.types,
        limit: input?.limit,
      });
      return toJson({
        total: result.length,
        items: result,
      });
    },
  },
  {
    name: 'GetFinanceOverview',
    domain: 'finance',
    access: 'read',
    confirmationRequired: false,
    description: '读取财务总览、应收、实收、待分配收款等关键指标',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call() {
      const stats = await financeService.getStats();
      const receivables = await financeService.getReceivables({ page: 1, pageSize: 8, skip: 0 });
      const pool = await financeService.listUnallocatedPayments();
      return toJson({
        stats,
        receivables: receivables.receivables || [],
        receivableTotal: receivables.total || 0,
        unallocatedPoolCount: pool.length,
        unallocatedPoolPreview: pool.slice(0, 8).map((payment) => ({
          id: payment.id,
          customerName: payment.customerName,
          amount: payment.amount,
          remainingAmount: payment.remainingAmount,
          note: payment.note,
          paidAt: payment.paidAt,
        })),
      });
    },
  },
  {
    name: 'GetReceivablesByCustomer',
    domain: 'finance',
    access: 'read',
    confirmationRequired: false,
    description: '读取客户欠款与应收合同概览',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const limit = Math.max(1, Math.min(Number(input?.limit || 10), 20));
      const receivables = await financeService.getReceivables({ page: 1, pageSize: limit, skip: 0 });
      return toJson({
        total: receivables.total || 0,
        items: (receivables.receivables || []).slice(0, limit).map((item) => ({
          contractNo: item.contractNo,
          totalAmount: item.totalAmount,
          receivedAmount: item.receivedAmount,
          unreceiveAmount: item.unreceiveAmount,
          stores: item.stores,
          hasThirdPartyCargo: item.hasThirdPartyCargo,
          sourceParties: item.sourceParties,
        })),
      });
    },
  },
  {
    name: 'GetExportOverview',
    domain: 'sales-export',
    access: 'read',
    confirmationRequired: false,
    description: '读取出口合同概览、最近合同和第三方拼柜来源',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string' },
        limit: { type: 'number' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const limit = Math.max(1, Math.min(Number(input?.limit || 10), 20));
      const result = await salesService.getSalesContracts({
        page: 1,
        pageSize: limit,
        keyword: typeof input?.keyword === 'string' ? input.keyword.trim() : undefined,
        lite: true,
      });
      return toJson({
        total: result.total || 0,
        contracts: (result.contracts || []).slice(0, limit).map((contract) => ({
          contractNo: contract.contractNo,
          status: contract.status,
          totalAmount: contract.totalAmount,
          receivedAmount: contract.receivedAmount,
          stores: contract.stores,
          hasThirdPartyCargo: contract.hasThirdPartyCargo,
          sourceParties: contract.sourceParties,
          signedAt: contract.signedAt,
        })),
      });
    },
  },
  {
    name: 'GetPurchaseOverview',
    domain: 'procurement',
    access: 'read',
    confirmationRequired: false,
    description: '读取采购合同概览、供应商信息和近期采购状态',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '可选，按合同号或供应商过滤' },
        limit: { type: 'number', description: '返回条数，默认 10，最大 20' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const limit = Math.max(1, Math.min(Number(input?.limit || 10), 20));
      const keyword = typeof input?.keyword === 'string' ? input.keyword.trim() : '';
      const where = {};
      if (keyword) {
        where.OR = [
          { contractNo: { contains: keyword } },
          { supplier: { name: { contains: keyword } } },
        ];
      }

      const items = await prisma.purchaseContract.findMany({
        where,
        take: limit,
        include: {
          supplier: {
            select: { id: true, name: true, hasQualityIssue: true },
          },
        },
        orderBy: { contractNo: 'desc' },
      });

      return toJson({
        total: items.length,
        contracts: items.map((item) => ({
          id: item.id,
          contractNo: item.contractNo,
          status: item.status,
          totalAmount: item.totalAmount,
          paidAmount: item.paidAmount,
          supplier: item.supplier,
          signedAt: item.signedAt,
        })),
      });
    },
  },
  {
    name: 'GetPurchaseContractDetail',
    domain: 'procurement',
    access: 'read',
    confirmationRequired: false,
    description: '按采购合同号读取采购合同详情，包括供应商、状态、金额和明细摘要',
    inputSchema: {
      type: 'object',
      properties: {
        contractNo: { type: 'string', description: '采购合同号，如 CG2600001' },
      },
      required: ['contractNo'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const keyword = String(input?.contractNo || '').trim();
      const contract = await prisma.purchaseContract.findFirst({
        where: { contractNo: keyword },
        include: {
          supplier: {
            select: { id: true, name: true, shortName: true, hasQualityIssue: true },
          },
          items: {
            include: {
              product: {
                select: { id: true, customsName: true, specification: true, unit: true },
              },
            },
          },
        },
      });
      if (!contract) return toJson({ error: `采购合同 ${keyword} 不存在` });
      return toJson({
        id: contract.id,
        contractNo: contract.contractNo,
        status: contract.status,
        totalAmount: contract.totalAmount,
        paidAmount: contract.paidAmount,
        signedAt: contract.signedAt,
        supplier: contract.supplier,
        items: (contract.items || []).map((item) => ({
          id: item.id,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          product: item.product,
        })),
      });
    },
  },
  {
    name: 'GetSupplierOverview',
    domain: 'procurement',
    access: 'read',
    confirmationRequired: false,
    description: '读取供应商列表概览、质量问题标记与活跃状态',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '可选，按供应商名称或简称过滤' },
        limit: { type: 'number', description: '返回条数，默认 10，最大 20' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const limit = Math.max(1, Math.min(Number(input?.limit || 10), 20));
      const keyword = typeof input?.keyword === 'string' ? input.keyword.trim() : '';
      const where = keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { shortName: { contains: keyword } },
            ],
          }
        : {};

      const items = await prisma.supplier.findMany({
        where,
        take: limit,
        select: {
          id: true,
          name: true,
          shortName: true,
          hasQualityIssue: true,
          qualityNote: true,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      return toJson({
        total: items.length,
        suppliers: items,
      });
    },
  },
  {
    name: 'GetSalesContractDetail',
    domain: 'sales-export',
    access: 'read',
    confirmationRequired: false,
    description: '按出口合同号读取销售合同详情，包括状态、金额、门店、拼柜来源和商品摘要',
    inputSchema: {
      type: 'object',
      properties: {
        contractNo: { type: 'string', description: '出口合同号，如 EXP2600001' },
      },
      required: ['contractNo'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const keyword = String(input?.contractNo || '').trim();
      const contract = await prisma.salesContract.findFirst({
        where: { contractNo: keyword },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, customsName: true, specification: true, unit: true },
              },
              store: {
                select: { id: true, name: true },
              },
            },
          },
          packingItems: true,
          port: {
            select: { id: true, name: true },
          },
        },
      });
      if (!contract) return toJson({ error: `出口合同 ${keyword} 不存在` });
      return toJson({
        id: contract.id,
        contractNo: contract.contractNo,
        status: contract.status,
        totalAmount: contract.totalAmount,
        receivedAmount: contract.receivedAmount,
        port: contract.port || null,
        hasThirdPartyCargo: Boolean(contract.hasThirdPartyCargo),
        sourceParties: contract.sourceParties || [],
        items: (contract.items || []).map((item) => ({
          id: item.id,
          quantity: item.quantity,
          sellingPrice: item.sellingPrice,
          store: item.store,
          product: item.product,
        })),
      });
    },
  },
  {
    name: 'GetFinanceRiskOverview',
    domain: 'finance',
    access: 'read',
    confirmationRequired: false,
    isComposite: true,
    description: '读取财务风险视角：应收逾期、收付款趋势、待分配收款池',
    inputSchema: {
      type: 'object',
      properties: {
        trendDays: { type: 'number', description: '趋势统计天数，默认 90' },
        overdueDays: { type: 'number', description: '逾期阈值天数，默认 30' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const trendDays = Math.max(7, Math.min(Number(input?.trendDays || 90), 180));
      const overdueDays = Math.max(1, Math.min(Number(input?.overdueDays || 30), 180));
      const [trends, overdue, pool] = await Promise.all([
        financeService.getPaymentTrends(trendDays),
        financeService.getOverdueReceivables(overdueDays),
        financeService.listUnallocatedPayments(),
      ]);

      return toJson({
        trendDays,
        overdueDays,
        trends,
        overdueReceivables: overdue,
        unallocatedPoolCount: pool.length,
      });
    },
  },
  {
    name: 'GetInventoryOverview',
    domain: 'inventory',
    access: 'read',
    confirmationRequired: false,
    description: '读取库存快照，返回按商品聚合后的库存数量、平均成本与样本商品',
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: '可选，限定某个商品 ID' },
        limit: { type: 'number', description: '样本商品返回数量，默认 8，最大 20' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const snapshot = await getInventorySnapshot(prisma, {
        productId: input?.productId || null,
      });
      const limit = Math.max(1, Math.min(Number(input?.limit || 8), 20));
      return toJson({
        totalQuantity: snapshot.totalQuantity,
        productCount: snapshot.byProduct.length,
        byProductPreview: snapshot.byProduct.slice(0, limit),
      });
    },
  },
  {
    name: 'GetLowStockAlerts',
    domain: 'inventory',
    access: 'read',
    confirmationRequired: false,
    description: '读取低库存预警，帮助统一主 Agent 发现缺货风险',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '可选，按商品关键字过滤' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const result = await listLowStockAlerts(prisma, {
        keyword: input?.keyword,
      });
      return toJson(result);
    },
  },
  {
    name: 'GetTaxComplianceOverview',
    domain: 'trade-compliance',
    access: 'read',
    confirmationRequired: false,
    isComposite: true,
    description: '读取报关、收汇核销、退税三条税退链路的近期概览',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '每类返回数量，默认 5，最大 10' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const limit = Math.max(1, Math.min(Number(input?.limit || 5), 10));
      const [customs, forex, taxRefunds] = await Promise.all([
        customsDeclarationService.listCustomsDeclarations({ page: 1, pageSize: limit }),
        forexVerificationService.listForexVerifications({ page: 1, pageSize: limit }),
        taxRefundService.listTaxRefunds({ page: 1, pageSize: limit }),
      ]);

      return toJson({
        customsDeclarations: {
          total: customs.total,
          items: customs.items || [],
        },
        forexVerifications: {
          total: forex.total,
          items: forex.items || [],
        },
        taxRefunds: {
          total: taxRefunds.total,
          items: taxRefunds.items || [],
        },
      });
    },
  },
  {
    name: 'GetCustomsDeclarationDetail',
    domain: 'trade-compliance',
    access: 'read',
    confirmationRequired: false,
    description: '按报关单 ID 读取报关详情',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '报关单 ID' },
      },
      required: ['id'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const record = await customsDeclarationService.getCustomsDeclarationById(input?.id);
      return toJson(record);
    },
  },
  {
    name: 'GetTaxRefundDetail',
    domain: 'trade-compliance',
    access: 'read',
    confirmationRequired: false,
    description: '按退税记录 ID 读取退税详情',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '退税记录 ID' },
      },
      required: ['id'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const record = await taxRefundService.getTaxRefundById(input?.id);
      return toJson(record);
    },
  },
  {
    name: 'GetForexVerificationDetail',
    domain: 'trade-compliance',
    access: 'read',
    confirmationRequired: false,
    description: '按收汇核销记录 ID 读取核销详情',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '收汇核销记录 ID' },
      },
      required: ['id'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const record = await forexVerificationService.getForexVerificationById(input?.id);
      return toJson(record);
    },
  },
  {
    name: 'GetRecentEvents',
    domain: 'events',
    access: 'read',
    confirmationRequired: false,
    description: '读取最近系统事件、AI/Agent 事件和导入异常，帮助统一感知系统动态',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回事件数量，默认 10，最大 20' },
        category: { type: 'string', description: '可选，限定 AUDIT/IMPORT/AI/AGENT' },
        keyword: { type: 'string', description: '可选，按关键字过滤' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const limit = Math.max(1, Math.min(Number(input?.limit || 10), 20));
      const result = await eventLedgerService.listEventLedger(1, limit, {
        category: input?.category,
        keyword: input?.keyword,
      });
      return toJson({
        total: result.total,
        events: result.events,
      });
    },
  },
  {
    name: 'DiagnoseSalesContractFlow',
    domain: 'sales-export',
    access: 'read',
    confirmationRequired: false,
    isComposite: true,
    description: '按出口合同号做跨域诊断，聚合销售、回款、库存、报关、核销、退税链路并输出阻塞项与下一步动作',
    inputSchema: {
      type: 'object',
      properties: {
        contractNo: { type: 'string', description: '出口合同号，如 EXP2600001' },
      },
      required: ['contractNo'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      return toJson(await buildSalesContractFlowDiagnostic({ contractNo: input?.contractNo }));
    },
  },
  {
    name: 'DiagnosePurchaseExecution',
    domain: 'procurement',
    access: 'read',
    confirmationRequired: false,
    isComposite: true,
    description: '按采购合同号做跨域诊断，聚合采购、付款、供应商质量风险与入库执行状态',
    inputSchema: {
      type: 'object',
      properties: {
        contractNo: { type: 'string', description: '采购合同号，如 CG2600001' },
      },
      required: ['contractNo'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      return toJson(await buildPurchaseExecutionDiagnostic({ contractNo: input?.contractNo }));
    },
  },
  {
    name: 'DiagnoseTradeComplianceReadiness',
    domain: 'trade-compliance',
    access: 'read',
    confirmationRequired: false,
    isComposite: true,
    description: '按出口合同号判断报关、核销、退税链路的就绪度、缺口与下一步动作',
    inputSchema: {
      type: 'object',
      properties: {
        contractNo: { type: 'string', description: '出口合同号，如 EXP2600001' },
      },
      required: ['contractNo'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      return toJson(await buildTradeComplianceReadinessDiagnostic({ contractNo: input?.contractNo }));
    },
  },
  {
    name: 'GetOpsOverview',
    domain: 'ops',
    access: 'read',
    confirmationRequired: false,
    description: '读取导入记录和系统操作概览，帮助判断系统近期运行情况',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
      },
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const limit = Math.max(1, Math.min(Number(input?.limit || 10), 20));
      const imports = await importService.getImportRecords(1, limit, {});
      const recentLogs = await prisma.operationLog.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          actorType: true,
          action: true,
          entity: true,
          entityId: true,
          createdAt: true,
        },
      });
      return toJson({
        imports: imports.records || [],
        importTotal: imports.total || 0,
        recentLogs,
      });
    },
  },
  {
    name: 'GetExecutiveOverview',
    domain: 'executive',
    access: 'read',
    confirmationRequired: false,
    description: '读取老板视角经营摘要：财务、销售、采购、导入和系统操作的压缩概览',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call() {
      const [financeStats, salesCount, purchaseCount, latestImports] = await Promise.all([
        financeService.getStats(),
        prisma.salesContract.count(),
        prisma.purchaseContract.count(),
        importService.getImportRecords(1, 5, {}),
      ]);
      return toJson({
        finance: financeStats,
        salesContractCount: salesCount,
        purchaseContractCount: purchaseCount,
        latestImports: latestImports.records || [],
      });
    },
  },
  {
    name: 'GetSystemConfig',
    domain: 'system',
    access: 'read',
    confirmationRequired: false,
    description: '读取系统配置（如汇率 exchangeRate、利润率 profitRate 等）',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '配置键名，如 exchangeRate / profitRate' },
      },
      required: ['key'],
    },
    isReadOnly: true,
    isConcurrencySafe: true,
    async call(input) {
      const row = await prisma.systemConfig.findUnique({ where: { key: input.key } });
      if (!row) return toJson({ error: `配置项 ${input.key} 不存在` });
      try {
        return toJson({ key: row.key, value: JSON.parse(row.value), note: row.note });
      } catch {
        return toJson({ key: row.key, value: row.value, note: row.note });
      }
    },
  },
];

const WRITE_TOOL_SPECS = [
  {
    name: 'AllocatePayment',
    domain: 'finance',
    access: 'write',
    confirmationRequired: true,
    allowedRoles: [ROLES.ADMIN, ROLES.FINANCE],
    description: '将待分配收款挂到指定出口合同（需用户确认后执行）。调用前请先用 GetFinanceOverview 获取待分配收款列表。',
    inputSchema: {
      type: 'object',
      properties: {
        paymentId: { type: 'string', description: '待分配收款的 ID' },
        contractNo: { type: 'string', description: '目标出口合同号' },
        amount: { type: 'number', description: '分配金额（USD）' },
      },
      required: ['paymentId', 'contractNo', 'amount'],
    },
    isReadOnly: false,
    async call(input, { userId, collectedIds }) {
      const payment = await prisma.payment.findUnique({ where: { id: input.paymentId } });
      if (!payment) return toJson({ error: '收款记录不存在', paymentId: input.paymentId });

      const contract = await prisma.salesContract.findFirst({
        where: { contractNo: input.contractNo },
        select: { id: true, contractNo: true },
      });
      if (!contract) return toJson({ error: `合同 ${input.contractNo} 不存在` });

      return createPendingAction(userId, 'AllocatePayment', {
        paymentId: input.paymentId,
        salesContractId: contract.id,
        contractNo: input.contractNo,
        amount: Number(input.amount),
        customerName: payment.customerName || '未知客户',
      }, `将收款「${payment.customerName || '未知'}」¥${input.amount} 分配到合同 ${input.contractNo}`, collectedIds);
    },
  },
  {
    name: 'UpdateExportContractStatus',
    domain: 'sales-export',
    access: 'write',
    confirmationRequired: true,
    allowedRoles: [ROLES.ADMIN, ROLES.SALES],
    description: '更新出口合同状态（需用户确认后执行）。调用前请先用 GetExportOverview 确认当前状态。',
    inputSchema: {
      type: 'object',
      properties: {
        contractNo: { type: 'string', description: '出口合同号' },
        newStatus: { type: 'string', description: '新状态，如 SHIPPED / DELIVERED / COMPLETED' },
        note: { type: 'string', description: '变更备注（可选）' },
      },
      required: ['contractNo', 'newStatus'],
    },
    isReadOnly: false,
    async call(input, { userId, collectedIds }) {
      const contract = await prisma.salesContract.findFirst({
        where: { contractNo: input.contractNo },
        select: { id: true, contractNo: true, status: true },
      });
      if (!contract) return toJson({ error: `合同 ${input.contractNo} 不存在` });

      return createPendingAction(userId, 'UpdateExportContractStatus', {
        salesContractId: contract.id,
        contractNo: input.contractNo,
        oldStatus: contract.status,
        newStatus: input.newStatus,
        note: input.note || '',
      }, `将合同 ${input.contractNo} 状态从「${contract.status}」变更为「${input.newStatus}」`, collectedIds);
    },
  },
  {
    name: 'CreatePaymentRecord',
    domain: 'finance',
    access: 'write',
    confirmationRequired: true,
    allowedRoles: [ROLES.ADMIN, ROLES.FINANCE],
    description: '创建一条收/付款记录（需用户确认后执行）',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: '类型：RECEIVABLE_RECEIPT（收款）或 PAYABLE_PAYMENT（付款）' },
        amount: { type: 'number', description: '金额' },
        customerName: { type: 'string', description: '客户/供应商名称' },
        note: { type: 'string', description: '备注（建议包含合同号）' },
      },
      required: ['type', 'amount'],
    },
    isReadOnly: false,
    async call(input, { userId, collectedIds }) {
      const validTypes = ['RECEIVABLE_RECEIPT', 'PAYABLE_PAYMENT'];
      if (!validTypes.includes(input.type)) {
        return toJson({ error: `type 必须是 ${validTypes.join(' 或 ')}` });
      }
      const label = input.type === 'RECEIVABLE_RECEIPT' ? '收款' : '付款';
      return createPendingAction(userId, 'CreatePaymentRecord', {
        type: input.type,
        amount: Number(input.amount),
        customerName: input.customerName || '',
        note: input.note || '',
      }, `创建${label}记录：${input.customerName || ''}  ¥${input.amount}`, collectedIds);
    },
  },
  {
    name: 'UpdateSystemConfig',
    domain: 'system',
    access: 'write',
    confirmationRequired: true,
    allowedRoles: [ROLES.ADMIN],
    description: '修改系统配置（需用户确认后执行）。常用配置键：exchangeRate（汇率，值为 JSON {rate, buffer}）、profitRate（利润率）。',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '配置键名，如 exchangeRate / profitRate' },
        value: { type: 'string', description: '新值（字符串或 JSON 字符串）' },
        note: { type: 'string', description: '变更说明' },
      },
      required: ['key', 'value'],
    },
    isReadOnly: false,
    async call(input, { userId, collectedIds }) {
      const existing = await prisma.systemConfig.findUnique({ where: { key: input.key } });
      const oldDisplay = existing ? existing.value : '（不存在）';

      let displayValue = input.value;
      if (input.key === 'exchangeRate') {
        const numVal = Number(input.value);
        if (Number.isFinite(numVal) && numVal > 0) {
          let buffer = 0.2;
          if (existing) {
            try { buffer = JSON.parse(existing.value).buffer || 0.2; } catch { /* keep default */ }
          }
          const assembled = { rate: numVal, buffer, effectiveRate: numVal - buffer };
          displayValue = JSON.stringify(assembled);
        }
      }

      return createPendingAction(userId, 'UpdateSystemConfig', {
        key: input.key,
        value: displayValue,
        note: input.note || `Agent 修改 ${input.key}`,
        oldValue: oldDisplay,
      }, `将系统配置「${input.key}」从 ${oldDisplay} 修改为 ${displayValue}`, collectedIds);
    },
  },
  {
    name: 'CreateSupplierRecord',
    domain: 'procurement',
    access: 'write',
    confirmationRequired: true,
    allowedRoles: [ROLES.ADMIN, ROLES.PURCHASE],
    description: '创建供应商记录（需用户确认后执行）',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        shortName: { type: 'string' },
        contactName: { type: 'string' },
        contactPhone: { type: 'string' },
        contactEmail: { type: 'string' },
      },
      required: ['name'],
    },
    isReadOnly: false,
    async call(input, { userId, collectedIds }) {
      const name = String(input?.name || '').trim();
      if (!name) return toJson({ error: '供应商名称不能为空' });
      return createPendingAction(userId, 'CreateSupplierRecord', {
        name,
        shortName: input?.shortName || null,
        contactName: input?.contactName || null,
        contactPhone: input?.contactPhone || null,
        contactEmail: input?.contactEmail || null,
      }, `创建供应商「${name}」`, collectedIds);
    },
  },
  {
    name: 'UpdateSupplierRecord',
    domain: 'procurement',
    access: 'write',
    confirmationRequired: true,
    allowedRoles: [ROLES.ADMIN, ROLES.PURCHASE],
    description: '更新供应商记录（需用户确认后执行）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        shortName: { type: 'string' },
        contactName: { type: 'string' },
        contactPhone: { type: 'string' },
        contactEmail: { type: 'string' },
      },
      required: ['id'],
    },
    isReadOnly: false,
    async call(input, { userId, collectedIds }) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: input?.id },
        select: { id: true, name: true },
      });
      if (!supplier) return toJson({ error: '供应商不存在', id: input?.id });
      return createPendingAction(userId, 'UpdateSupplierRecord', {
        id: supplier.id,
        input: {
          name: input?.name,
          shortName: input?.shortName,
          contactName: input?.contactName,
          contactPhone: input?.contactPhone,
          contactEmail: input?.contactEmail,
        },
      }, `更新供应商「${supplier.name}」`, collectedIds);
    },
  },
  {
    name: 'CreatePurchaseContract',
    domain: 'procurement',
    access: 'write',
    confirmationRequired: true,
    allowedRoles: [ROLES.ADMIN, ROLES.PURCHASE],
    description: '创建采购合同及明细（需用户确认后执行）',
    inputSchema: {
      type: 'object',
      properties: {
        supplierId: { type: 'string' },
        taxRate: { type: 'number' },
        signedAt: { type: 'string' },
        expectedDate: { type: 'string' },
        note: { type: 'string' },
        items: { type: 'array', items: { type: 'object' } },
      },
      required: ['supplierId', 'items'],
    },
    isReadOnly: false,
    async call(input, { userId, collectedIds }) {
      if (!input?.supplierId) return toJson({ error: 'supplierId 不能为空' });
      if (!Array.isArray(input?.items) || input.items.length === 0) {
        return toJson({ error: '至少提供一条采购明细' });
      }
      const supplier = await prisma.supplier.findUnique({
        where: { id: input.supplierId },
        select: { id: true, name: true },
      });
      if (!supplier) return toJson({ error: '供应商不存在', supplierId: input.supplierId });
      return createPendingAction(userId, 'CreatePurchaseContract', {
        input: {
          supplierId: input.supplierId,
          taxRate: input.taxRate,
          signedAt: input.signedAt,
          expectedDate: input.expectedDate,
          note: input.note,
          items: input.items,
        },
      }, `为供应商「${supplier.name}」创建采购合同`, collectedIds);
    },
  },
  {
    name: 'UpdatePurchaseContract',
    domain: 'procurement',
    access: 'write',
    confirmationRequired: true,
    allowedRoles: [ROLES.ADMIN, ROLES.PURCHASE],
    description: '更新采购合同头信息（需用户确认后执行）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        taxRate: { type: 'number' },
        signedAt: { type: 'string' },
        expectedDate: { type: 'string' },
        invoiceNo: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['id'],
    },
    isReadOnly: false,
    async call(input, { userId, collectedIds }) {
      const contract = await prisma.purchaseContract.findUnique({
        where: { id: input?.id },
        select: { id: true, contractNo: true },
      });
      if (!contract) return toJson({ error: '采购合同不存在', id: input?.id });
      return createPendingAction(userId, 'UpdatePurchaseContract', {
        id: contract.id,
        input: {
          taxRate: input?.taxRate,
          signedAt: input?.signedAt,
          expectedDate: input?.expectedDate,
          invoiceNo: input?.invoiceNo,
          note: input?.note,
        },
      }, `更新采购合同「${contract.contractNo}」`, collectedIds);
    },
  },
  {
    name: 'UpdateInventoryStatus',
    domain: 'inventory',
    access: 'write',
    confirmationRequired: true,
    allowedRoles: [ROLES.ADMIN, ROLES.WAREHOUSE],
    description: '更新单条库存状态（需用户确认后执行）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string' },
      },
      required: ['id', 'status'],
    },
    isReadOnly: false,
    async call(input, { userId, collectedIds }) {
      const inventory = await prisma.inventory.findUnique({
        where: { id: input?.id },
        select: { id: true, status: true, salesContractId: true },
      });
      if (!inventory) return toJson({ error: '库存记录不存在', id: input?.id });
      const validationResult = validateInventoryTransition(inventory.status, input?.status, inventory);
      if (!validationResult.valid) {
        return toJson({ error: validationResult.message || '非法库存状态流转' });
      }
      return createPendingAction(userId, 'UpdateInventoryStatus', {
        id: inventory.id,
        status: input.status,
      }, `将库存 ${inventory.id} 状态从「${inventory.status}」改为「${input.status}」`, collectedIds);
    },
  },
  {
    name: 'CreateCustomsDeclarationDraft',
    domain: 'trade-compliance',
    access: 'write',
    confirmationRequired: true,
    allowedRoles: [ROLES.ADMIN, ROLES.SALES, ROLES.FINANCE, ROLES.WAREHOUSE],
    description: '为出口合同创建报关草稿（需用户确认后执行）',
    inputSchema: {
      type: 'object',
      properties: {
        salesContractId: { type: 'string' },
        contractNo: { type: 'string' },
        totalAmount: { type: 'number' },
        totalQuantity: { type: 'number' },
        currency: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['salesContractId'],
    },
    isReadOnly: false,
    async call(input, { userId, collectedIds }) {
      const contract = await prisma.salesContract.findUnique({
        where: { id: input?.salesContractId },
        select: { id: true, contractNo: true, totalAmount: true },
      });
      if (!contract) return toJson({ error: '出口合同不存在', id: input?.salesContractId });
      const existing = await prisma.customsDeclaration.findFirst({
        where: { salesContractId: contract.id, status: { not: 'VOID' } },
        select: { id: true, declarationNo: true },
      });
      if (existing) return toJson({ error: `合同 ${contract.contractNo} 已存在报关单 ${existing.declarationNo}` });
      return createPendingAction(userId, 'CreateCustomsDeclarationDraft', {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        totalAmount: Number(input?.totalAmount ?? contract.totalAmount ?? 0),
        totalQuantity: Number(input?.totalQuantity || 0),
        currency: input?.currency || 'USD',
        note: input?.note || 'Agent 创建报关草稿',
      }, `为合同 ${contract.contractNo} 创建报关草稿`, collectedIds);
    },
  },
  {
    name: 'CreateForexVerificationDraft',
    domain: 'trade-compliance',
    access: 'write',
    confirmationRequired: true,
    allowedRoles: [ROLES.ADMIN, ROLES.SALES, ROLES.FINANCE],
    description: '为出口合同创建收汇核销草稿（需用户确认后执行）',
    inputSchema: {
      type: 'object',
      properties: {
        salesContractId: { type: 'string' },
        contractNo: { type: 'string' },
        customsDeclarationId: { type: 'string' },
        receivedAmount: { type: 'number' },
        currency: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['salesContractId', 'receivedAmount'],
    },
    isReadOnly: false,
    async call(input, { userId, collectedIds }) {
      const contract = await prisma.salesContract.findUnique({
        where: { id: input?.salesContractId },
        select: { id: true, contractNo: true, receivedAmount: true },
      });
      if (!contract) return toJson({ error: '出口合同不存在', id: input?.salesContractId });
      const existing = await prisma.forexVerification.findFirst({
        where: { salesContractId: contract.id },
        select: { id: true, verificationNo: true },
      });
      if (existing) return toJson({ error: `合同 ${contract.contractNo} 已存在核销记录 ${existing.verificationNo}` });
      return createPendingAction(userId, 'CreateForexVerificationDraft', {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        customsDeclarationId: input?.customsDeclarationId || null,
        receivedAmount: Number(input?.receivedAmount ?? contract.receivedAmount ?? 0),
        currency: input?.currency || 'USD',
        note: input?.note || 'Agent 创建收汇核销草稿',
      }, `为合同 ${contract.contractNo} 创建收汇核销草稿`, collectedIds);
    },
  },
  {
    name: 'CreateTaxRefundDraft',
    domain: 'trade-compliance',
    access: 'write',
    confirmationRequired: true,
    allowedRoles: [ROLES.ADMIN, ROLES.SALES, ROLES.FINANCE],
    description: '为出口合同创建退税草稿（需用户确认后执行）',
    inputSchema: {
      type: 'object',
      properties: {
        salesContractId: { type: 'string' },
        contractNo: { type: 'string' },
        customsDeclarationId: { type: 'string' },
        forexVerificationId: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['salesContractId', 'customsDeclarationId'],
    },
    isReadOnly: false,
    async call(input, { userId, collectedIds }) {
      const contract = await prisma.salesContract.findUnique({
        where: { id: input?.salesContractId },
        select: { id: true, contractNo: true },
      });
      if (!contract) return toJson({ error: '出口合同不存在', id: input?.salesContractId });
      const existing = await prisma.taxRefund.findFirst({
        where: { salesContractId: contract.id, customsDeclarationId: input?.customsDeclarationId },
        select: { id: true, refundNo: true },
      });
      if (existing) return toJson({ error: `合同 ${contract.contractNo} 已存在退税记录 ${existing.refundNo}` });
      return createPendingAction(userId, 'CreateTaxRefundDraft', {
        salesContractId: contract.id,
        contractNo: contract.contractNo,
        customsDeclarationId: input?.customsDeclarationId,
        forexVerificationId: input?.forexVerificationId || null,
        note: input?.note || 'Agent 创建退税草稿',
      }, `为合同 ${contract.contractNo} 创建退税草稿`, collectedIds);
    },
  },
];

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
 * @returns {string} JSON 字符串，agent 会拿到此结果
 */
const createPendingAction = (userId, actionType, params, description, collectedIds) => {
  const actionId = `pa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  pendingActionStore.set(actionId, {
    actionType,
    params,
    description,
    userId,
    createdAt: Date.now(),
    status: 'pending',
    sessionId: null,
  });
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
const buildWriteToolPool = (defineTool, userId, userRole, collectedIds, traceStore, toolSpecs = WRITE_TOOL_SPECS) => toolSpecs.map((tool) => defineTool({
  name: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  isReadOnly: tool.isReadOnly,
  async call(input) {
    const startedAt = Date.now();
    try {
      assertToolAllowedForRole(tool.name, userRole);
      const result = await tool.call(input || {}, { userId, collectedIds });
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
    await salesService.updateSalesContract(params.salesContractId, {
      status: params.newStatus,
    });
    return { success: true, detail: `合同 ${params.contractNo} 状态已更新为 ${params.newStatus}` };
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
    const updateData = { status: params.status };
    if (params.status === 'INBOUND') {
      updateData.inboundAt = new Date();
    } else if (params.status === 'OUTBOUND') {
      updateData.outboundAt = new Date();
    }
    const record = await prisma.inventory.update({
      where: { id: params.id },
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
const executeAction = async (actionId, userId) => {
  const action = pendingActionStore.get(actionId);
  if (!action) throw createError('该操作已过期或不存在，请重新向 Agent 提问', 404);
  if (action.userId !== userId) throw createError('无权执行此操作', 403);
  if (action.status !== 'pending') throw createError(`该操作已${action.status === 'executed' ? '执行' : '取消'}`, 409);

  const executor = ACTION_EXECUTORS[action.actionType];
  if (!executor) throw createError(`不支持的操作类型: ${action.actionType}`, 400);

  try {
    const result = await executor(action.params, userId);
    action.status = 'executed';
    action.executedAt = Date.now();

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
          params: action.params,
          result: { success: result.success, detail: result.detail },
        }),
      },
    });

    return { actionId, actionType: action.actionType, description: action.description, ...result };
  } catch (error) {
    action.status = 'failed';
    action.failedAt = Date.now();
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
  const action = pendingActionStore.get(actionId);
  if (!action) return;
  if (action.userId !== userId) return;
  if (action.status !== 'pending') return;
  action.status = 'cancelled';
  action.cancelledAt = Date.now();
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
    const result = await agent.prompt(message);

    const actionRecommendations = summarizeActionRecommendations(actionRecommendationTrace);
    materializeRecommendationPendingActions({
      userId,
      collectedIds: collectedActionIds,
      recommendations: actionRecommendations,
    });
    const pendingActions = collectedActionIds
      .map((id) => {
        const action = pendingActionStore.get(id);
        if (!action) return null;
        action.sessionId = resolvedSessionId;
        return {
          actionId: id,
          actionType: action.actionType,
          description: action.description,
          params: action.params,
        };
      })
      .filter(Boolean);

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
      pendingActionSummary: pendingActions.map((item) => ({
        actionId: item.actionId,
        actionType: item.actionType,
        description: item.description,
        status: 'pending',
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
          usage = {
            input_tokens: ev.usage?.input_tokens ?? 0,
            output_tokens: ev.usage?.output_tokens ?? 0,
          };
          break;
      }
    }

    const actionRecommendations = summarizeActionRecommendations(actionRecommendationTrace);
    materializeRecommendationPendingActions({
      userId,
      collectedIds: collectedActionIds,
      recommendations: actionRecommendations,
    });
    const pendingActions = collectedActionIds
      .map((id) => {
        const action = pendingActionStore.get(id);
        if (!action) return null;
        action.sessionId = resolvedSessionId;
        return {
          actionId: id,
          actionType: action.actionType,
          description: action.description,
          params: action.params,
        };
      })
      .filter(Boolean);

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
      pendingActionSummary: pendingActions.map((item) => ({
        actionId: item.actionId,
        actionType: item.actionType,
        description: item.description,
        status: 'pending',
      })),
    });

    // 4. 发送完成事件
    yield {
      type: 'done',
      sessionId: resolvedSessionId,
      model: runtimeConfig.model,
      pendingActions,
      usage,
      routePlan,
      toolTraceSummary: summarizeToolTrace(toolTrace),
      actionRecommendations,
    };
  } finally {
    await agent.close();
  }
}

module.exports = {
  SUPPORTED_AGENT_TYPES,
  PRIMARY_AGENT_TYPE,
  LEGACY_AGENT_TYPES,
  getAgentPreset,
  buildSpecialistFrame,
  resolveSystemPrompt,
  inferRoutePlan,
  listToolRegistry,
  buildToolRegistryPayload,
  buildSalesContractFlowDiagnostic,
  buildPurchaseExecutionDiagnostic,
  buildTradeComplianceReadinessDiagnostic,
  isToolAllowedForRole,
  materializeRecommendationPendingActions,
  summarizeToolTrace,
  buildAgentRunMetadata,
  buildReplaySnapshotLogValue,
  buildReplaySummaryRecord,
  resolveSdkSessionConfig,
  persistAgentRun,
  runAgentPrompt,
  runAgentPromptStream,
  executeAction,
  cancelAction,
};
