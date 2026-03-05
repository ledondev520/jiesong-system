/**
 * Input: 路由处理器、Prisma、审计日志工具
 * Output: 带审计能力的控制器包装函数
 * Pos: 审计日志中间件，统一记录操作轨迹
 */

const prisma = require('../utils/prisma');
const auditLogUtils = require('../utils/auditLog');

const ACTION_BY_METHOD = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const resolveMaybe = async (valueOrResolver, context) => {
  if (typeof valueOrResolver === 'function') {
    return valueOrResolver(context);
  }
  return valueOrResolver;
};

const extractPayloadData = (payload) => {
  if (isObject(payload) && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload.data;
  }
  return payload;
};

const resolveRequestEntityId = (req, idParam = 'id') => {
  if (!req?.params) {
    return null;
  }
  if (req.params[idParam]) {
    return req.params[idParam];
  }
  if (idParam !== 'id' && req.params.id) {
    return req.params.id;
  }
  return null;
};

const resolveResponseEntityId = (responseData) => {
  if (!isObject(responseData)) {
    return null;
  }
  if (responseData.id) {
    return responseData.id;
  }
  return null;
};

const getPrismaDelegate = (model) => {
  if (!model) {
    return null;
  }
  const delegate = prisma[model];
  if (!delegate || typeof delegate.findUnique !== 'function') {
    return null;
  }
  return delegate;
};

const loadSnapshot = async ({
  model,
  whereResolver,
  entityId,
  idField,
  context,
}) => {
  const delegate = getPrismaDelegate(model);
  if (!delegate) {
    return null;
  }

  const resolvedWhere = await resolveMaybe(whereResolver, context);
  const where = resolvedWhere || (entityId ? { [idField]: entityId } : null);
  if (!where) {
    return null;
  }

  return delegate.findUnique({ where });
};

const shouldCaptureBefore = (action, options) => {
  if (options.captureBefore !== undefined) {
    return Boolean(options.captureBefore);
  }
  return action === 'UPDATE' || action === 'DELETE';
};

const shouldCaptureAfter = (action, options) => {
  if (options.captureAfter !== undefined) {
    return Boolean(options.captureAfter);
  }
  return action === 'CREATE' || action === 'UPDATE';
};

const buildDefaultValues = ({
  action,
  req,
  responseData,
  beforeSnapshot,
  afterSnapshot,
}) => {
  if (action === 'CREATE') {
    return {
      oldValue: null,
      newValue: afterSnapshot || responseData || req.body || null,
    };
  }

  if (action === 'UPDATE') {
    return {
      oldValue: beforeSnapshot || null,
      newValue: afterSnapshot || responseData || req.body || null,
    };
  }

  if (action === 'DELETE') {
    return {
      oldValue: beforeSnapshot || responseData || null,
      newValue: null,
    };
  }

  return {
    oldValue: beforeSnapshot || null,
    newValue: afterSnapshot || responseData || req.body || null,
  };
};

/**
 * 职责：包装控制器并在成功响应后记录审计日志
 * @param {Object} options - 审计配置
 * @param {Function} handler - 原始控制器
 */
const withAuditLog = (options = {}, handler) => {
  if (typeof handler !== 'function') {
    throw new TypeError('withAuditLog 需要传入有效的 handler 函数');
  }

  return async (req, res, next) => {
    const action = String(options.action || ACTION_BY_METHOD[req.method] || 'ACTION').toUpperCase();
    const entity = options.entity || 'Unknown';
    const idField = options.idField || options.idParam || 'id';
    const requestEntityId = resolveRequestEntityId(req, options.idParam || 'id');
    const captured = {
      payload: undefined,
    };
    let finalized = false;
    let beforeSnapshot = null;

    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    res.json = (payload) => {
      captured.payload = payload;
      return originalJson(payload);
    };

    res.send = (payload) => {
      if (captured.payload === undefined && !Buffer.isBuffer(payload)) {
        captured.payload = payload;
      }
      return originalSend(payload);
    };

    if (shouldCaptureBefore(action, options)) {
      try {
        beforeSnapshot = await loadSnapshot({
          model: options.model,
          whereResolver: options.beforeWhere || options.where,
          entityId: requestEntityId,
          idField,
          context: {
            req,
            payload: null,
            responseData: null,
            entityId: requestEntityId,
          },
        });
      } catch (error) {
        console.error('审计日志读取操作前快照失败:', error.message);
      }
    }

    const finalize = async () => {
      if (finalized) {
        return;
      }
      finalized = true;

      try {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return;
        }

        const payload = captured.payload;
        const responseData = extractPayloadData(payload);
        const customShouldLog = await resolveMaybe(options.shouldLog, {
          req,
          res,
          payload,
          responseData,
        });
        if (customShouldLog === false) {
          return;
        }

        const resolvedEntityId = await resolveMaybe(options.getEntityId, {
          req,
          res,
          payload,
          responseData,
          entityId: requestEntityId,
        }) || resolveResponseEntityId(responseData) || requestEntityId || null;

        let userId = await resolveMaybe(options.getUserId, {
          req,
          res,
          payload,
          responseData,
          entityId: resolvedEntityId,
        });
        if (!userId) {
          userId = req.user?.id || null;
        }
        if (!userId) {
          return;
        }

        let afterSnapshot = null;
        if (shouldCaptureAfter(action, options)) {
          try {
            afterSnapshot = await loadSnapshot({
              model: options.model,
              whereResolver: options.afterWhere || options.where,
              entityId: resolvedEntityId,
              idField,
              context: {
                req,
                payload,
                responseData,
                entityId: resolvedEntityId,
              },
            });
          } catch (error) {
            console.error('审计日志读取操作后快照失败:', error.message);
          }
        }

        const defaultValues = buildDefaultValues({
          action,
          req,
          responseData,
          beforeSnapshot,
          afterSnapshot,
        });

        const oldValue = await resolveMaybe(options.getOldValue, {
          req,
          res,
          payload,
          responseData,
          entityId: resolvedEntityId,
          beforeSnapshot,
          afterSnapshot,
          defaultValue: defaultValues.oldValue,
        });
        const newValue = await resolveMaybe(options.getNewValue, {
          req,
          res,
          payload,
          responseData,
          entityId: resolvedEntityId,
          beforeSnapshot,
          afterSnapshot,
          defaultValue: defaultValues.newValue,
        });

        await auditLogUtils.logOperation({
          userId,
          action,
          entity,
          entityId: resolvedEntityId,
          oldValue: oldValue === undefined ? defaultValues.oldValue : oldValue,
          newValue: newValue === undefined ? defaultValues.newValue : newValue,
          req,
        });
      } catch (error) {
        console.error('审计日志中间件执行失败:', error.message);
      }
    };

    res.once('finish', () => {
      void finalize();
    });

    res.once('close', () => {
      if (!res.writableEnded) {
        void finalize();
      }
    });

    try {
      const result = handler(req, res, next);
      if (result && typeof result.then === 'function') {
        await result;
      }
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  withAuditLog,
};
