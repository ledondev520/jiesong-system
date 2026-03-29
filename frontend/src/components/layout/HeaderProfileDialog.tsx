/**
 * Input: 个人资料草稿、偏好项、保存动作
 * Output: Header 个人设置弹窗
 * Pos: 前端布局子组件
 */

'use client';

import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface HeaderUserMenuPreferences {
  desktopNotifications: boolean;
  compactMode: boolean;
  rememberLastModule: boolean;
  signature: string;
}

export interface HeaderProfileDraft {
  name: string;
  avatar?: string;
}

interface HeaderProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  username?: string;
  initials: string;
  avatar?: string;
  preferences: HeaderUserMenuPreferences;
  onSave: (profile: HeaderProfileDraft, preferences: HeaderUserMenuPreferences) => void;
}

export function HeaderProfileDialog({
  open,
  onOpenChange,
  displayName,
  username,
  initials,
  avatar,
  preferences,
  onSave,
}: HeaderProfileDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nameDraft, setNameDraft] = useState(displayName);
  const [avatarDraft, setAvatarDraft] = useState(avatar ?? '');
  const [preferencesDraft, setPreferencesDraft] = useState(preferences);

  const fallbackText = useMemo(() => {
    const base = nameDraft.trim() || username || initials || '用户';
    return base.slice(0, 2).toUpperCase();
  }, [initials, nameDraft, username]);

  const handleAvatarUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarDraft(reader.result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextName = nameDraft.trim() || displayName;
    const nextAvatar = avatarDraft.trim();

    onSave(
      {
        avatar: nextAvatar || undefined,
        name: nextName,
      },
      {
        ...preferencesDraft,
        signature: preferencesDraft.signature.trim(),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>个人设置</DialogTitle>
          <DialogDescription>
            这里管理当前账号的头像、显示名称和个人偏好，不会进入系统级配置。
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-xl border bg-muted/30 p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    className="group relative h-24 w-24 rounded-full p-0 ring-2 ring-border/70 hover:bg-transparent hover:ring-primary/50"
                    aria-label="上传或替换头像"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Avatar className="h-24 w-24 border border-border/70 shadow-sm">
                      {avatarDraft ? <AvatarImage src={avatarDraft} alt={nameDraft || displayName} /> : null}
                      <AvatarFallback className="text-base font-semibold">{fallbackText}</AvatarFallback>
                    </Avatar>
                    <span
                      className={cn(
                        'absolute inset-0 flex items-end justify-center rounded-full px-3 pb-2 text-center text-[11px] font-medium text-white transition',
                        avatarDraft ? 'bg-black/10 group-hover:bg-black/45' : 'bg-primary/75 group-hover:bg-primary/85',
                      )}
                    >
                      点击上传或替换
                    </span>
                  </Button>
                  {avatarDraft ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-sm"
                      className="absolute -top-1 -right-1 rounded-full border border-border/70 shadow-sm"
                      aria-label="移除当前头像"
                      onClick={() => setAvatarDraft('')}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
                <input
                  ref={fileInputRef}
                  id="avatar-file-upload"
                  name="avatar"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  aria-label="上传头像文件"
                  onChange={handleAvatarUpload}
                />
                <p className="text-center text-xs text-muted-foreground">
                  直接点击头像即可上传或替换，仅影响当前账号展示。
                </p>
              </div>
              <div className="flex-1 space-y-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">头像</p>
                  <p className="text-xs text-muted-foreground">
                    不需要处理头像链接，直接点头像即可完成上传；如已设置头像，可用右上角叉号清除。
                  </p>
                </div>
                <div className="rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
                  当前账号：{username ?? '未命名账号'}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="header-profile-name">显示名称</Label>
              <Input
                id="header-profile-name"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="请输入你的显示名称"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="header-profile-username">账号</Label>
              <Input id="header-profile-username" value={username ?? ''} readOnly />
            </div>
          </div>

          <div className="space-y-4 rounded-xl border p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">个人偏好</h3>
              <p className="text-xs text-muted-foreground">这些设置只服务于当前账号的使用习惯。</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-lg border bg-background px-3 py-2">
                <div className="space-y-1">
                  <Label htmlFor="header-profile-desktop-notifications">桌面通知</Label>
                  <p className="text-xs text-muted-foreground">关键提醒优先出现在桌面端。</p>
                </div>
                <Switch
                  id="header-profile-desktop-notifications"
                  checked={preferencesDraft.desktopNotifications}
                  onCheckedChange={(checked) => setPreferencesDraft((current) => ({
                    ...current,
                    desktopNotifications: checked,
                  }))}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border bg-background px-3 py-2">
                <div className="space-y-1">
                  <Label htmlFor="header-profile-compact-mode">紧凑信息密度</Label>
                  <p className="text-xs text-muted-foreground">列表和摘要卡片更偏向高密度展示。</p>
                </div>
                <Switch
                  id="header-profile-compact-mode"
                  checked={preferencesDraft.compactMode}
                  onCheckedChange={(checked) => setPreferencesDraft((current) => ({
                    ...current,
                    compactMode: checked,
                  }))}
                />
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border bg-background px-3 py-2">
                <div className="space-y-1">
                  <Label htmlFor="header-profile-remember-module">默认回到最近模块</Label>
                  <p className="text-xs text-muted-foreground">下次进入工作台时优先回到上次处理的模块。</p>
                </div>
                <Switch
                  id="header-profile-remember-module"
                  checked={preferencesDraft.rememberLastModule}
                  onCheckedChange={(checked) => setPreferencesDraft((current) => ({
                    ...current,
                    rememberLastModule: checked,
                  }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="header-profile-signature">个人偏好备注</Label>
              <Textarea
                id="header-profile-signature"
                value={preferencesDraft.signature}
                onChange={(event) => setPreferencesDraft((current) => ({
                  ...current,
                  signature: event.target.value,
                }))}
                placeholder="例如：优先关注财务风险、喜欢高密度列表、通知尽量前置。"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit">保存个人设置</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
