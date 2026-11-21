/**
 * Input: /system/* API 控制器聚合
 * Output: 系统配置、通知、日志、港口与商品分类统一入口
 * Pos: 拆分后的系统控制器聚合层，统一对外导出入口
 */

const {
  getConfigs,
  updateConfig,
  getExchangeRate,
  getSellerIdentity,
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
const { exportData } = require('./system/importExportController');
const {
  getCustomsBrokers,
  createCustomsBroker,
  updateCustomsBroker,
  removeCustomsBroker,
} = require('./system/customsBrokerController');
module.exports = {
  getConfigs,
  updateConfig,
  getLogs,
  getOperationLogs,
  exportOperationLogsCsv,
  getNotifications,
  markNotificationRead,
  getExchangeRate,
  getSellerIdentity,
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
  exportData,
};
