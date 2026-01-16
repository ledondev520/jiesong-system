'use client';

import { useState, useEffect } from 'react';
import { Store } from '@/types';
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
import { Plus, Pencil, Trash, MapPin } from 'lucide-react';
import { StoreDialog } from './components/StoreDialog';
import { toast } from 'sonner';
import { PORTS } from '@/lib/constants';

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    setLoading(true);
    try {
      // Mock Data
      await new Promise(r => setTimeout(r, 500));
      setStores([
        { 
          id: '1', 
          name: 'Ceritos Store', 
          portId: '1', // LA
          contactName: 'John Doe', 
          contactPhone: '555-0123',
          address: '123 Main St, Ceritos, CA',
          isActive: true, 
          createdAt: '', 
          updatedAt: '' 
        },
        { 
          id: '2', 
          name: 'Anaheim Store', 
          portId: '1', // LA
          contactName: 'Jane Smith', 
          isActive: true, 
          createdAt: '', 
          updatedAt: '' 
        },
      ]);
    } catch (error) {
      toast.error('加载门店失败');
    } finally {
      setLoading(false);
    }
  };

  const getPortName = (portId: string) => {
    const port = PORTS.find(p => p.id === portId);
    return port ? `${port.name} (${port.code})` : '未知港口';
  };

  const handleCreate = () => {
    setEditingStore(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (store: Store) => {
    setEditingStore(store);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除此门店吗？')) {
      setStores(stores.filter(s => s.id !== id));
      toast.success('门店已删除');
    }
  };

  const handleSubmit = async (data: any) => {
    if (editingStore) {
      setStores(stores.map(s => s.id === editingStore.id ? { ...s, ...data } : s));
      toast.success('门店更新成功');
    } else {
      setStores([...stores, { id: Math.random().toString(), ...data, isActive: true, createdAt: '', updatedAt: '' }]);
      toast.success('门店创建成功');
    }
    setIsDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">客户门店</h2>
          <p className="text-muted-foreground">管理客户门店及所属港口。</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" /> 新增门店
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>门店名称</TableHead>
              <TableHead>港口</TableHead>
              <TableHead>联系人</TableHead>
              <TableHead>地址</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={5} className="text-center py-10">加载中...</TableCell>
               </TableRow>
            ) : stores.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={5} className="text-center py-10">暂无门店数据。</TableCell>
               </TableRow>
            ) : (
              stores.map((store) => (
                <TableRow key={store.id}>
                  <TableCell className="font-medium">{store.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="flex w-fit gap-1 items-center">
                      <MapPin className="h-3 w-3" />
                      {getPortName(store.portId)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>{store.contactName}</div>
                    <div className="text-xs text-muted-foreground">{store.contactPhone}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground truncate max-w-[200px]" title={store.address}>
                    {store.address}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(store)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(store.id)}>
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <StoreDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        store={editingStore}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
