/**
 * Input: 用户服务API
 * Output: 用户管理页面
 * Pos: 系统设置子页面
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
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
import { Plus, Pencil, Trash, UserCog } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserDialog } from './components/UserDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

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

  return (
    <div className="space-y-6">
      <PageHeader 
        title="用户管理"
        description="管理系统用户及角色权限"
        backHref="/dashboard/settings?tab=users"
        backLabel="返回"
        actions={
          <Button onClick={handleCreate} className="h-10 rounded-xl">
            <Plus className="mr-2 h-4 w-4" /> 新增用户
          </Button>
        }
      />

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
            ) : users.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">暂无用户。</TableCell>
               </TableRow>
            ) : (
              users.map((user) => (
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
                    <Badge variant={user.isActive ? 'outline' : 'secondary'} className={user.isActive ? 'text-chart-3 border-chart-3/35' : ''}>
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

      <UserDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        user={editingUser}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
