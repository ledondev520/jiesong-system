/**
 * Input: 无（服务端渲染，所有访客都能看到，没有空白闪屏）
 * Output: 公开落地页：顶栏、首屏、业务链、页脚；已登录者由 AuthRedirect 转去 /dashboard
 * Pos: app/page.tsx 的页面主体；Montserrat 变量只在本页与认证页挂载
 */
import { montserrat } from "@/app/fonts/montserrat";
import { AuthRedirect } from "./AuthRedirect";
import { FlowStrip } from "./FlowStrip";
import { LandingFooter } from "./LandingFooter";
import { LandingHero } from "./LandingHero";
import { LandingTopBar } from "./LandingTopBar";

export function LandingPage() {
  return (
    <div className={`${montserrat.variable} min-h-screen bg-background`}>
      <AuthRedirect />
      <LandingTopBar />
      <main>
        <LandingHero />
        <FlowStrip />
      </main>
      <LandingFooter />
    </div>
  );
}
