const { created, paginated, success } = require('../../utils/response');
const { normalizePagination } = require('../../utils/pagination');

const createCrudController = ({
  listMethod,
  getMethod,
  createMethod,
  updateMethod,
  removeMethod,
  filters = [],
  createMessage = '创建成功',
  updateMessage = '更新成功',
  removeMessage = '删除成功',
}) => {
  const list = async (req, res, next) => {
    try {
      const { page, pageSize } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
      const query = { page, pageSize };

      filters.forEach((key) => {
        const value = req.query?.[key];
        if (value !== undefined && value !== '') {
          query[key] = value;
        }
      });

      const result = await listMethod(query);
      paginated(res, result.items, result.total, page, pageSize);
    } catch (error) {
      next(error);
    }
  };

  const getById = async (req, res, next) => {
    try {
      const record = await getMethod(req.params.id);
      success(res, record);
    } catch (error) {
      next(error);
    }
  };

  const create = async (req, res, next) => {
    try {
      const record = await createMethod(req.body || {});
      created(res, record, createMessage);
    } catch (error) {
      next(error);
    }
  };

  const update = async (req, res, next) => {
    try {
      const record = await updateMethod(req.params.id, req.body || {});
      success(res, record, updateMessage);
    } catch (error) {
      next(error);
    }
  };

  const remove = async (req, res, next) => {
    try {
      await removeMethod(req.params.id);
      success(res, null, removeMessage);
    } catch (error) {
      next(error);
    }
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
  createCrudController,
};
