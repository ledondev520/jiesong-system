/**
 * Input: 认证页卡片内容
 * Output: 与登录页一致的品牌头部、背景和页脚（头部不含标题，由卡片标题作为唯一 h1）
 * Pos: 注册、找回密码页外壳
 */
import type { ReactNode } from "react";
import { Ship } from "lucide-react";

export function AuthShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="auth-shell">
      <div className="flex w-full max-w-md flex-col items-center">
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-1 ring-primary/20">
            <Ship className="h-8 w-8" strokeWidth={1.5} />
          </div>
          <p className="text-2xl font-bold tracking-tight">捷淞国际物流</p>
        </div>
        {children}
        <p className="mt-6 text-[11px] text-muted-foreground/50">
          © 捷淞国际物流 · JIESONG
        </p>
      </div>
    </div>
  );
}
