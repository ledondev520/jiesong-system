import api from '@/lib/axios';
import type { AgentAccount, AgentCredentialIssueResult, ApiResponse, PaginatedResponse } from '@/types';

type AgentListQuery = {
  page?: number;
  pageSize?: number;
};

export type AgentAccountUpsertInput = {
  name: string;
  slug: string;
  description?: string;
  status?: string;
};

export const agentService = {
  getAll: async (params?: AgentListQuery) => {
    return api.get<ApiResponse<PaginatedResponse<AgentAccount>>, ApiResponse<PaginatedResponse<AgentAccount>>>('/agents', {
      params,
    });
  },

  getById: async (id: string) => {
    return api.get<ApiResponse<AgentAccount>, ApiResponse<AgentAccount>>(`/agents/${id}`);
  },

  create: async (data: AgentAccountUpsertInput) => {
    return api.post<ApiResponse<AgentAccount>, ApiResponse<AgentAccount>>('/agents', data);
  },

  update: async (id: string, data: Partial<AgentAccountUpsertInput>) => {
    return api.put<ApiResponse<AgentAccount>, ApiResponse<AgentAccount>>(`/agents/${id}`, data);
  },

  issueCredential: async (id: string, label?: string, expiresInDays?: number) => {
    return api.post<ApiResponse<AgentCredentialIssueResult>, ApiResponse<AgentCredentialIssueResult>>(`/agents/${id}/credentials`, {
      label,
      expiresInDays,
    });
  },

  revokeCredential: async (credentialId: string) => {
    return api.post<ApiResponse<void>, ApiResponse<void>>(`/agents/credentials/${credentialId}/revoke`);
  },

  rotateCredential: async (credentialId: string, expiresInDays?: number) => {
    return api.post<ApiResponse<AgentCredentialIssueResult>, ApiResponse<AgentCredentialIssueResult>>(`/agents/credentials/${credentialId}/rotate`, {
      expiresInDays,
    });
  },
};
