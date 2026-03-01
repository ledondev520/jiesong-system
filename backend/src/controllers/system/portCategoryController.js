const prisma = require('../../utils/prisma');
const { success, paginated } = require('../../utils/response');
const { createError } = require('../../middleware/errorHandler');
const { normalizePagination } = require('../../utils/pagination');

const parseOptionalText = (value) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizePortPayload = (value) => {
  if (!value) {
    return undefined;
  }

  return value;
};

const getPorts = async (req, res, next) => {
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
        { code: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [ports, total] = await Promise.all([
      prisma.port.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { name: 'asc' },
      }),
      prisma.port.count({ where }),
    ]);

    paginated(res, ports, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

const createPort = async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const code = (req.body.code || '').trim().toUpperCase();
    const isActive = req.body.isActive !== false;

    const duplicated = await prisma.port.findFirst({
      where: {
        OR: [{ name }, { code }],
      },
      select: { id: true, name: true, code: true },
    });

    if (duplicated) {
      throw createError('港口名称或代码已存在', 400);
    }

    const port = await prisma.port.create({
      data: { name, code, isActive },
    });

    success(res, port, '港口创建成功');
  } catch (error) {
    next(error);
  }
};

const updatePort = async (req, res, next) => {
  try {
    const { id } = req.params;
    const name = req.body.name === undefined ? undefined : String(req.body.name).trim();
    const code = req.body.code === undefined ? undefined : String(req.body.code).trim().toUpperCase();
    const isActive = req.body.isActive;

    const existing = await prisma.port.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw createError('港口不存在', 404);
    }

    if (name || code) {
      const duplicated = await prisma.port.findFirst({
        where: {
          id: { not: id },
          OR: [
            ...(name ? [{ name }] : []),
            ...(code ? [{ code }] : []),
          ],
        },
        select: { id: true },
      });

      if (duplicated) {
        throw createError('港口名称或代码已存在', 400);
      }
    }

    const port = await prisma.port.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(code !== undefined ? { code } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    });

    success(res, port, '港口更新成功');
  } catch (error) {
    next(error);
  }
};

const removePort = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.port.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw createError('港口不存在', 404);
    }

    await prisma.port.update({
      where: { id },
      data: { isActive: false },
    });

    success(res, null, '港口已停用');
  } catch (error) {
    next(error);
  }
};

const getCategories = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 100, maxPageSize: 200 });
    const keyword = parseOptionalText(req.query.keyword);

    const where = {};
    if (keyword) {
      where.name = { contains: keyword, mode: 'insensitive' };
    }

    const [categories, total] = await Promise.all([
      prisma.productCategory.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          parent: { select: { id: true, name: true } },
          _count: {
            select: {
              children: true,
              products: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.productCategory.count({ where }),
    ]);

    paginated(res, categories, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const parentId = normalizePortPayload(req.body.parentId);

    if (parentId) {
      const parent = await prisma.productCategory.findUnique({ where: { id: parentId }, select: { id: true } });
      if (!parent) {
        throw createError('父级分类不存在', 400);
      }
    }

    const category = await prisma.productCategory.create({
      data: { name, parentId: parentId || null },
      include: { parent: { select: { id: true, name: true } }, },
    });

    success(res, category, '商品分类创建成功');
  } catch (error) {
    next(error);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.productCategory.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw createError('商品分类不存在', 404);
    }

    const name = req.body.name === undefined ? undefined : String(req.body.name).trim();
    let parentId = req.body.parentId;

    if (parentId === '') {
      parentId = null;
    }

    if (parentId === id) {
      throw createError('父级分类不能选择自己', 400);
    }

    if (parentId !== undefined && parentId !== null) {
      const parent = await prisma.productCategory.findUnique({
        where: { id: parentId },
        select: { id: true },
      });
      if (!parent) {
        throw createError('父级分类不存在', 400);
      }
    }

    const category = await prisma.productCategory.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(parentId !== undefined ? { parentId } : {}),
      },
      include: { parent: { select: { id: true, name: true } } },
    });

    success(res, category, '商品分类更新成功');
  } catch (error) {
    next(error);
  }
};

const removeCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await prisma.productCategory.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw createError('商品分类不存在', 404);
    }

    const [childCount, productCount] = await Promise.all([
      prisma.productCategory.count({ where: { parentId: id } }),
      prisma.product.count({ where: { categoryId: id } }),
    ]);

    if (childCount > 0) {
      throw createError('请先删除子分类后再删除当前分类', 400);
    }

    if (productCount > 0) {
      throw createError('该分类下仍有关联商品，无法删除', 400);
    }

    await prisma.productCategory.delete({ where: { id } });
    success(res, null, '商品分类删除成功');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPorts,
  createPort,
  updatePort,
  removePort,
  getCategories,
  createCategory,
  updateCategory,
  removeCategory,
};
