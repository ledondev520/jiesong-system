import api from '@/lib/axios';
import type { ApiResponse, ContractTemplate } from '@/types';
import { createCrudService } from './crudService';

type ContractTemplateCreatePayload = {
  name: string;
  type: 'PURCHASE' | 'SALES';
  supplierId?: string | null;
  taxRate?: number | null;
  note?: string | null;
  items: unknown[];
};

type ContractTemplateQuery = { type?: string };

const crud = createCrudService<
  ContractTemplate,
  ContractTemplateCreatePayload,
  Partial<ContractTemplateCreatePayload>,
  ContractTemplateQuery
>('/contract-templates');

/**
 * 合同模板服务。
 */
export const contractTemplateService = {
  ...crud,

  /**
   * 获取指定类型的模板列表（辅助方法）。
   */
  getByType: async (type: 'PURCHASE' | 'SALES') => {
    return api.get<ApiResponse<ContractTemplate[]>, ApiResponse<ContractTemplate[]>>(
      '/contract-templates',
      { params: { type } },
    );
  },
};
