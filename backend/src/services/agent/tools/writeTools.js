/**
 * Input: openAgentService 注入的诊断/常量与业务服务层
 * Output: Agent 写工具定义（WRITE_TOOL_SPECS）
 * Pos: 后端 Agent Runtime 工具层
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 * 纯搬移自 openAgentService.js，行为不变。
 */

const prisma = require('../../../utils/prisma');
const { ROLES } = require('../../../config/constants');
const { validateInventoryTransition } = require('../../../utils/inventoryStateMachine');

module.exports = ({
  toJson,
  createPendingAction,
  PRICING_CONFIG_KEYS,
  PRICING_CONFIG_REFUSAL,
  SELLER_CONFIG_KEYS,
  SELLER_CONFIG_REFUSAL,
}) => [
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
    description: '修改普通系统配置（需用户确认后执行）。汇率、加价等报价参数不可通过本工具修改，由「报价配置」统一维护。',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '配置键名（不含报价参数 exchangeRate / profitRate）' },
        value: { type: 'string', description: '新值（字符串或 JSON 字符串）' },
        note: { type: 'string', description: '变更说明' },
      },
      required: ['key', 'value'],
    },
    isReadOnly: false,
    async call(input, { userId, collectedIds }) {
      if (PRICING_CONFIG_KEYS.includes(input.key)) return toJson({ error: PRICING_CONFIG_REFUSAL });
      if (SELLER_CONFIG_KEYS.includes(input.key)) return toJson({ error: SELLER_CONFIG_REFUSAL });
      const existing = await prisma.systemConfig.findUnique({ where: { key: input.key } });
      const oldDisplay = existing ? existing.value : '（不存在）';
      const displayValue = input.value;

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
    confirmationRequired: false,
    allowedRoles: [ROLES.ADMIN, ROLES.PURCHASE],
    description: '按用户请求直接创建内部采购草稿及明细，不签约或付款；先查询已有草稿，避免跨轮重复创建',
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
        select: { id: true, status: true, salesContractId: true, purchaseItemId: true, receiptInspectionId: true },
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
    confirmationRequired: false,
    allowedRoles: [ROLES.ADMIN, ROLES.SALES, ROLES.FINANCE, ROLES.WAREHOUSE],
    description: '按用户请求直接创建内部报关草稿，不进行正式报关',
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
    confirmationRequired: false,
    allowedRoles: [ROLES.ADMIN, ROLES.SALES, ROLES.FINANCE],
    description: '按用户请求直接创建内部收汇核销草稿，不代表银行或官方已核销',
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
    confirmationRequired: false,
    allowedRoles: [ROLES.ADMIN, ROLES.SALES, ROLES.FINANCE],
    description: '按用户请求直接创建内部退税草稿，不提交税局',
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
