/**
 * Input: axios实例
 * Output: 系统运维相关 API 调用
 * Pos: 前端系统运维服务层
 */

import api from '@/lib/axios';
import { ApiResponse, PaginatedResponse, User } from '@/types';

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
}

export const getSystemLogs = async (params: GetSystemLogsParams = { page: 1, pageSize: 50 }) => {
  return api.get<ApiResponse<PaginatedResponse<SystemLogItem>>, ApiResponse<PaginatedResponse<SystemLogItem>>>(
    '/system/logs',
    { params }
  );
};

