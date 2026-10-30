/**
 * Input: 编辑/删除回调、确认文案、可选额外菜单项
 * Output: 行内「更多 ▾」菜单；删除必须经过确认对话框
 * Pos: 通用 UI 组件，DataTable 行操作列使用（UX 规范 §8.5）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface RowActionsMenuProps {
  onEdit?: () => void;
  /** 确认后才会调用；返回 Promise 时等它结束再关闭对话框 */
  onDelete?: () => void | Promise<void>;
  /** 菜单项文案，如「停用」；默认「删除」 */
  deleteLabel?: string;
  /** 确认对话框标题/说明，如「停用港口「深圳港」？」 */
  confirmTitle?: string;
  confirmDescription?: string;
  /** 编辑/删除之外的菜单项（DropdownMenuItem） */
  children?: ReactNode;
  /** 无障碍名称，默认「更多操作」 */
  ariaLabel?: string;
}

/** 职责：把行内编辑/删除收进「更多」，删除总是先确认（对话框放在菜单外，避免菜单关闭时卸载） */
export function RowActionsMenu({
  onEdit,
  onDelete,
  deleteLabel = '删除',
  confirmTitle,
  confirmDescription = '此操作确认后立即生效。',
  children,
  ariaLabel = '更多操作',
}: RowActionsMenuProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const runDelete = async () => {
    if (!onDelete) return;
    setPending(true);
    try {
      await onDelete();
    } finally {
      setPending(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs"
            aria-label={ariaLabel}
            onClick={(event) => event.stopPropagation()}
          >
            更多
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
          {onEdit ? <DropdownMenuItem onSelect={onEdit}>编辑</DropdownMenuItem> : null}
          {children}
          {onDelete ? (
            <>
              {onEdit || children ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setConfirmOpen(true)}
              >
                {deleteLabel}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {onDelete ? (
        <AlertDialog open={confirmOpen} onOpenChange={(open) => !pending && setConfirmOpen(open)}>
          <AlertDialogContent onClick={(event) => event.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmTitle ?? `确定要${deleteLabel}吗？`}</AlertDialogTitle>
              <AlertDialogDescription>{confirmDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={(event) => {
                  // 默认会立刻关闭对话框；这里自己控制，等 onDelete 结束再关
                  event.preventDefault();
                  void runDelete();
                }}
              >
                {pending ? '处理中...' : `确认${deleteLabel}`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
