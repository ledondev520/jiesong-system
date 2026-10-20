/** 历史提醒保留可追溯入口；无链接的低库存通知来自现有每日预警。 */
export const notificationLink = (notification: { link?: string | null; type: string }) => {
  if (notification.link === '/dashboard/inventory' || (!notification.link && notification.type === 'LOW_STOCK')) {
    return '/dashboard/products?lowStock=true';
  }
  return notification.link || null;
};
