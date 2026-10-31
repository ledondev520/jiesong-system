/**
 * Input: openAgentService 注入的诊断/常量与业务服务层
 * Output: Agent 只读工具定义（READ_TOOL_SPECS）
 * Pos: 后端 Agent Runtime 工具层
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 * 纯搬移自 openAgentService.js，行为不变。
 */

const prisma = require('../../../utils/prisma');
const { currentRates } = require('../../exportPricing');
const financeService = require('../../financeService');
const salesService = require('../../salesService');
const importService = require('../../importService');
const { searchEntities } = require('../../../agent/commands/query');
const { getInventorySnapshot } = require('../../inventorySnapshot');
const { listLowStockAlerts } = require('../../inventoryAlertService');
const customsDeclarationService = require('../../customsDeclarationService');
const taxRefundService = require('../../taxRefundService');
const forexVerificationService = require('../../forexVerificationService');
const eventLedgerService = require('../../eventLedgerService');

module.exports = ({
  toJson,
  buildSalesContractFlowDiagnostic,
  buildPurchaseExecutionDiagnostic,
  buildTradeComplianceReadinessDiagnostic,
  PRICING_CONFIG_KEYS,
  AGENT_HIDDEN_CONFIG_KEYS,
}) => [
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
            isActive: true,
            OR: [
              { name: { contains: keyword } },
              { shortName: { contains: keyword } },
            ],
          }
        : { isActive: true };

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
      const sourceParties = salesService.getThirdPartySources(contract.packingItems || []);
      return toJson({
        id: contract.id,
        contractNo: contract.contractNo,
        status: contract.status,
        totalAmount: contract.totalAmount,
        receivedAmount: contract.receivedAmount,
        port: contract.port || null,
        hasThirdPartyCargo: sourceParties.length > 0,
        sourceParties,
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
    description: '读取系统配置（汇率 exchangeRate、利润率 profitRate 取自报价配置）',
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
      // 汇率/加价：只读唯一报价配置（遗留 SystemConfig 行不再作为来源）
      if (PRICING_CONFIG_KEYS.includes(input.key)) {
        const rates = currentRates();
        return toJson({ key: input.key, value: input.key === 'exchangeRate'
          ? { rate: rates.spotRate, buffer: -rates.adjustment, effectiveRate: rates.effectiveRate }
          : 1 + rates.defaultMarkup, note: '来自报价配置' });
      }
      // Restricted company bank details are not exposed to the AI assistant.
      // 旧 invoiceTitleInfo 文本可能含开户行及账号，同样不可读。
      if (AGENT_HIDDEN_CONFIG_KEYS.includes(input.key)) return toJson({ error: '该配置项不可通过助手读取' });
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
