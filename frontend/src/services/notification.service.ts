import api from '@/lib/axios';
import type { ApiResponse, Notification, PaginatedResponse } from '@/types';

export interface NotificationQuery {
  page?: number;
  pageSize?: number;
}

export interface UnreadCountResponse {
  count: number;
}

export interface GenerateResponse {
  generated: number;
}

export const notificationService = {
  getList: async (params?: NotificationQuery) => {
    return api.get<
      ApiResponse<PaginatedResponse<Notification>>,
      ApiResponse<PaginatedResponse<Notification>>
    >('/notifications', { params });
  },

  getUnreadCount: async () => {
    return api.get<ApiResponse<UnreadCountResponse>, ApiResponse<UnreadCountResponse>>(
      '/notifications/unread-count',
    );
  },

  markRead: async (id: string) => {
    return api.post<ApiResponse<Notification>, ApiResponse<Notification>>(`/notifications/${id}/read`);
  },

  markAllRead: async () => {
    return api.post<ApiResponse<void>, ApiResponse<void>>('/notifications/read-all');
  },

  generate: async () => {
    return api.post<ApiResponse<GenerateResponse>, ApiResponse<GenerateResponse>>(
      '/notifications/generate',
    );
  },
};
