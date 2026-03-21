/**
 * Input: Inventory, SalesContract, Product, SystemConfig
 * Output: 经营执行中台 API
 * Pos: 控制器层，提供未发货聚合、负责人分发与采购清单模板能力
 */

const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { paginated, success } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');

const ASSIGNMENT_CONFIG_KEY = 'ops_execution_unshipped_assignments';
const PURCHASE_TEMPLATE_CONFIG_KEY = 'ops_execution_purchase_templates';

const DEFAULT_PURCHASE_TEMPLATES = [
  {
    templateId: '标准店:筹备期',
    templateName: '标准店-筹备期',
    storeType: '标准店',
    openingStage: '筹备期',
    items: [
      { id: 'std-prep-1', category: '前厅', itemName: '收银台', quantity: 1, unit: '套', notes: '基础配置', required: true },
      { id: 'std-prep-2', category: '前厅', itemName: '餐桌', quantity: 12, unit: '张', notes: '按 48 座位配置', required: true },
      { id: 'std-prep-3', category: '前厅', itemName: '餐椅', quantity: 48, unit: '把', notes: '按餐桌位配置', required: true },
      { id: 'std-prep-4', category: '后厨', itemName: '备餐工作台', quantity: 2, unit: '台', notes: '含操作台面', required: false },
    ],
  },
  {
    templateId: '标准店:试营业',
    templateName: '标准店-试营业',
    storeType: '标准店',
    openingStage: '试营业',
    items: [
      { id: 'std-soft-1', category: '前厅', itemName: '补充餐具组', quantity: 60, unit: '套', notes: '覆盖首周损耗', required: true },
      { id: 'std-soft-2', category: '后厨', itemName: '打包盒', quantity: 300, unit: '个', notes: '外带需求', required: true },
      { id: 'std-soft-3', category: '物料', itemName: '开业海报', quantity: 4, unit: '张', notes: '门店导视', required: false },
    ],
  },
  {
    templateId: '旗舰店:筹备期',
    templateName: '旗舰店-筹备期',
    storeType: '旗舰店',
    openingStage: '筹备期',
    items: [
      { id: 'flag-prep-1', category: '前厅', itemName: '收银台', quantity: 2, unit: '套', notes: '双收银位', required: true },
      { id: 'flag-prep-2', category: '前厅', itemName: '展示柜', quantity: 3, unit: '组', notes: '旗舰形象区', required: true },
      { id: 'flag-prep-3', category: '后厨', itemName: '冷藏操作台', quantity: 2, unit: '台', notes: '按后厨双线配置', required: true },
      { id: 'flag-prep-4', category: '物料', itemName: '导视灯箱', quantity: 6, unit: '块', notes: '品牌导视', required: false },
    ],
  },
];

const parseOptionalText = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
};

