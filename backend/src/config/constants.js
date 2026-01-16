/**
 * Input: 业务需求
 * Output: 系统常量定义
 * Pos: 常量配置，定义业务枚举值
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

// 用户角色
const ROLES = {
  ADMIN: 'ADMIN',       // 管理员/老板
  PURCHASE: 'PURCHASE', // 采购
  SALES: 'SALES',       // 销售
};

// 采购状态
const PURCHASE_STATUS = {
  DRAFT: 'DRAFT',           // 草稿
  SIGNED: 'SIGNED',         // 已签订
  PRODUCING: 'PRODUCING',   // 生产中
  SHIPPED: 'SHIPPED',       // 已发货
  RECEIVED: 'RECEIVED',     // 已收货
  COMPLETED: 'COMPLETED',   // 已完成
  CANCELLED: 'CANCELLED',   // 已取消
};

// 销售状态
const SALES_STATUS = {
  DRAFT: 'DRAFT',         // 草稿
  CONFIRMED: 'CONFIRMED', // 已确认
  PAID: 'PAID',           // 已收款
  SHIPPED: 'SHIPPED',     // 已发货
  COMPLETED: 'COMPLETED', // 已完成
  CANCELLED: 'CANCELLED', // 已取消
};

// 库存状态
const INVENTORY_STATUS = {
  PRODUCING: 'PRODUCING', // 生产中
  PACKING: 'PACKING',     // 包装中
  SHIPPING: 'SHIPPING',   // 运输中
  INBOUND: 'INBOUND',     // 已入库
  OUTBOUND: 'OUTBOUND',   // 已出库
};

// 货柜状态
const CONTAINER_STATUS = {
  PENDING: 'PENDING',   // 待装柜
  LOADING: 'LOADING',   // 装柜中
  SHIPPED: 'SHIPPED',   // 已发运
  ARRIVED: 'ARRIVED',   // 已到达
};

// 付款类型
const PAYMENT_TYPE = {
  PAYABLE: 'PAYABLE',       // 应付（付给供应商）
  RECEIVABLE: 'RECEIVABLE', // 应收（从门店收款）
};

// 通知类型
const NOTIFICATION_TYPE = {
  PAYMENT_DUE: 'PAYMENT_DUE',           // 付款到期
  RECEIVABLE_DUE: 'RECEIVABLE_DUE',     // 应收到期
  CONTAINER_ARRIVAL: 'CONTAINER_ARRIVAL', // 货柜到达
  SYSTEM: 'SYSTEM',                     // 系统通知
};

// 导入状态
const IMPORT_STATUS = {
  PENDING: 'PENDING',       // 待处理
  PROCESSING: 'PROCESSING', // 处理中
  COMPLETED: 'COMPLETED',   // 已完成
  FAILED: 'FAILED',         // 失败
};

module.exports = {
  ROLES,
  PURCHASE_STATUS,
  SALES_STATUS,
  INVENTORY_STATUS,
  CONTAINER_STATUS,
  PAYMENT_TYPE,
  NOTIFICATION_TYPE,
  IMPORT_STATUS,
};
