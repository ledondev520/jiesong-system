/**
 * Input: userService API、UserDialog
 * Output: 用户管理页面（表格、角色标签、权限矩阵）
 * Pos: 系统设置 > 用户管理
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/hooks/useTableSort';
import { format } from 'date-fns';
import { User, Role } from '@/types';
import { userService } from '@/services/user.service';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/PageHeader';
import { toast } from 'sonner';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { Input } from '@/components/ui/input';
import { Search, X, Plus, Pencil, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserDialog } from '../../users/components/UserDialog';
import { PermissionMatrix } from '@/components/settings/PermissionMatrix';
import { MobileListCard } from '@/components/mobile';


const ROLE_META: Record<Role, { label: string; className: string }> = {
  [Role.BOSS]: { label: '老板（只读）', className: 'bg-sky-50 text-sky-700 border-sky-200' },
  [Role.ADMIN]: { label: '管理员', className: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800' },
  [Role.PURCHASE]: { label: '采购', className: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800' },
  [Role.SALES]: { label: '销售', className: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800' },
  [Role.FINANCE]: { label: '财务', className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' },
  [Role.WAREHOUSE]: { label: '仓库', className: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:border-slate-800' },
};

function RoleBadge({ role }: { role: Role }) {
  const meta = ROLE_META[role] || { label: role, className: '' };
  return (
    <Badge variant="outline" className={`text-[11px] font-medium ${meta.className}`}>
      {meta.label}
    </Badge>
  );
}

export default function SettingsUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await userService.getAll({ page: 1, pageSize: 100 });
      setUsers(response.data?.items || []);
    } catch {
      toast.error('加载用户失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingUser(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除此用户吗？')) {
      try {
        await userService.delete(id);
        setUsers(users.filter((u) => u.id !== id));
        toast.success('用户已删除');
      } catch {
        toast.error('删除失败');
      }
    }
  };

  const handleSubmit = async (data: Partial<User>) => {
    try {
      if (editingUser) {
        await userService.update(editingUser.id, data);
        toast.success('用户更新成功');
      } else {
        await userService.create(data);
        toast.success('用户创建成功');
      }
      setIsDialogOpen(false);
      loadUsers();
    } catch {
      toast.error(editingUser ? '更新失败' : '创建失败');
    }
  };

  const filteredUsers = useMemo(() => {
    if (!keyword.trim()) return users;
    const q = keyword.toLowerCase().trim();
    return users.filter(
      (u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        String(u.role ?? '').toLowerCase().includes(q)
    );
  }, [users, keyword]);

  const sort = useTableSort<User, string>(
    filteredUsers,
    useCallback((item, key) => {
      switch (key) {
        case 'name':
          return item.name ?? '';
        case 'username':
          return item.username ?? '';
        case 'role':
          return String(item.role ?? '');
        case 'lastLoginAt':
          return item.lastLoginAt ? new Date(item.lastLoginAt).getTime() : null;
        default:
          return null;
      }
    }, [])
  );

  const totalPages = Math.ceil(sort.sortedData.length / pageSize);
  const pagedUsers = sort.sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <PageHeader
        title="用户管理"
        description="管理系统用户账号与角色权限"
        actions={
          <Button onClick={handleCreate} className="h-10 rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            新增用户
          </Button>
        }
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 h-10 rounded-xl border-border/70 bg-background/70"
              placeholder="搜索姓名、账号、邮箱、角色..."
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setCurrentPage(1); }}
            />
          </div>
          {keyword && (
            <Button variant="ghost" size="sm" className="h-10 rounded-xl" onClick={() => { setKeyword(''); setCurrentPage(1); }}>
              <X className="mr-1 h-4 w-4" />
              重置
            </Button>
          )}
        </div>

        {/* 移动端卡片 */}
        <div className="space-y-3 md:hidden">
          {loading ? (
            <div className="surface-panel py-10 text-center text-sm text-muted-foreground">加载中...</div>
          ) : pagedUsers.length === 0 ? (
            <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
              {keyword ? '没有匹配的用户' : '暂无用户'}
            </div>
          ) : (
            pagedUsers.map((user) => (
              <MobileListCard
                key={user.id}
                title={user.name}
                subtitle={user.username}
                badge={<RoleBadge role={user.role} />}
                fields={[
                  { label: '状态', value: user.isActive ? '正常' : '未开通/停用' },
                  { label: '最后登录', value: user.lastLoginAt ? format(new Date(user.lastLoginAt), 'MM-dd HH:mm') : '从未登录' },
                ]}
                action={
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-10 flex-1 rounded-xl" onClick={() => handleEdit(user)}>
                      <Pencil className="mr-1 h-4 w-4" /> 编辑
                    </Button>
                    <Button variant="ghost" size="sm" className="h-10 rounded-xl px-3" onClick={() => handleDelete(user.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                }
              />
            ))
          )}
        </div>

        {/* 桌面端表格 */}
        <div className="hidden md:block surface-panel overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-muted-foreground">用户</TableHead>
                <SortableTableHead
                  sortKey="username"
                  currentSortKey={sort.sortKey}
                  currentSortDir={sort.sortDir}
                  onSort={sort.onSort}
                >
                  账号
                </SortableTableHead>
                <SortableTableHead
                  sortKey="role"
                  currentSortKey={sort.sortKey}
                  currentSortDir={sort.sortDir}
                  onSort={sort.onSort}
                >
                  角色
                </SortableTableHead>
                <TableHead className="text-muted-foreground">状态</TableHead>
                <SortableTableHead
                  sortKey="lastLoginAt"
                  currentSortKey={sort.sortKey}
                  currentSortDir={sort.sortDir}
                  onSort={sort.onSort}
                >
                  最后登录
                </SortableTableHead>
                <TableHead className="w-[100px] text-muted-foreground">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
                </TableRow>
              ) : pagedUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">暂无用户。</TableCell>
                </TableRow>
              ) : (
                pagedUsers.map((user) => (
                  <TableRow key={user.id} className="group transition-colors hover:bg-muted/40">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-border/60">
                          {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
                          <AvatarFallback className="text-xs font-semibold">{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email || '-'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.username}</TableCell>
                    <TableCell><RoleBadge role={user.role} /></TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? 'outline' : 'secondary'} className={user.isActive ? 'border-primary/20 bg-primary/5 text-primary text-[11px]' : 'text-[11px]'}>
                        {user.isActive ? '正常' : '未开通/停用'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.lastLoginAt ? format(new Date(user.lastLoginAt), 'yyyy-MM-dd HH:mm') : '从未登录'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(user)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(user.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>共 {sort.sortedData.length} 条，第 {currentPage}/{totalPages} 页</span>
            <div className="flex items-center gap-2">
              <PageSizeSelect value={pageSize} onChange={(size) => { setPageSize(size); setCurrentPage(1); }} />
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>上一页</Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>下一页</Button>
            </div>
          </div>
        )}
      </div>

      <PermissionMatrix />

      <UserDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} user={editingUser} onSubmit={handleSubmit} />
    </div>
  );
}
