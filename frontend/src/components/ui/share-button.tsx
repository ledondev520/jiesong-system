/**
 * 职责：链接分享按钮
 * 思路：复制当前页面链接到剪贴板，支持分享给其他用户
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Share2, Link2, Check } from 'lucide-react';
import { toast } from 'sonner';

interface ShareButtonProps {
  /** 自定义分享链接 */
  url?: string;
  /** 分享标题 */
  title?: string;
  /** 按钮样式变体 */
  variant?: 'default' | 'outline' | 'ghost';
  /** 按钮尺寸 */
  size?: 'default' | 'sm' | 'icon';
}

export function ShareButton({
  url,
  title = '捷淞系统',
  variant = 'outline',
  size = 'sm',
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('链接已复制到剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('复制失败，请手动复制');
    }
  };

  const handleShare = async () => {
    const shareUrl = url || (typeof window !== 'undefined' ? window.location.href : '');

    if (navigator.share) {
      try {
        await navigator.share({
          title,
          url: shareUrl,
        });
      } catch {
        // 用户取消分享
      }
    } else {
      handleCopyLink();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size}>
          <Share2 className="h-4 w-4 mr-1.5" />
          分享
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleCopyLink}>
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-2 text-green-500" />
              已复制
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4 mr-2" />
              复制链接
            </>
          )}
        </DropdownMenuItem>
        {typeof navigator !== 'undefined' && !!navigator.share && (
          <DropdownMenuItem onClick={handleShare}>
            <Share2 className="h-4 w-4 mr-2" />
            系统分享
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
