const prisma = require('../../utils/prisma');
const { createError } = require('../../middleware/errorHandler');

const hasOwn = (input, key) => Object.prototype.hasOwnProperty.call(input || {}, key);

const toDateValue = (value) => {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return new Date(value);
};

const toNumberValue = (value) => {
  if (value === undefined || value === '') {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
};

const normalizePayload = (input = {}, options = {}) => {
  const {
    numberFields = [],
    dateFields = [],
  } = options;

  const payload = {};

  Object.keys(input).forEach((key) => {
    payload[key] = input[key];
  });

  numberFields.forEach((field) => {
    if (hasOwn(input, field)) {
      payload[field] = toNumberValue(input[field]);
    }
  });

  dateFields.forEach((field) => {
    if (hasOwn(input, field)) {
      payload[field] = toDateValue(input[field]);
    }
  });

  return payload;
};

const createCrudService = ({
  delegateName,
  notFoundMessage,
  buildWhere = () => ({}),
  mapData = (input) => input,
  orderBy = { createdAt: 'desc' },
}) => {
  const getDelegate = () => prisma[delegateName];

  const list = async ({ page = 1, pageSize = 10, ...filters } = {}) => {
    const where = buildWhere(filters);
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      getDelegate().findMany({
        where,
        skip,
        take: pageSize,
        orderBy,
      }),
      getDelegate().count({ where }),
    ]);

    return { items, total, page, pageSize };
  };

  const getById = async (id) => {
    const record = await getDelegate().findUnique({ where: { id } });
    if (!record) {
      throw createError(notFoundMessage, 404);
    }
    return record;
  };

  const create = async (data = {}) => {
    return getDelegate().create({
      data: mapData(data),
    });
  };

  const update = async (id, data = {}) => {
    await getById(id);
    return getDelegate().update({
      where: { id },
      data: mapData(data),
    });
  };

  const remove = async (id) => {
    await getById(id);
    await getDelegate().delete({ where: { id } });
  };

  return {
    list,
    getById,
    create,
    update,
    remove,
  };
};

module.exports = {
  createCrudService,
  normalizePayload,
};
