'use client';

/**
 * Input: React 子组件树
 * Output: 渲染子组件；若子组件 throw，展示友好错误卡片而非白屏
 * Pos: 全局最外层 Error Boundary，在 app/layout.tsx 中包裹整个应用
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

/**
 * 职责：捕获子组件树中任何未处理的渲染错误，防止整页白屏
 * 思路：
 *   1. getDerivedStateFromError 捕获错误并写入 state
 *   2. render 时若 hasError 为 true，展示 fallback UI
 *   3. 提供「刷新页面」按钮供用户自助恢复
 */
export class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : String(error ?? '未知错误');
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    // 生产环境可对接 Sentry / 日志服务
    console.error('[GlobalErrorBoundary]', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="max-w-md w-full rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center space-y-4">
            <div className="flex justify-center">
              <AlertTriangle className="h-12 w-12 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">页面出现异常</h2>
            <p className="text-sm text-muted-foreground">
              系统遇到了一个意外错误，请点击下方按钮刷新页面。
            </p>
            {this.state.message && (
              <p className="text-xs text-muted-foreground/70 font-mono break-all">
                {this.state.message}
              </p>
            )}
            <Button onClick={this.handleReload} className="w-full">
              刷新页面
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
