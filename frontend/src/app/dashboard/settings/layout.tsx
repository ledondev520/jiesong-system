/**
 * Input: 子页面内容
 * Output: 设置布局（宽屏侧栏、手机/平板可收起菜单与完整子页面内容）
 * Pos: 系统管理 > 所有设置子页面的统一布局壳
 */

import { SettingsNav } from '@/components/settings/SettingsNav';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-4 -my-5 flex min-h-[calc(100dvh-8rem)] min-w-0 flex-col md:-mx-6 lg:-mx-8 xl:flex-row">
      {/* 手机/平板复用导航菜单，宽屏才同时显示两层侧栏 */}
      <div className="px-4 pt-4 md:px-6 lg:px-8 xl:hidden">
        <SettingsNav mobile />
      </div>
      <aside className="hidden w-60 shrink-0 border-r bg-sidebar/40 xl:block">
        <div className="sticky top-0 h-[calc(100vh-4rem)] overflow-y-auto py-4">
          <SettingsNav />
        </div>
      </aside>

      {/* 右侧内容 */}
      <div className="min-w-0 flex-1 px-4 py-5 md:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
}
