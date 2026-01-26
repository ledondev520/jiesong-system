/**
 * Input: 后端 AI greeting API
 * Output: AI问候语悬浮卡片组件（展示五月天歌曲主题问候）
 * Pos: 工作台右上角悬浮，用户进入时显示温暖的AI问候
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw, Music, Loader2, X } from 'lucide-react';
import api from '@/lib/axios';

interface GreetingData {
  greeting: string;
  songName: string;
  lyrics: string[];
  source: 'ai' | 'local';
}

/**
 * 职责：渲染AI问候语悬浮卡片
 * 思路：
 *   1. 用户进入页面时自动获取问候语（仅一次）
 *   2. 悬浮展示AI生成的问候语
 *   3. 提供刷新和关闭功能
 */
export function AIGreeting() {
  const [data, setData] = useState<GreetingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);
  const hasFetched = useRef(false);

  // 获取问候语
  const fetchGreeting = useCallback(async (isManual: boolean) => {
    if (!isManual && hasFetched.current) {
      return;
    }
    hasFetched.current = true;
    
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/ai/greeting');
      setData((response as { data: GreetingData }).data);
    } catch (err) {
      console.error('获取问候语失败:', err);
      setError('获取问候语失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 手动刷新处理函数
  const handleRefresh = useCallback(() => {
    fetchGreeting(true);
  }, [fetchGreeting]);

  // 初始加载（仅执行一次）
  useEffect(() => {
    fetchGreeting(false);
  }, [fetchGreeting]);

  // 隐藏卡片
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed top-16 right-4 z-50 w-72 lg:w-80 animate-in slide-in-from-right-5 fade-in duration-300">
      <div className="relative overflow-hidden rounded-lg border border-purple-200/50 bg-gradient-to-br from-purple-50/95 to-pink-50/95 dark:from-purple-950/90 dark:to-pink-950/90 backdrop-blur-sm shadow-lg">
        {/* 关闭按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-1 right-1 h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-transparent"
          onClick={() => setVisible(false)}
        >
          <X className="h-3 w-3" />
        </Button>

        <div className="p-3">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-xs">AI正在思考...</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{error}</span>
              <Button variant="ghost" size="sm" className="h-5 px-2 text-xs" onClick={handleRefresh}>
                <RefreshCw className="h-2.5 w-2.5 mr-1" />
                重试
              </Button>
            </div>
          ) : data ? (
            <div className="space-y-2">
              {/* 问候语标题 */}
              <div className="flex items-center gap-1.5 pr-4">
                <Sparkles className="h-3.5 w-3.5 text-purple-500 flex-shrink-0" />
                <span className="font-medium text-sm text-foreground">{data.greeting}</span>
              </div>

              {/* 励志语句展示 */}
              {data.lyrics && data.lyrics.length > 0 && (
                <div className="pl-5 space-y-0.5 border-l-2 border-purple-300/50 dark:border-purple-700/50">
                  {data.lyrics.map((line, index) => (
                    <p
                      key={index}
                      className="text-xs text-muted-foreground leading-relaxed"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              )}

              {/* 歌曲信息和刷新按钮 */}
              <div className="flex items-center justify-between pt-0.5">
                {data.songName && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                    <Music className="h-2.5 w-2.5" />
                    <span>《{data.songName}》</span>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={handleRefresh}
                  disabled={loading}
                >
                  <RefreshCw className={`h-2.5 w-2.5 mr-0.5 ${loading ? 'animate-spin' : ''}`} />
                  换一首
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
