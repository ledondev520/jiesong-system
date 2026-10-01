'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useMobile } from '@/lib/hooks/useMobile';

const LazyAIAssistant = dynamic(
  () => import('@/components/ai/AIAssistant').then((module) => module.AIAssistant),
  {
    ssr: false,
    loading: () => null,
  },
);

/**
 * 仅在业务页面挂载 AI 助手；手机工作台通过底部「更多」进入，避免悬浮入口遮挡业务内容。
 */
export function LazyAIAssistantMount() {
  const pathname = usePathname();
  const isMobile = useMobile();
  const isAiWorkspace = pathname.startsWith('/dashboard/ai');
  const shouldMount =
    !isAiWorkspace && (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/tax-refunds')
    );

  if (!shouldMount || (isMobile && pathname.startsWith('/dashboard'))) {
    return null;
  }

  return <LazyAIAssistant />;
}
