/**
 * Input: 用户服务API
 * Output: 用户管理页面
 * Pos: 系统设置子页面
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Plus, Pencil, Trash, UserCog, Search, X } from 'lucide-react';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { ModuleTabHeader, ADMIN_TABS } from '@/components/layout/ModuleTabHeader';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserDialog } from './components/UserDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  // 分页状态
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

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case Role.ADMIN: return <SemanticBadge tone="danger">管理员</SemanticBadge>;
      case Role.PURCHASE: return <SemanticBadge tone="info">采购</SemanticBadge>;
      case Role.SALES: return <SemanticBadge tone="success">销售</SemanticBadge>;
      case Role.FINANCE: return <SemanticBadge tone="warning">财务</SemanticBadge>;
      case Role.WAREHOUSE: return <SemanticBadge tone="secondary">仓库</SemanticBadge>;
      default: return <SemanticBadge tone="secondary">{role}</SemanticBadge>;
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
        setUsers(users.filter(u => u.id !== id));
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

  // 客户端关键词筛选（姓名、账号、邮箱、角色）
  const filteredUsers = useMemo(() => {
    if (!keyword.trim()) {
      return users;
    }
    const q = keyword.toLowerCase().trim();
    return users.filter((u) => {
      const roleStr = String(u.role ?? '');
      return (
        (u.name || '').toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        roleStr.toLowerCase().includes(q)
      );
    });
  }, [users, keyword]);

  const totalPages = Math.ceil(filteredUsers.length / pageSize);
  const pagedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
      <PageHeader 
        title="用户管理"
        description="管理系统用户及角色权限"
        actions={
          <Button onClick={handleCreate} className="h-10 rounded-xl">
            <Plus className="mr-2 h-4 w-4" /> 新增用户
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            placeholder="搜索姓名、账号、邮箱、角色..."
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
        {keyword && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setKeyword('');
              setCurrentPage(1);
            }}
          >
            <X className="h-4 w-4 mr-1" />
            重置
          </Button>
        )}
      </div>

      <div className="surface-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>账号</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>最后登录</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
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
                <TableRow key={user.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 border border-border/60">
                        {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
                        <AvatarFallback>{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex items-center gap-1.5">
                        <UserCog className="h-4 w-4 text-muted-foreground" />
                        {user.name}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{getRoleBadge(user.role)}</TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? 'outline' : 'secondary'} className={user.isActive ? 'border-primary/20 bg-primary/5 text-primary' : ''}>
                      {user.isActive ? '正常' : '禁用'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.lastLoginAt ? format(new Date(user.lastLoginAt), 'yyyy-MM-dd HH:mm') : '从未登录'}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button variant="ghost" size="icon" className="rounded-xl border border-border/65 bg-background/55" onClick={() => handleEdit(user)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="rounded-xl border border-border/65 bg-background/55" onClick={() => handleDelete(user.id)}>
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 分页控制 */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {filteredUsers.length} 条{totalPages > 1 ? `，第 ${currentPage}/${totalPages} 页` : ''}</span>
        <div className="flex items-center gap-2">
          <PageSizeSelect
            value={pageSize}
            onChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages <= 1}
          >
            下一页
          </Button>
        </div>
      </div>

      <UserDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        user={editingUser}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
