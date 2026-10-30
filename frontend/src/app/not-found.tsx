import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { NotFoundActions } from "./NotFoundActions";

export const metadata: Metadata = { title: "页面不存在" };

/**
 * Input: Next.js not-found boundary
 * Output: 面向业务用户的 404 页面（标题为唯一 h1），按登录状态提供返回入口
 * Pos: 全局兜底路由页
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="flex w-full max-w-xl flex-col items-center rounded-3xl border border-border/70 bg-card/95 py-16 text-center shadow-lg">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
          <Compass className="h-8 w-8" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">页面不存在</h1>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          你访问的页面可能已迁移、暂未开放，或链接地址有误。可先回到工作台继续处理业务。
        </p>
        <div className="mt-5">
          <NotFoundActions />
        </div>
      </div>
    </main>
  );
}
