/**
 * Input: 当前用户、资料保存、退出动作
 * Output: Header 用户菜单与个人设置弹窗
 * Pos: 前端布局子组件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  HeaderProfileDialog,
  type HeaderProfileDraft,
  type HeaderUserMenuPreferences,
} from './HeaderProfileDialog';

export const HEADER_USER_MENU_PREFERENCES_KEY = 'jiesong_header_user_preferences';

const defaultPreferences: HeaderUserMenuPreferences = {
  desktopNotifications: false,
  compactMode: false,
  rememberLastModule: true,
  signature: '',
};

function readPreferences(): HeaderUserMenuPreferences {
  if (typeof window === 'undefined') {
    return defaultPreferences;
  }

  try {
    const raw = localStorage.getItem(HEADER_USER_MENU_PREFERENCES_KEY);

    if (!raw) {
      return defaultPreferences;
    }

    const parsed = JSON.parse(raw) as Partial<HeaderUserMenuPreferences>;

    return {
      compactMode: Boolean(parsed.compactMode),
      desktopNotifications: Boolean(parsed.desktopNotifications),
      rememberLastModule:
        typeof parsed.rememberLastModule === 'boolean'
          ? parsed.rememberLastModule
          : defaultPreferences.rememberLastModule,
      signature: typeof parsed.signature === 'string' ? parsed.signature : '',
    };
  } catch {
    return defaultPreferences;
  }
}

function writePreferences(preferences: HeaderUserMenuPreferences) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(HEADER_USER_MENU_PREFERENCES_KEY, JSON.stringify(preferences));
}

interface HeaderUserMenuProps {
  displayName?: string;
  username?: string;
  initials: string;
  avatar?: string;
  lastLoginAt?: string;
  onSaveProfile: (profile: HeaderProfileDraft) => void;
  onLogout: () => void;
}

export function HeaderUserMenu({
  displayName,
  username,
  initials,
  avatar,
  lastLoginAt,
  onSaveProfile,
  onLogout,
}: HeaderUserMenuProps) {
  const resolvedDisplayName = displayName || '管理员';
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [preferences, setPreferences] = useState<HeaderUserMenuPreferences>(defaultPreferences);

  const handleOpenProfile = () => {
    setPreferences(readPreferences());
    setDialogKey((current) => current + 1);
    setDialogOpen(true);
  };

  const handleSaveProfile = (profile: HeaderProfileDraft, nextPreferences: HeaderUserMenuPreferences) => {
    writePreferences(nextPreferences);
    setPreferences(nextPreferences);
    onSaveProfile(profile);
    setDialogOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-11 gap-2 rounded-md px-2" aria-label="用户菜单">
            <Avatar className="h-7 w-7 border">
              {avatar ? <AvatarImage src={avatar} alt={resolvedDisplayName} /> : null}
              <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
            </Avatar>
            <div className="hidden text-left sm:block">
              <div className="text-sm font-medium leading-none">{resolvedDisplayName}</div>
              <div className="text-xs text-muted-foreground">{username}</div>
            </div>
            <span className="sr-only">用户菜单</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span>{resolvedDisplayName}</span>
              <span className="text-xs font-normal text-muted-foreground">{username}</span>
              {lastLoginAt && (
                <span className="text-[11px] font-normal text-muted-foreground/70 mt-0.5">
                  最后登录: {new Date(lastLoginAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleOpenProfile}>
            个人设置
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onLogout}>
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <HeaderProfileDialog
        key={`header-profile-dialog-${dialogKey}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        displayName={resolvedDisplayName}
        username={username}
        initials={initials}
        avatar={avatar}
        preferences={preferences}
        onSave={handleSaveProfile}
      />
    </>
  );
}
