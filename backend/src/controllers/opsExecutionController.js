/**
 * Input: Inventory, SalesContract, Product, SystemConfig
 * Output: 经营执行中台 API
 * Pos: 控制器层，提供未发货聚合与负责人分发能力
 */

const { randomUUID } = require('node:crypto');
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { paginated, success } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');

const ASSIGNMENT_CONFIG_KEY = 'ops_execution_unshipped_assignments';
const PURCHASE_TEMPLATE_CONFIG_KEY = 'ops_execution_purchase_templates';
const TASK_CONFIG_KEY = 'ops_execution_tasks';

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

const PRIORITY_ORDER = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

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

const parseNaturalLanguageDateTime = (input, now = new Date()) => {
  const text = parseOptionalText(input);
  const absoluteMatch = text.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})[日\s]+(\d{1,2})(?:[:点时](\d{1,2}))?/);
  if (absoluteMatch) {
    const [, year, month, day, hour, minute] = absoluteMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute || 0),
      0,
      0,
    );
  }

  const dayOffset = text.includes('后天') ? 2 : text.includes('明天') ? 1 : 0;
  const relativeMentioned = /(今天|明天|后天)/.test(text);
  const timeMatch = text.match(/(上午|下午|晚上|中午)?\s*(\d{1,2})(?:[:点时](\d{1,2})|点半)?/);

  if (!relativeMentioned && !timeMatch) {
    return null;
  }

  const dueAt = new Date(now);
  dueAt.setHours(10, 0, 0, 0);
  dueAt.setDate(dueAt.getDate() + dayOffset);

  if (timeMatch) {
    const meridiem = timeMatch[1] || '';
    let hour = Number(timeMatch[2]);
    let minute = Number(timeMatch[3] || 0);
    if (timeMatch[0].includes('点半')) {
      minute = 30;
    }
    if ((meridiem === '下午' || meridiem === '晚上') && hour < 12) {
      hour += 12;
    }
    if (meridiem === '中午' && hour < 11) {
      hour += 12;
    }
    dueAt.setHours(hour, minute, 0, 0);
  }

  return dueAt;
};

const inferPriority = (input) => {
  const text = parseOptionalText(input);
  if (/紧急|高优先级|优先|P0|P1/.test(text)) {
    return 'HIGH';
  }
  if (/低优先级|稍后|不急/.test(text)) {
    return 'LOW';
  }
  return 'MEDIUM';
};

const inferAssignee = (input) => {
  const text = parseOptionalText(input);
  const match = text.match(/(?:提醒|给|由|负责人)([\u4e00-\u9fa5A-Za-z0-9_-]{2,12}?)(?=今天|明天|后天|\d{1,2}[点:时]|$)/);
  return match?.[1] || '';
};

const inferTaskTitle = (input) => {
  const text = parseOptionalText(input);
  return (
    text
      .replace(/^(提醒|给)/, '')
      .replace(/(今天|明天|后天).*/, '')
      .replace(/(高优先级|低优先级|紧急)/g, '')
      .replace(/^[\u4e00-\u9fa5A-Za-z0-9_-]{2,12}/, '')
      .replace(/^[，,\s]+/, '')
      .trim()
    || text
  );
};

const buildTaskPayload = (input = {}, now = new Date()) => {
  const naturalLanguageInput = parseOptionalText(input.naturalLanguageInput);
  const dueAt = naturalLanguageInput
    ? (parseNaturalLanguageDateTime(naturalLanguageInput, now) || new Date(now.getTime() + 4 * 60 * 60 * 1000))
    : new Date(parseOptionalText(input.dueAt) || now.getTime() + 4 * 60 * 60 * 1000);

  const remindAtInput = parseOptionalText(input.remindAt);
  const secondRemindAtInput = parseOptionalText(input.secondRemindAt);
  const remindAt = remindAtInput
    ? new Date(remindAtInput)
    : new Date(Math.max(now.getTime() + 5 * 60 * 1000, dueAt.getTime() - 2 * 60 * 60 * 1000));
  const secondRemindAt = secondRemindAtInput
    ? new Date(secondRemindAtInput)
    : new Date(dueAt.getTime() + 60 * 60 * 1000);

  const title = naturalLanguageInput ? inferTaskTitle(naturalLanguageInput) : parseOptionalText(input.title);
  const assigneeName = naturalLanguageInput ? inferAssignee(naturalLanguageInput) : parseOptionalText(input.assigneeName);
  const priority = naturalLanguageInput ? inferPriority(naturalLanguageInput) : parseOptionalText(input.priority).toUpperCase() || 'MEDIUM';

  if (!title) {
    throw createError('任务标题不能为空', 400);
  }
  if (!assigneeName) {
    throw createError('责任人不能为空', 400);
  }
  if (Number.isNaN(dueAt.getTime()) || Number.isNaN(remindAt.getTime()) || Number.isNaN(secondRemindAt.getTime())) {
    throw createError('提醒时间格式错误', 400);
  }

  return {
    id: randomUUID(),
    title,
    description: parseOptionalText(input.description),
    assigneeName,
    priority: PRIORITY_ORDER[priority] ? priority : 'MEDIUM',
    status: 'TODO',
    dueAt: dueAt.toISOString(),
    remindAt: remindAt.toISOString(),
    secondRemindAt: secondRemindAt.toISOString(),
    firstReminderSentAt: null,
    secondReminderSentAt: null,
    sourceText: naturalLanguageInput || null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
};

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

const loadTasks = async () => {
  const tasks = await loadJsonConfig(TASK_CONFIG_KEY, []);
  return Array.isArray(tasks) ? tasks : [];
};

const getTasks = async (req, res, next) => {
  try {
    const tasks = await loadTasks();
    const sorted = tasks.slice().sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'DONE' ? 1 : -1;
      }
      if (PRIORITY_ORDER[b.priority] !== PRIORITY_ORDER[a.priority]) {
        return PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
      }
      return String(a.dueAt).localeCompare(String(b.dueAt));
    });

    const now = new Date();
    success(res, {
      items: sorted,
      summary: {
        totalItems: sorted.length,
        overdueItems: sorted.filter((item) => item.status !== 'DONE' && new Date(item.dueAt) < now).length,
        dueTodayItems: sorted.filter((item) => item.status !== 'DONE' && String(item.dueAt).slice(0, 10) === now.toISOString().slice(0, 10)).length,
        highPriorityItems: sorted.filter((item) => item.priority === 'HIGH' && item.status !== 'DONE').length,
      },
    });
  } catch (error) {
    next(error);
  }
};

const createTask = async (req, res, next) => {
  try {
    const tasks = await loadTasks();
    const task = buildTaskPayload(req.body, new Date());
    const nextTasks = [task, ...tasks];
    await saveJsonConfig(TASK_CONFIG_KEY, nextTasks, '经营执行中台任务提醒引擎任务数据');
    success(res, task, '任务创建成功');
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
  getTasks,
  createTask,
};
