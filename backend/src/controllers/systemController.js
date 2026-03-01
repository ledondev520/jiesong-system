/**
 * Input: /system/* API 控制器聚合
 * Output: 系统配置、通知、日志、港口与商品分类、导入导出统一入口
 * Pos: 拆分后的系统控制器聚合层，兼容原有路由直接 require 模式
 */

const {
  getConfigs,
  updateConfig,
  getExchangeRate,
  parseOptionalText,
} = require('./system/configController');
const {
  getNotifications,
  markNotificationRead,
  getLogs,
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
} = require('./system/importExportController');

module.exports = {
  getConfigs,
  updateConfig,
  getLogs,
  getNotifications,
  markNotificationRead,
  getExchangeRate,
  getPorts,
  createPort,
  updatePort,
  removePort,
  getCategories,
  createCategory,
  updateCategory,
  removeCategory,
  importData,
  getImportRecords,
  exportData,
  parseOptionalText,
};
