/**
 * Input: 无
 * Output: 吸顶顶栏（64px，纸色，底部 1px 金色发丝线）：标志 + 名称；登录、申请账号
 * Pos: 落地页；手机只显示「登录」
 */
import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/button";

export function LandingTopBar() {
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-brand-gold bg-card">
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-4 md:px-6">
        <Link
          href="/"
          className="flex items-center gap-3"
          aria-label="捷淞国际物流 首页"
        >
          <BrandMark size={32} />
          <span className="font-semibold tracking-tight">捷淞国际物流</span>
          <span className="font-brand hidden text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:inline">
            JIESONG
          </span>
        </Link>
        <nav className="flex items-center gap-2" aria-label="账号">
          <Button asChild variant="ghost">
            <Link href="/login">登录</Link>
          </Button>
          <Button asChild variant="outline" className="hidden sm:inline-flex">
            <Link href="/register">申请账号</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
