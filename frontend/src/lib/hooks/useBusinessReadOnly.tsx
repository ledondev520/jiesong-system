"use client";
import type { ReactNode } from "react";
import { Role } from "@/types";
import { useAuthStore } from "@/store/auth.store";

// OD-8：只有 ADMIN/SALES 可写；遗留的停用角色（后端已拒绝）不显示写入口。
export const useBusinessReadOnly = () => {
  const role = useAuthStore((state) => state).user?.role;
  return !!role && !Object.values(Role).includes(role);
};

/** 在具体业务写动作处使用；筛选、翻页及详情不经过这个门禁。 */
export function BusinessWrite({ children }: { children: ReactNode }) {
  return useBusinessReadOnly() ? null : <>{children}</>;
}
