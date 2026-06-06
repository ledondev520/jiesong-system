/**
 * Input: 子页面内容
 * Output: Mac 风格设置页面布局（左侧导航 + 右侧内容）
 * Pos: 系统管理 > 所有设置子页面的统一布局壳
 */

import { SettingsNav } from '@/components/settings/SettingsNav';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-mx-4 -my-5 flex min-h-[calc(100vh-8rem)] md:-mx-6 lg:-mx-8">
      {/* 左侧导航：桌面端固定宽度，移动端隐藏（保持简洁，移动端沿用全局 Tab） */}
      <aside className="hidden w-60 border-r bg-sidebar/40 md:block">
        <div className="sticky top-0 h-[calc(100vh-4rem)] overflow-y-auto py-4">
          <SettingsNav />
        </div>
      </aside>

      {/* 右侧内容 */}
      <main className="flex-1 px-4 py-5 md:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
