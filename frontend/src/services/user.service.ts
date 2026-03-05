import type { User } from '@/types';
import { createCrudService } from './crudService';

type UserListQuery = {
  page?: number;
  pageSize?: number;
};

/**
 * 用户服务。
 */
const crud = createCrudService<User, Partial<User>, Partial<User>, UserListQuery>('/users');

export const userService = {
  ...crud,
};
