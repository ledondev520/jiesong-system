/**
 * Input: axios实例
 * Output: 系统运维相关 API 调用（日志、通知、导入记录、数据导出）
 * Pos: 前端系统运维服务层
 */

import api from '@/lib/axios';
import { ApiResponse, PaginatedResponse, User } from '@/types';
import { getAuthToken } from '@/lib/auth-token';

export interface SystemLogItem {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  user?: Pick<User, 'id' | 'name' | 'username'> | null;
}

export interface GetSystemLogsParams {
  page?: number;
  pageSize?: number;
  userId?: string;
  entity?: string;
  action?: string;
  entityId?: string;
  keyword?: string;
  ipAddress?: string;
  startDate?: string;
  endDate?: string;
}

export const getSystemLogs = async (params: GetSystemLogsParams = { page: 1, pageSize: 50 }) => {
  return api.get<ApiResponse<PaginatedResponse<SystemLogItem>>, ApiResponse<PaginatedResponse<SystemLogItem>>>(
    '/system/logs',
    { params }
  );
};

export const exportSystemLogsCsv = async (params: GetSystemLogsParams = {}, fallbackFilename = 'operation_logs.csv') => {
  const token = getAuthToken();
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).length > 0) {
      query.set(key, String(value));
    }
  });

  const queryString = query.toString();
  const response = await fetch(`/api/v1/system/logs/export/csv${queryString ? `?${queryString}` : ''}`, {
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
    },
  });

  if (!response.ok) {
    let message = `导出失败（${response.status}）`;
    try {
      const errorData = await response.json();
      if (errorData?.message) {
        message = errorData.message;
      }
    } catch {
      // Ignore JSON parse errors from non-JSON responses.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const disposition = response.headers.get('Content-Disposition') || '';
  const filenameMatch = disposition.match(/filename\*=UTF-8''(.+)/i) || disposition.match(/filename="?([^"]+)"?/i);

  link.href = url;
  link.download = filenameMatch ? decodeURIComponent(filenameMatch[1]) : fallbackFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export interface SystemNotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  content: string;
  isRead: boolean;
  metadata?: string | null;
  createdAt: string;
}

export interface GetSystemNotificationsParams {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}

export interface SystemNotificationsResponse extends PaginatedResponse<SystemNotificationItem> {
  unreadCount: number;
}

export const getSystemNotifications = async (
  params: GetSystemNotificationsParams = { page: 1, pageSize: 50 }
) => {
  return api.get<ApiResponse<SystemNotificationsResponse>, ApiResponse<SystemNotificationsResponse>>(
    '/system/notifications',
    { params }
  );
};

export const markSystemNotificationRead = async (id: string) => {
  return api.put<ApiResponse<null>, ApiResponse<null>>(`/system/notifications/${id}/read`);
};

export interface SystemPortItem {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GetSystemPortsParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  includeInactive?: boolean;
}

export const getSystemPorts = async (params: GetSystemPortsParams = { page: 1, pageSize: 100 }) => {
  return api.get<ApiResponse<PaginatedResponse<SystemPortItem>>, ApiResponse<PaginatedResponse<SystemPortItem>>>(
    '/system/ports',
    { params }
  );
};

export const createSystemPort = async (data: Pick<SystemPortItem, 'name' | 'code'> & { isActive?: boolean }) => {
  return api.post<ApiResponse<SystemPortItem>, ApiResponse<SystemPortItem>>('/system/ports', data);
};

export const updateSystemPort = async (id: string, data: Partial<Pick<SystemPortItem, 'name' | 'code' | 'isActive'>>) => {
  return api.put<ApiResponse<SystemPortItem>, ApiResponse<SystemPortItem>>(`/system/ports/${id}`, data);
};

export const deleteSystemPort = async (id: string) => {
  return api.delete<ApiResponse<null>, ApiResponse<null>>(`/system/ports/${id}`);
};

export interface SystemCategoryItem {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
  parent?: {
    id: string;
    name: string;
  } | null;
  _count?: {
    products?: number;
    children?: number;
  };
}

export interface GetSystemCategoriesParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export const getSystemCategories = async (params: GetSystemCategoriesParams = { page: 1, pageSize: 100 }) => {
  return api.get<ApiResponse<PaginatedResponse<SystemCategoryItem>>, ApiResponse<PaginatedResponse<SystemCategoryItem>>>(
    '/system/categories',
    { params }
  );
};

export const createSystemCategory = async (data: Pick<SystemCategoryItem, 'name'> & { parentId?: string | null }) => {
  return api.post<ApiResponse<SystemCategoryItem>, ApiResponse<SystemCategoryItem>>('/system/categories', data);
};

export const updateSystemCategory = async (
  id: string,
  data: Partial<Pick<SystemCategoryItem, 'name' | 'parentId'>>
) => {
  return api.put<ApiResponse<SystemCategoryItem>, ApiResponse<SystemCategoryItem>>(`/system/categories/${id}`, data);
};

export const deleteSystemCategory = async (id: string) => {
  return api.delete<ApiResponse<null>, ApiResponse<null>>(`/system/categories/${id}`);
};

export type SystemExportType =
  | 'suppliers'
  | 'stores'
  | 'products'
  | 'purchases'
  | 'sales'
  | 'containers'
  | 'inventory'
  | 'payments';

export const exportSystemData = async (type: SystemExportType, fallbackFilename?: string) => {
  const token = getAuthToken();
  const response = await fetch(`/api/v1/export/${type}`, {
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
    },
  });

  if (!response.ok) {
    let message = `导出失败（${response.status}）`;
    try {
      const errorData = await response.json();
      if (errorData?.message) {
        message = errorData.message;
      }
    } catch {
      // Ignore JSON parse errors from non-JSON responses.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const disposition = response.headers.get('Content-Disposition') || '';
  const filenameMatch = disposition.match(/filename\*=UTF-8''(.+)/i) || disposition.match(/filename="?([^"]+)"?/i);

  link.href = url;
  link.download = filenameMatch ? decodeURIComponent(filenameMatch[1]) : (fallbackFilename || `${type}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};
