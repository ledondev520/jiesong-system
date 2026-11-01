import { Role } from "@/types";

// 与 backend/src/routes/quotes.js 的写入角色一致（POST/PUT 仅 ADMIN/SALES）。
export const QUOTE_WRITE_ROLES: Role[] = [Role.ADMIN, Role.SALES];
