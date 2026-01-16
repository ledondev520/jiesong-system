'use client';

import { useState, useEffect } from 'react';
import { User, Role } from '@/types';
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
import { Plus, Pencil, Trash, UserCog } from 'lucide-react';
import { UserDialog } from './components/UserDialog';
import { toast } from 'sonner';

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
      // Mock Data
      await new Promise(r => setTimeout(r, 500));
      setUsers([
        { id: '1', username: 'admin', name: '系统管理员', role: Role.ADMIN, isActive: true, createdAt: '', updatedAt: '' },
        { id: '2', username: 'buyer01', name: '采购小李', role: Role.PURCHASE, isActive: true, createdAt: '', updatedAt: '' },
        { id: '3', username: 'sales01', name: '销售小王', role: Role.SALES, isActive: true, createdAt: '', updatedAt: '' },
      ]);
    } catch (error) {
      toast.error('加载用户失败');
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case Role.ADMIN: return <Badge className="bg-red-500">管理员</Badge>;
      case Role.PURCHASE: return <Badge className="bg-blue-500">采购</Badge>;
      case Role.SALES: return <Badge className="bg-green-500">销售</Badge>;
      default: return <Badge>{role}</Badge>;
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
      setUsers(users.filter(u => u.id !== id));
      toast.success('用户已删除');
    }
  };

  const handleSubmit = async (data: any) => {
    if (editingUser) {
      setUsers(users.map(u => u.id === editingUser.id ? { ...u, ...data } : u));
      toast.success('用户更新成功');
    } else {
      setUsers([...users, { id: Math.random().toString(), ...data, isActive: true, createdAt: '', updatedAt: '' }]);
      toast.success('用户创建成功');
    }
    setIsDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">用户管理</h2>
          <p className="text-muted-foreground">管理系统用户及角色权限。</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" /> 新增用户
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>账号</TableHead>
              <TableHead>角色</TableHead>
              <TableHead>状态</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={5} className="text-center py-10">加载中...</TableCell>
               </TableRow>
            ) : users.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={5} className="text-center py-10">暂无用户。</TableCell>
               </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <UserCog className="h-4 w-4 text-muted-foreground" />
                    {user.name}
                  </TableCell>
                  <TableCell>{user.username}</TableCell>
                  <TableCell>{getRoleBadge(user.role)}</TableCell>
                  <TableCell>
                    <Badge variant={user.isActive ? 'outline' : 'secondary'} className={user.isActive ? 'text-green-600 border-green-200' : ''}>
                      {user.isActive ? '正常' : '禁用'}
                    </Badge>
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(user)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)}>
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