const safeJsonParse = (value, fallback) => {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const loadJsonConfig = async (key, fallback) => {
  const config = await prisma.systemConfig.findUnique({
    where: { key },
  });

  return safeJsonParse(config?.value, fallback);
};

const saveJsonConfig = async (key, value, note) => {
  await prisma.systemConfig.upsert({
    where: { key },
    create: {
      key,
      value: JSON.stringify(value),
      note,
    },
    update: {
      value: JSON.stringify(value),
      note,
    },
  });
};

const loadAssignments = async () => {
  const assignments = await loadJsonConfig(ASSIGNMENT_CONFIG_KEY, {});
  return assignments && typeof assignments === 'object' ? assignments : {};
};

const buildAssignmentKey = (salesContractId, productId, status) => (
  `${salesContractId}:${productId}:${status}`
);

const normalizeChecklistItems = (items = []) => (
  Array.isArray(items)
    ? items
      .map((item, index) => ({
        id: parseOptionalText(item.id) || `item-${index + 1}`,
        category: parseOptionalText(item.category) || '未分类',
        itemName: parseOptionalText(item.itemName),
        quantity: Number(item.quantity) || 0,
        unit: parseOptionalText(item.unit) || '项',
        notes: parseOptionalText(item.notes),
        required: item.required !== false,
      }))
      .filter((item) => item.itemName)
    : []
);

const mergePurchaseTemplates = async () => {
  const customTemplates = await loadJsonConfig(PURCHASE_TEMPLATE_CONFIG_KEY, []);
  const templateMap = new Map(
    DEFAULT_PURCHASE_TEMPLATES.map((template) => [`${template.storeType}:${template.openingStage}`, template]),
  );

  if (Array.isArray(customTemplates)) {
    customTemplates.forEach((template) => {
      const key = `${template.storeType}:${template.openingStage}`;
      templateMap.set(key, {
        templateId: parseOptionalText(template.templateId) || key,
        templateName: parseOptionalText(template.templateName) || key,
        storeType: parseOptionalText(template.storeType),
        openingStage: parseOptionalText(template.openingStage),
        items: normalizeChecklistItems(template.items),
      });
    });
  }

  return Array.from(templateMap.values());
};

const summarizeChecklist = (items = []) => ({
  totalItems: items.length,
  requiredCount: items.filter((item) => item.required).length,
  optionalCount: items.filter((item) => !item.required).length,
});

const getUnshippedList = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 50, maxPageSize: 200 });
    const keyword = parseOptionalText(req.query.keyword).toLowerCase();
    const statusFilter = parseOptionalText(req.query.status).toUpperCase();
    const assigneeNameFilter = parseOptionalText(req.query.assigneeName).toLowerCase();

    const [inventories, assignments] = await Promise.all([
      prisma.inventory.findMany({
        where: {
          salesContractId: { not: null },
          status: statusFilter || { not: 'OUTBOUND' },
          ...(statusFilter ? {} : { NOT: { status: 'OUTBOUND' } }),
        },
        include: {
          product: {
            select: {
              id: true,
              customsName: true,
              hsCode: true,
              unit: true,
            },
          },
          salesContract: {
            select: {
              id: true,
              contractNo: true,
              status: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      loadAssignments(),
    ]);

    const grouped = new Map();

    inventories.forEach((item) => {
      if (!item.salesContractId) {
        return;
      }

      const key = buildAssignmentKey(item.salesContractId, item.productId, item.status);
      const current = grouped.get(key);
      const latestUpdatedAt = item.updatedAt instanceof Date
        ? item.updatedAt.toISOString()
        : new Date(item.updatedAt).toISOString();

      if (!current) {
        grouped.set(key, {
          key,
          salesContractId: item.salesContractId,
          orderNo: item.salesContract?.contractNo || '-',
          productId: item.productId,
          skuName: item.product?.customsName || '-',
          skuCode: item.product?.hsCode || '-',
          status: item.status,
          quantity: item.quantity || 0,
          unit: item.product?.unit || item.unit || '',
          recordCount: 1,
          assigneeName: assignments[key]?.assigneeName || '',
          assigneeUpdatedAt: assignments[key]?.updatedAt || '',
          latestUpdatedAt,
        });
        return;
      }

      current.quantity += item.quantity || 0;
      current.recordCount += 1;
      if (latestUpdatedAt > current.latestUpdatedAt) {
        current.latestUpdatedAt = latestUpdatedAt;
      }
    });

    const filtered = Array.from(grouped.values()).filter((item) => {
      const matchesKeyword = !keyword
        || item.orderNo.toLowerCase().includes(keyword)
        || item.skuName.toLowerCase().includes(keyword)
        || item.skuCode.toLowerCase().includes(keyword);
      const matchesAssignee = !assigneeNameFilter
        || item.assigneeName.toLowerCase().includes(assigneeNameFilter);
      return matchesKeyword && matchesAssignee;
    }).sort((a, b) => {
      if (a.assigneeName && !b.assigneeName) {
        return 1;
      }
      if (!a.assigneeName && b.assigneeName) {
        return -1;
      }
      return b.latestUpdatedAt.localeCompare(a.latestUpdatedAt);
    });

    const items = filtered.slice(skip, skip + pageSize);
    const totalOrders = new Set(filtered.map((item) => item.salesContractId)).size;
    const totalQuantity = filtered.reduce((sum, item) => sum + item.quantity, 0);
    const unassignedItems = filtered.filter((item) => !item.assigneeName).length;

    paginated(res, items, filtered.length, page, pageSize, {
      summary: {
        totalItems: filtered.length,
        totalOrders,
        totalQuantity,
        unassignedItems,
      },
    });
  } catch (error) {
    next(error);
  }
};

const assignUnshippedAssignee = async (req, res, next) => {
  try {
    const salesContractId = parseOptionalText(req.body.salesContractId);
    const productId = parseOptionalText(req.body.productId);
    const status = parseOptionalText(req.body.status).toUpperCase();
    const assigneeName = parseOptionalText(req.body.assigneeName);

    if (!salesContractId || !productId || !status || !assigneeName) {
      throw createError('salesContractId、productId、status、assigneeName 不能为空', 400);
    }

    const assignments = await loadAssignments();
    const key = buildAssignmentKey(salesContractId, productId, status);
    const updatedAt = new Date().toISOString();

    assignments[key] = {
      assigneeName,
      updatedAt,
    };

    await saveJsonConfig(ASSIGNMENT_CONFIG_KEY, assignments, '经营执行中台未发货负责人映射');

    success(res, {
      key,
      salesContractId,
      productId,
      status,
      assigneeName,
      updatedAt,
    }, '负责人分发成功');
  } catch (error) {
    next(error);
  }
};

const getPurchaseChecklistTemplates = async (req, res, next) => {
  try {
    const templates = await mergePurchaseTemplates();
    success(res, templates);
  } catch (error) {
    next(error);
  }
};

const savePurchaseChecklistTemplate = async (req, res, next) => {
  try {
    const storeType = parseOptionalText(req.body.storeType);
    const openingStage = parseOptionalText(req.body.openingStage);
    const templateName = parseOptionalText(req.body.templateName) || `${storeType}-${openingStage}`;
    const items = normalizeChecklistItems(req.body.items);

    if (!storeType || !openingStage || items.length === 0) {
      throw createError('storeType、openingStage 和 items 不能为空', 400);
    }

    const customTemplates = await loadJsonConfig(PURCHASE_TEMPLATE_CONFIG_KEY, []);
    const nextTemplates = Array.isArray(customTemplates) ? customTemplates.slice() : [];
    const templateId = `${storeType}:${openingStage}`;
    const nextTemplate = {
      templateId,
      templateName,
      storeType,
      openingStage,
      items,
    };
    const existingIndex = nextTemplates.findIndex((template) => `${template.storeType}:${template.openingStage}` === templateId);
    if (existingIndex >= 0) {
      nextTemplates[existingIndex] = nextTemplate;
    } else {
      nextTemplates.push(nextTemplate);
    }

    await saveJsonConfig(PURCHASE_TEMPLATE_CONFIG_KEY, nextTemplates, '经营执行中台采购清单模板');
    success(res, nextTemplate, '采购清单模板已保存');
  } catch (error) {
    next(error);
  }
};

const generatePurchaseChecklist = async (req, res, next) => {
  try {
    const storeType = parseOptionalText(req.body.storeType || req.query.storeType);
    const openingStage = parseOptionalText(req.body.openingStage || req.query.openingStage);

    if (!storeType || !openingStage) {
      throw createError('storeType 和 openingStage 不能为空', 400);
    }

    const templates = await mergePurchaseTemplates();
    const selectedTemplate = templates.find((template) => (
      template.storeType === storeType && template.openingStage === openingStage
    ));

    if (!selectedTemplate) {
      throw createError('未找到对应的采购清单模板', 404);
    }

    success(res, {
      ...selectedTemplate,
      summary: summarizeChecklist(selectedTemplate.items),
    });
  } catch (error) {
    next(error);
  }
};

const exportPurchaseChecklist = async (req, res, next) => {
  try {
    const storeType = parseOptionalText(req.body.storeType);
    const openingStage = parseOptionalText(req.body.openingStage);
    const templateName = parseOptionalText(req.body.templateName);
    const items = normalizeChecklistItems(req.body.items);

    if (!storeType || !openingStage || items.length === 0) {
      throw createError('导出采购清单缺少必要字段', 400);
    }

    const headers = ['店型', '开店阶段', '分类', '采购项', '数量', '单位', '是否必备', '备注'];
    const rows = items.map((item) => [
      storeType,
      openingStage,
      item.category,
      item.itemName,
      item.quantity,
      item.unit,
      item.required ? '是' : '否',
      item.notes || '',
    ]);
    const csv = `\uFEFF${[headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')}`;

    const filename = encodeURIComponent(`${templateName || `${storeType}-${openingStage}`}_采购清单.csv`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${filename}`);
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUnshippedList,
  assignUnshippedAssignee,
  getPurchaseChecklistTemplates,
  savePurchaseChecklistTemplate,
  generatePurchaseChecklist,
  exportPurchaseChecklist,
};
