import api from '@/lib/axios';
import type { ApiResponse, User } from '@/types';

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface ResetPasswordPayload {
  username: string;
  phone: string;
  newPassword: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

export const authService = {
  login: async (payload: LoginCredentials) => {
    return api.post<ApiResponse<LoginResponse>, ApiResponse<LoginResponse>, LoginCredentials>('/auth/login', payload);
  },

  resetPassword: async (payload: ResetPasswordPayload) => {
    return api.post<ApiResponse<null>, ApiResponse<null>, ResetPasswordPayload>('/auth/reset-password', payload);
  },
};
