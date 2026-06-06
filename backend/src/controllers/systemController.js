/**
 * Input: /system/* API 控制器聚合
 * Output: 系统配置、通知、日志、港口与商品分类、导入导出、巡检统一入口
 * Pos: 拆分后的系统控制器聚合层，统一对外导出入口
 */

const {
  getConfigs,
  getConfigsByDomain,
  updateConfig,
  getExchangeRate,
  syncExchangeRate,
} = require('./system/configController');
const {
  getNotifications,
  markNotificationRead,
  getLogs,
  getOperationLogs,
  exportOperationLogsCsv,
} = require('./system/notificationController');
const {
  getPorts,
  createPort,
  updatePort,
  removePort,
  getCategories,
  createCategory,
  updateCategory,
  removeCategory,
} = require('./system/portCategoryController');
const {
  importData,
  getImportRecords,
  exportData,
  exportDataPdf,
} = require('./system/importExportController');
const {
  getCustomsBrokers,
  createCustomsBroker,
  updateCustomsBroker,
  removeCustomsBroker,
} = require('./system/customsBrokerController');
const { getEventLedger } = require('./system/eventLedgerController');
const { getPatrolStatus, executePatrol } = require('../jobs/patrolJob');
const { success } = require('../utils/response');

const getPatrolStatusCtrl = async (_req, res, next) => {
  try {
    const status = getPatrolStatus();
    success(res, status);
  } catch (error) {
    next(error);
  }
};

const triggerPatrolCtrl = async (_req, res, next) => {
  try {
    const result = await executePatrol('manual');
    success(res, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getConfigs,
  getConfigsByDomain,
  updateConfig,
  getLogs,
  getOperationLogs,
  exportOperationLogsCsv,
  getNotifications,
  markNotificationRead,
  getExchangeRate,
  syncExchangeRate,
  getPorts,
  createPort,
  updatePort,
  removePort,
  getCategories,
  createCategory,
  updateCategory,
  removeCategory,
  getCustomsBrokers,
  createCustomsBroker,
  updateCustomsBroker,
  removeCustomsBroker,
  importData,
  getImportRecords,
  exportData,
  exportDataPdf,
  getEventLedger,
  getPatrolStatus: getPatrolStatusCtrl,
  triggerPatrol: triggerPatrolCtrl,
};
