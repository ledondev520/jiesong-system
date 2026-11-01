/**
 * Input: 无
 * Output: 纸色页脚：版权与登录、申请账号、忘记密码入口
 * Pos: 落地页；备案/公司信息如需要，在此追加（提案 D7，尚未提供）
 */
import Link from "next/link";

export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
        <p>© 2026 捷淞国际物流 · JIESONG</p>
        <nav className="flex gap-4" aria-label="页脚">
          <Link href="/login" className="hover:text-foreground hover:underline">
            登录
          </Link>
          <Link
            href="/register"
            className="hover:text-foreground hover:underline"
          >
            申请账号
          </Link>
          <Link
            href="/forgot-password"
            className="hover:text-foreground hover:underline"
          >
            忘记密码
          </Link>
        </nav>
      </div>
    </footer>
  );
}
