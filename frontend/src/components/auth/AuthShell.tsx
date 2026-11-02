/**
 * Input: 认证页卡片内容；brandHeading=true 时品牌名渲染为本页 h1（仅登录页，其余页的 h1 是卡片标题）
 * Output: Ink & Seal 分栏外壳：≥1024px 左 5/12 暖纸品牌面板 + 右 7/12 表单；<1024px 顶部 72px 纸色带 + 表单。纯色，无毛玻璃/光晕
 * Pos: 登录、注册、找回密码共用外壳（页面各自的表单、字段、文案与逻辑不在这里）
 *
 * 品牌名只在 DOM 里出现一次，靠响应式类在「纸色带」与「左面板」之间切换版式，避免重复 h1。
 * 左面板的三条要点与落地页功能卡标题一致，且都是已上线的功能。
 */
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { montserrat } from "@/app/fonts/montserrat";

const HIGHLIGHTS = ["全程可追溯", "权限分明", "AI 助手随页可用"] as const;

export function AuthShell({
  children,
  brandHeading = false,
}: Readonly<{ children: ReactNode; brandHeading?: boolean }>) {
  const Name = brandHeading ? "h1" : "p";
  return (
    <div className={`auth-shell ${montserrat.variable}`}>
      <div className="auth-aside">
        <div className="flex items-center gap-3">
          <BrandMark size={40} />
          <div>
            <Name className="text-xl font-semibold leading-tight tracking-tight lg:text-2xl">
              捷淞国际物流
            </Name>
            <p className="font-brand text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              JIESONG
            </p>
          </div>
        </div>
        <div className="hidden lg:block">
          <p className="text-2xl font-semibold leading-8">进出口业务管理系统</p>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
            从报价到退税，出口业务在同一套系统里协同完成。
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-center gap-2.5">
                <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="hidden text-xs text-muted-foreground lg:block">
          © 捷淞国际物流 · JIESONG
        </p>
      </div>
      <main className="auth-main">
        {children}
        <p className="mt-6 text-xs text-muted-foreground lg:hidden">
          © 捷淞国际物流 · JIESONG
        </p>
      </main>
    </div>
  );
}
