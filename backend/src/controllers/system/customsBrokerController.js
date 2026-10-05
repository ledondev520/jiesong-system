/**
 * Input: broker form payloads and Prisma
 * Output: broker persistence with nonblank names and explicit optional-field clearing
 * Pos: ordinary system catalogue controller; omitted optional fields remain unchanged
 */
const prisma = require('../../utils/prisma');
const { success, paginated } = require('../../utils/response');
const { createError } = require('../../middleware/errorHandler');
const { normalizePagination } = require('../../utils/pagination');
const { parseOptionalText } = require('../../utils/text');

const normalizeOptionalBrokerField = value => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return String(value).trim() || null;
};

const getCustomsBrokers = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 100, maxPageSize: 200 });
    const keyword = parseOptionalText(req.query.keyword);
    const includeInactive = req.query.includeInactive === 'true';

    const where = {};
    if (includeInactive !== true) {
      where.isActive = true;
    }
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { contact: { contains: keyword, mode: 'insensitive' } },
        { phone: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [brokers, total] = await Promise.all([
      prisma.customsBroker.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
      }),
      prisma.customsBroker.count({ where }),
    ]);

    paginated(res, brokers, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

const createCustomsBroker = async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const contact = (req.body.contact || '').trim() || null;
    const phone = (req.body.phone || '').trim() || null;
    const email = (req.body.email || '').trim() || null;
    const address = (req.body.address || '').trim() || null;
    const isActive = req.body.isActive !== false;

    if (!name) {
      throw createError('报关公司名称不能为空', 400);
    }

    const broker = await prisma.customsBroker.create({
      data: { name, contact, phone, email, address, isActive },
    });

    success(res, broker, '报关公司创建成功');
  } catch (error) {
    next(error);
  }
};

const updateCustomsBroker = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.customsBroker.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw createError('报关公司不存在', 404);
    }

    const name = req.body.name === undefined ? undefined : String(req.body.name ?? '').trim();
    if (name === '') {
      throw createError('报关公司名称不能为空', 400);
    }
    const contact = normalizeOptionalBrokerField(req.body.contact);
    const phone = normalizeOptionalBrokerField(req.body.phone);
    const email = normalizeOptionalBrokerField(req.body.email);
    const address = normalizeOptionalBrokerField(req.body.address);
    const isActive = req.body.isActive;

    const broker = await prisma.customsBroker.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(contact !== undefined ? { contact } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(address !== undefined ? { address } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });

    success(res, broker, '报关公司更新成功');
  } catch (error) {
    next(error);
  }
};

const removeCustomsBroker = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.customsBroker.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw createError('报关公司不存在', 404);
    }

    await prisma.customsBroker.update({
      where: { id },
      data: { isActive: false },
    });

    success(res, null, '报关公司已停用');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCustomsBrokers,
  createCustomsBroker,
  updateCustomsBroker,
  removeCustomsBroker,
};
