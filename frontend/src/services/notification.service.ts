import api, { type ApiRequestConfig } from "@/lib/axios";
import type { ApiResponse, Notification, PaginatedResponse } from "@/types";

export interface NotificationQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  unreadOnly?: boolean;
}

export interface NotificationListResponse extends PaginatedResponse<Notification> {
  unreadCount: number;
}

export interface UnreadCountResponse {
  count: number;
}

export interface GenerateResponse {
  generated: number;
}

export const notificationService = {
  getList: async (params?: NotificationQuery, config?: ApiRequestConfig) => {
    return api.get<
      ApiResponse<NotificationListResponse>,
      ApiResponse<NotificationListResponse>
    >("/notifications", { params, ...config });
  },

  getUnreadCount: async () => {
    return api.get<
      ApiResponse<UnreadCountResponse>,
      ApiResponse<UnreadCountResponse>
    >("/notifications/unread-count");
  },

  markRead: async (id: string) => {
    return api.post<ApiResponse<Notification>, ApiResponse<Notification>>(
      `/notifications/${id}/read`,
    );
  },

  markAllRead: async () => {
    return api.post<ApiResponse<void>, ApiResponse<void>>(
      "/notifications/read-all",
    );
  },

  generate: async () => {
    return api.post<
      ApiResponse<GenerateResponse>,
      ApiResponse<GenerateResponse>
    >("/notifications/generate");
  },
};
