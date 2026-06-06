'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';

const LazyAIAssistant = dynamic(
  () => import('@/components/ai/AIAssistant').then((module) => module.AIAssistant),
  {
    ssr: false,
    loading: () => null,
  },
);

/**
 * 仅在业务页面挂载 AI 助手，降低登录等公共页面的首屏负担。
 */
export function LazyAIAssistantMount() {
  const pathname = usePathname();
  const isAiWorkspace = pathname.startsWith('/dashboard/ai');
  const shouldMount =
    !isAiWorkspace && (
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/tax-refunds')
    );

  if (!shouldMount) {
    return null;
  }

  return <LazyAIAssistant />;
}
