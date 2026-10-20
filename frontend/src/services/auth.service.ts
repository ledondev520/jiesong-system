import { getAuthGeneration } from "@/lib/browser-session";
import api, { type ApiRequestConfig } from "@/lib/axios";
import type { ApiResponse, User } from "@/types";

export interface LoginCredentials {
  username: string;
  password: string;
  rememberMe?: boolean;
}

export interface ResetPasswordPayload {
  email: string;
  code: string;
  newPassword: string;
}

export interface LoginResponse {
  user: User;
  token: string | null;
  csrfToken?: string;
  expiresAt?: string;
}

let logoutRequest: { generation: number; promise: Promise<unknown> } | null =
  null;

export const authService = {
  restoreSession: (signal?: AbortSignal) =>
    api.get<ApiResponse<LoginResponse>, ApiResponse<LoginResponse>>(
      "/auth/session",
      {
        signal,
        timeout: 10000,
        cache: { enabled: false },
        skipAuthRedirect: true,
      } as ApiRequestConfig,
    ),
  logout: () => {
    const generation = getAuthGeneration();
    if (!logoutRequest || logoutRequest.generation !== generation) {
      const promise: Promise<unknown> = api
        .get<
          ApiResponse<{ csrfToken: string | null }>,
          ApiResponse<{ csrfToken: string | null }>
        >("/auth/logout-csrf", {
          timeout: 10000,
          skipBearer: true,
          skipAuthRedirect: true,
          cache: { enabled: false },
        } as ApiRequestConfig)
        .then((result) => {
          if (generation !== getAuthGeneration())
            throw new Error("登录状态已变化");
          if (result.code !== 200 || !result.data)
            throw new Error("暂时无法验证退出请求");
          return api.post("/auth/logout", undefined, {
            skipBearer: true,
            skipAuthRedirect: true,
            timeout: 10000,
            headers: { "X-CSRF-Token": result.data.csrfToken || "" },
          } as ApiRequestConfig);
        })
        .finally(() => {
          if (logoutRequest?.promise === promise) logoutRequest = null;
        });
      logoutRequest = { generation, promise };
    }
    return logoutRequest.promise;
  },
  sendResetPasswordCode: (email: string) =>
    api.post("/auth/reset-password-code", { email }),
  sendEmailCode: (email: string) => api.post("/auth/email-code", { email }),
  registerEmail: (payload: {
    email: string;
    code: string;
    name: string;
    password: string;
  }) => api.post("/auth/email-register", payload),
  login: async (payload: LoginCredentials, signal?: AbortSignal) => {
    return api.post<
      ApiResponse<LoginResponse>,
      ApiResponse<LoginResponse>,
      LoginCredentials
    >("/auth/login", payload, signal ? { signal } : undefined);
  },

  resetPassword: async (payload: ResetPasswordPayload) => {
    return api.post<ApiResponse<null>, ApiResponse<null>, ResetPasswordPayload>(
      "/auth/reset-password",
      payload,
    );
  },
};
