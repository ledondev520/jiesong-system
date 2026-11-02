/**
 * Input: 无
 * Output: 纸色页脚：仅版权行（登录/申请账号入口只在首屏）
 * Pos: 落地页；备案/公司信息如需要，在此追加（提案 D7，尚未提供）
 */
export function LandingFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-3 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-6">
        <p>© 2026 捷淞国际物流 · JIESONG</p>
      </div>
    </footer>
  );
}
